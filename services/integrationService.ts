
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
  // USER REQUEST: Disable automatic proxying to localhost.
  // The application will now attempt to hit the API endpoints directly.
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
          if (result.length > 0 || path === originalPath) {
             console.log(`[Discovery] Connected successfully to: ${targetUrl}`);
             return { services: result, resolvedUrl: targetUrl };
          }
      } catch (err: any) {
          console.warn(`[Discovery] Attempt failed at ${targetUrl}: ${err.message}`);
          lastError = err;
          // Stop on explicit Auth/Permission failure
          if (err.message && (err.message.includes('401') || err.message.includes('403'))) throw err;
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
        response = await fetch(fetchUrl, { ...options, cache: 'no-store', keepalive: true });
    } catch (e: any) {
        console.warn(`[Discovery] Network request failed for ${fetchUrl}`, e);
        throw new Error("Network blocked. The corporate gateway rejected the connection (CORS).");
    }

    if (!response) {
        throw new Error("No response received from the server.");
    }

    if (response.status === 403) {
        throw new Error("HTTP 403 Forbidden: Access Denied. Your credentials may lack permission to access managementLoggers.");
    }

    let data: any = null;
    let rawList: any[] = [];

    try {
        const text = await response.text();
        if (text) {
             console.log("[Discovery] Raw Response Preview:", text.substring(0, 500));
        }

        if (text) {
            try {
                data = JSON.parse(text);
                rawList = findServiceArray(data);
            } catch (_e) {
                console.warn("[Discovery] JSON Parse failed, raw text:", text.substring(0, 100));
            }
        }
    } catch (e) {
        console.warn("[Discovery] Response reading failed", e);
    }

    if (!response.ok && rawList.length === 0) {
        let errorDetails = response.statusText;
        if (data && (data.message || data.error)) {
            errorDetails = data.message || data.error;
        }
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorDetails).substring(0, 100)}`);
    }

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
  // Standardize standardUrl to ensure no double slashes
  const standardUrl = `${baseUrl}${standardPath}`.replace(/([^:]\/)\/+/g, "$1");

  // If apiEndpoint already contains the path, this array will effectively be deduped to 1 entry
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
        
        if (response.status === 403) {
            console.warn(`[Update] 403 Forbidden at ${candidate.url} - check permissions.`);
            continue;
        }

        if (response.ok) {
             console.log(`[Update] Success at ${fetchUrl}`);
             return true;
        } else {
             // Explicitly warn so user sees why it failed in console, then continue to next candidate
             console.warn(`[Update] Request to ${candidate.url} returned HTTP ${response.status}. Trying next candidate if available.`);
        }
      } catch (e) {
        console.error(`[Update] Network error at ${candidate.url}`, e);
      }
  }
  return false;
}
