import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Agent } from 'https';
 
// CRITICAL FIX: "Socket Hang Up" usually occurs when the proxy tries to reuse
// connections (Keep-Alive) that the backend (Keycloak) has already closed.
// We switch to { keepAlive: false } to ensure a fresh connection for every request.
const secureAgent = new Agent({
  keepAlive: false,
  rejectUnauthorized: false, // Allow self-signed certs (common in internal envs)
  maxSockets: 50,
  timeout: 60000
});
 
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    proxy: {
      // Simple path-based proxy for Keycloak auth endpoints
      '/auth': {
        target: 'https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com',
        agent: secureAgent,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        configure: (proxy: any, _options: any) => {
          proxy.on('proxyReq', (proxyReq: any, req: any) => {
            console.log(`[Auth Proxy] ${req.method} ${req.url}`);
            proxyReq.setHeader('Connection', 'close');
            proxyReq.removeHeader('Origin');
          });
          proxy.on('error', (err: any) => {
            console.error('[Auth Proxy] Error:', err.message);
          });
        }
      },
      
      // Legacy: Complex query-param based proxy for other services
      '/cors-proxy': {
        // Default target (will be overridden by router)
        target: 'https://jsonplaceholder.typicode.com',
        
        // Critical: Attach the custom agent to the proxy instance
        agent: secureAgent,
        
        changeOrigin: true,
        secure: false,      
        
        timeout: 60000,     // 60s timeout
        proxyTimeout: 60000,
 
        // 1. ROUTER: Determine actual target origin from query param
        router: (req: any) => {
            try {
                // req.url contains e.g., "/cors-proxy?__target=https%3A%2F%2F..."
                const urlString = req.url || '';
                const dummyBase = 'http://localhost';
                const fullRequestUrl = new URL(urlString, dummyBase);
                
                const targetParam = fullRequestUrl.searchParams.get('__target');
                
                if (targetParam) {
                    const targetUrlObj = new URL(targetParam);
                    console.log(`[Proxy] Routing request to Origin: ${targetUrlObj.origin}`);
                    return targetUrlObj.origin;
                }
            } catch (e) {
                console.error('[Proxy] Router parsing error:', e);
            }
            
            console.warn('[Proxy] No __target found, falling back to jsonplaceholder (Expect 404)');
            return 'https://jsonplaceholder.typicode.com';
        },
 
        // 2. REWRITE: Extract the actual path from the __target param
        rewrite: (path: string) => {
            try {
                const dummyBase = 'http://localhost';
                const urlObj = new URL(path, dummyBase);
                const targetParam = urlObj.searchParams.get('__target');
 
                // Flat Proxy Strategy: Use the path from the target URL
                if (targetParam) {
                    const targetUrl = new URL(targetParam);
                    // Return the path + query from the intended target
                    return targetUrl.pathname + targetUrl.search;
                }
            } catch (e) {
                console.error('[Proxy] Rewrite parsing error:', e);
            }
 
            // Fallback: Just strip the prefix (Legacy behavior)
            return path.replace(/^\/cors-proxy/, '');
        },
 
        // 3. CONFIGURE: Manually fix Host header for SNI and Log Requests
        configure: (proxy: any, _options: any) => {
            proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
                try {
                    // Fix SNI (Host Header) based on the target
                    const urlString = req.url || '';
                    const urlObj = new URL(urlString, 'http://localhost');
                    const targetParam = urlObj.searchParams.get('__target');
                    
                    if (targetParam) {
                        try {
                            const targetUrlObj = new URL(targetParam);
                            proxyReq.setHeader('Host', targetUrlObj.host);
                        } catch(e) { /* ignore */ }
                    }
 
                    // Standard cleanup
                    proxyReq.removeHeader('Origin');
                    proxyReq.removeHeader('Referer');
                    proxyReq.removeHeader('Cookie');
                    
                    // Force connection close to prevent socket hang up
                    proxyReq.setHeader('Connection', 'close');
                    proxyReq.setHeader('User-Agent', 'LoggerTracker/Proxy');
                    
                } catch (err) {
                    console.error('[Proxy] Request Config Error:', err);
                }
            });
            
            proxy.on('error', (err: any, _req: any, res: any) => {
                console.error('[Proxy] Network Error:', err.message);
                if (res && !res.headersSent) {
                    try {
                        // Special handling for socket hang up
                        const isSocketError = err.code === 'ECONNRESET' || err.message.includes('socket hang up');
                        res.writeHead(isSocketError ? 502 : 500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: "Proxy Connection Failed",
                            details: err.message,
                            code: err.code,
                            tip: "Check VPN, Network, or if the Target Server is reachable."
                        }));
                    } catch (e) { /* ignore */ }
                }
            });
        }
      } as any
    }
  }
})

 