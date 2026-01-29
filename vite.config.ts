
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

// Shared Proxy Logic to avoid duplication
const createProxyHandler = (rewritePath = false) => ({
    target: 'https://jsonplaceholder.typicode.com', // Default fallback
    agent: secureAgent,
    changeOrigin: true,
    secure: false,      
    timeout: 60000,
    
    // 1. Router: Determine target based on the custom header OR query param
    router: (req: any) => {
        // Strategy A: Header-based Routing (Preferred)
        const targetHeader = req.headers['x-target-origin'];
        if (targetHeader) {
            return targetHeader;
        }

        // Strategy B: Query Parameter Routing (Fallback/Legacy)
        if (req.url && req.url.includes('__target=')) {
            try {
                const urlObj = new URL(req.url, 'http://localhost');
                const targetParam = urlObj.searchParams.get('__target');
                if (targetParam) {
                    return targetParam;
                }
            } catch (e) {
                // ignore parse errors
            }
        }

        return 'https://jsonplaceholder.typicode.com';
    },

    // 2. Rewrite: Clean up the path before forwarding
    rewrite: (path: string) => {
        let processedPath = path;

        // If this is the generic proxy, strip the prefix
        if (rewritePath) {
             processedPath = processedPath.replace(/^\/cors-proxy/, '');
        }

        // Clean up __target query param if present so upstream doesn't see it
        if (processedPath.includes('__target=')) {
            const parts = processedPath.split('?');
            if (parts.length > 1) {
                 const pathname = parts[0];
                 const search = parts[1];
                 const searchParams = new URLSearchParams(search);
                 if (searchParams.has('__target')) {
                    searchParams.delete('__target');
                    const newSearch = searchParams.toString();
                    processedPath = newSearch ? `${pathname}?${newSearch}` : pathname;
                 }
            }
        }
        
        return processedPath;
    },

    // 3. Configure: Spoof headers to satisfy backend WAF/Gateway
    configure: (proxy: any, _options: any) => {
        proxy.on('proxyReq', (proxyReq: any, req: any, _res: any) => {
            try {
                // CRITICAL FIX FOR EMPTY PREVIEW:
                // Remove Accept-Encoding to force the backend to send uncompressed JSON.
                // This prevents issues where the proxy/browser mishandles gzip/br encoding.
                proxyReq.removeHeader('accept-encoding');

                let targetOrigin = req.headers['x-target-origin'];
                
                if (!targetOrigin && req.url.includes('__target=')) {
                    try {
                        const urlObj = new URL(req.url, 'http://localhost');
                        targetOrigin = urlObj.searchParams.get('__target');
                    } catch(e) {}
                }

                if (targetOrigin) {
                    // FIX 403: Backend expects these headers to match its own domain
                    proxyReq.setHeader('Origin', targetOrigin);
                    // spoof referer to match target origin (often required by WAFs)
                    proxyReq.setHeader('Referer', targetOrigin + '/');
                    
                    // Impersonate Browser
                    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                    
                    // Remove proxy tracking headers.
                    const removeHeaders = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-forwarded-for', 'via', 'x-target-origin'];
                    removeHeaders.forEach(h => proxyReq.removeHeader(h));
                    
                    console.log(`[Proxy] Routing ${req.url} -> ${targetOrigin}`);
                }
                
                // Ensure connection closes to prevent hangs
                proxyReq.setHeader('Connection', 'close');
            } catch (err) {
                console.error('[Proxy] Request Config Error:', err);
            }
        });

        // 4. Response: Ensure the browser allows the response (Fixes "CORS" 403s)
        proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
             // Force Allow Origin for the browser's sake
             proxyRes.headers['Access-Control-Allow-Origin'] = '*'; 
             proxyRes.headers['Access-Control-Allow-Headers'] = '*';
             proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
             
             // INTERCEPT 403 ON OPTIONS:
             // If the backend (Zscaler) blocks the Preflight (OPTIONS) with 403, 
             // we override it to 200 OK.
             if (req.method === 'OPTIONS') {
                if (proxyRes.statusCode !== 200) {
                     console.log('[Proxy] Converting OPTIONS ' + proxyRes.statusCode + ' to 200 OK');
                     proxyRes.statusCode = 200;
                     proxyRes.statusMessage = 'OK';
                     // Nuke body-related headers to avoid client confusion if we pass the original body
                     delete proxyRes.headers['content-length'];
                     delete proxyRes.headers['content-type'];
                }
             }
        });
        
        // 5. Error Handling
        proxy.on('error', (err: any, _req: any, res: any) => {
            console.error('[Proxy] Error:', err);
            if (!res.headersSent) {
                 res.writeHead(500, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify({ error: 'Proxy Error', details: err.message }));
        });
    }
} as any);
 
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    cors: true, 
    proxy: {
      '/auth': {
        target: 'https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com',
        agent: secureAgent,
        changeOrigin: true,
        secure: false,
        timeout: 60000
      },
      '/lightTracer': createProxyHandler(false),
      '/cors-proxy': createProxyHandler(true)
    }
  }
})
