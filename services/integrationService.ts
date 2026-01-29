
import type { Service, LogLevel } from "../types";

export interface DiscoveryResult {
  services: Service[];
  resolvedUrl: string;
}

interface ProxyConfig {
  url: string;
  headers: Record<string, string>;
}

// Helper to determine proxy URL
const getProxyConfig = (originalUrl: string): ProxyConfig => {
  // Check if we are in dev mode OR if we are serving from localhost (preview mode)
  const isLocal = (import.meta as any).env?.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (isLocal) {
    try {
      if (!originalUrl.startsWith('http')) {
           return { url: originalUrl, headers: {} };
      }
      
      const urlObj = new URL(originalUrl);
      if (urlObj.origin === window.location.origin) {
          return { url: originalUrl, headers: {} };
      }

      // NEW STRATEGY: Header-based Routing with Cleaner URLs
      // 1. If path is a known app path, use it directly (cleaner URL in network tab)
      //    Vite proxy must be configured to capture '/lightTracer'
      if (urlObj.pathname.startsWith('/lightTracer')) {
          return { 
             url: `${urlObj.pathname}${urlObj.search}`,
             headers: { 'x-target-origin': urlObj.origin }
          };
      }

      // 2. Fallback: Use /cors-proxy prefix
      const proxyUrl = `/cors-proxy${urlObj.pathname}${urlObj.search}`;
      
      return { 
          url: proxyUrl, 
          headers: { 
              'x-target-origin': urlObj.origin 
          } 
      };
    } catch (_e) {
      console.warn("[IntegrationService] Failed to parse URL for proxying.");
      return { url: originalUrl, headers: {} };
    }
  }
  return { url: originalUrl, headers: {} };
};

export async function fetchEnvironmentServices(
    apiEndpoint: string, 
    token: string,
    discoveryPayload: Record<string, any> = {},
    method: 'GET' | 'POST' = 'GET' 
): Promise<DiscoveryResult> {
  if (!apiEndpoint || apiEndpoint.trim() === '') {
    throw new Error("Configuration Error: API Endpoint URL is missing.");
  }

  let urlObj: URL;
  try {
     urlObj = new URL(apiEndpoint);
  } catch (_e) {
     throw new Error(`Invalid API Endpoint URL: ${apiEndpoint}`);
  }

  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  const originalPath = urlObj.pathname;

  // PRIORITY LIST: Strict adherence to configured paths to avoid WAF blocks.
  const candidates = [
    originalPath,                                   // 1. Configured Path
    '/lightTracer/v1/managementLoggers',            // 2. Standard Application Path
  ];

  const uniquePaths = [...new Set(candidates)].filter(p => p && p !== '/');
  let lastError: Error | null = null;

  for (const path of uniquePaths) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const targetUrl = `${baseUrl}${cleanPath}`.replace(/([^:]\/)\/+/g, "$1");
      
      try {
          const result = await executeFetch(targetUrl, token, discoveryPayload, method);
          // Only return if we actually found services. If result is empty, we might want to try next candidate
          // unless it was the specific configured path.
          if (result.length > 0 || path === originalPath) {
             console.log(`[Discovery] Connected successfully to: ${targetUrl}`);
             return { services: result, resolvedUrl: targetUrl };
          }
      } catch (err: any) {
          console.warn(`[Discovery] Attempt failed at ${targetUrl}: ${err.message}`);
          lastError = err;
          // Stop on explicit Auth failure to prevent account lockouts
          if (err.message && err.message.includes('401')) throw err;
      }
  }

  throw lastError || new Error("Failed to discover services. Please check the URL or your VPN connection.");
}

// Robust function to find a list of services in any JSON structure
function findServiceArray(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    
    // 1. Check known keys (Case Insensitive)
    const keys = Object.keys(data);
    for (const key of keys) {
        const lowerKey = key.toLowerCase();
        // Check for common property names: services, data, loggers, items, list
        if ((lowerKey.includes('service') || lowerKey.includes('logger') || lowerKey === 'data' || lowerKey === 'items' || lowerKey === 'list') && Array.isArray(data[key])) {
            return data[key];
        }
    }
    
    // 2. Check for wrapped JSON strings (Double encoded responses)
    // e.g. { "d": "[{...}]" }
    for (const key of keys) {
        if (typeof data[key] === 'string') {
            try {
                const parsed = JSON.parse(data[key]);
                if (Array.isArray(parsed)) return parsed;
                if (typeof parsed === 'object') return findServiceArray(parsed); // Recurse once
            } catch (_e) {}
        }
    }

    return [];
}

