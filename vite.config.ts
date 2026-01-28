
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Agent } from 'https';
 
// CRITICAL FIX: "Socket Hang Up" usually occurs when the proxy tries to reuse
// connections (Keep-Alive) that the backend (Keycloak) has already closed.
const secureAgent = new Agent({
  keepAlive: false,
  rejectUnauthorized: false, 
  maxSockets: 50,
  timeout: 60000
});
 
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    cors: true, 
    proxy: {
      // Auth Proxy
      '/auth': {
        target: 'https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com',
        agent: secureAgent,
        changeOrigin: true,
        secure: false,
        timeout: 60000
      },
      
      // Dynamic Service Proxy (Fixes 403 Forbidden)
      '/cors-proxy': {
        target: 'https://jsonplaceholder.typicode.com', // Default placeholder
        agent: secureAgent,
        changeOrigin: true,
        secure: false,      
        timeout: 60000,
 
        // 1. Router: Extract actual target from query param
        router: (req: any) => {
            try {
                const urlString = req.url || '';
                const dummyBase = 'http://localhost';
                const fullRequestUrl = new URL(urlString, dummyBase);
                const targetParam = fullRequestUrl.searchParams.get('__target');
                if (targetParam) {
                    return new URL(targetParam).origin;
                }
            } catch (e) {
                console.error('[Proxy] Router parsing error:', e);
            }
            return 'https://jsonplaceholder.typicode.com';
        },
 
        // 2. Rewrite: Clean up the path
        rewrite: (path: string) => {
            return path.replace(/^\/cors-proxy/, '');
        },
 
        // 3. Configure: Header Spoofing for 403 Avoidance
        configure: (proxy: any, _options: any) => {
            
            proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
                try {
                    const urlString = req.url || '';
                    const urlObj = new URL(urlString, 'http://localhost');
                    const targetParam = urlObj.searchParams.get('__target');
                    
                    if (targetParam) {
                        const targetUrlObj = new URL(targetParam);
                        
                        // FIX 403: Backend expects these headers to match its own domain
                        proxyReq.setHeader('Host', targetUrlObj.host);
                        proxyReq.setHeader('Origin', targetUrlObj.origin);
                        proxyReq.setHeader('Referer', targetUrlObj.origin + '/');
                        
                        // Set path correctly
                        proxyReq.path = targetUrlObj.pathname + targetUrlObj.search;

                        // Impersonate Browser
                        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                        
                        // Hide Proxy Traces
                        const removeHeaders = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-forwarded-for', 'via', 'cookie'];
                        removeHeaders.forEach(h => proxyReq.removeHeader(h));
                        
                        console.log(`[Proxy] Routing to: ${targetUrlObj.origin}${targetUrlObj.pathname}`);
                    }
                    
                    proxyReq.setHeader('Connection', 'close');
                    
                } catch (err) {
                    console.error('[Proxy] Request Config Error:', err);
                }
            });
        }
      } as any
    }
  }
})