async function executeFetch(targetUrl: string, token: string, payload: any, method: string): Promise<Service[]> {
    const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(targetUrl);
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'x-api-logger': 'all',
        'X-Requested-With': 'XMLHttpRequest', // Added back as it's often required by WAFs
        ...proxyHeaders
    };

    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options: RequestInit = {
        method: method,
        headers: headers,
        referrerPolicy: 'no-referrer',
    };

    if (method === 'POST') options.body = JSON.stringify(payload);

    let response: Response | undefined;
    try {
       response = await fetch(fetchUrl, options);
    } catch (e: any) {
        // This catches the specific "Failed to fetch" error caused by CORS blocks
        console.warn(`[Discovery] Network request failed for ${fetchUrl}`, e);
        throw new Error("Network blocked. The corporate gateway rejected the connection (CORS).");
    }

    if (!response) {
        throw new Error("No response received from the server.");
    }

    let data: any = null;
    let rawList: any[] = [];

    // Attempt to parse JSON regardless of status code
    try {
        const text = await response.text();
        if (text) {
            try {
                data = JSON.parse(text);
                rawList = findServiceArray(data);
            } catch (_e) {
                console.warn("[Discovery] JSON Parse failed, raw text:", text.substring(0, 100));
            }
        } else {
             console.warn("[Discovery] Response body is empty.");
        }
    } catch (e) {
        console.warn("[Discovery] Response reading failed", e);
    }

    // If we failed to get data AND the response was an error
    if (!response.ok && rawList.length === 0) {
        let errorDetails = response.statusText;
        if (data && (data.message || data.error)) {
            errorDetails = data.message || data.error;
        }
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorDetails).substring(0, 100)}`);
    }

    // Special handling: if rawList is empty but the root object looks like a service itself
    if (rawList.length === 0 && data && (data.id || data.name || data.serviceName)) {
        rawList = [data];
    }

    return rawList.map((s: any) => ({
        id: String(s.id || s.serviceId || s.name || 'unknown-id'),
        name: String(s.name || s.serviceName || s.id || 'Unknown Service'),
        defaultLevel: (s.defaultLevel || s.level || s.configuredLevel || 'INFO') as LogLevel
    }));
}

export async function updateServiceLogLevel(
  apiEndpoint: string,
  serviceId: string,
  level: LogLevel,
  durationMs: number,
  token: string
): Promise<boolean> {
  
  const payload = { serviceId, configuredLevel: level, duration: durationMs };
  
  let baseUrl = apiEndpoint;
  try {
      const u = new URL(apiEndpoint);
      baseUrl = `${u.protocol}//${u.host}`;
  } catch(_e) {}

  const standardPath = '/lightTracer/v1/managementLoggers';
  const standardUrl = `${baseUrl}${standardPath}`.replace(/([^:]\/)\/+/g, "$1");

  const candidates: { url: string; payload: any }[] = [
    { url: apiEndpoint, payload },
    { url: standardUrl, payload } // Fallback
  ];
  
  // If using actuator, try appending serviceId
  if (apiEndpoint.includes('actuator')) {
      candidates.unshift({ url: `${apiEndpoint}/${serviceId}`, payload: { configuredLevel: level } });
  }

  // Deduplicate URLs
  const uniqueCandidates = candidates.filter((v,i,a) => a.findIndex(t => t.url === v.url) === i);

  for (const candidate of uniqueCandidates) {
      const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(candidate.url);
      try {
        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-logger': 'all',
            'X-Requested-With': 'XMLHttpRequest',
            'Authorization': `Bearer ${token}`,
            ...proxyHeaders
          },
          body: JSON.stringify(candidate.payload)
        });
        if (response.ok) return true;
      } catch (e) {
        console.error(`[Update] Error at ${candidate.url}`, e);
      }
  }
  return false;
}
