
import type { Service, LogLevel } from "../types";
import { API_PATHS } from "../constants";

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
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = (
      hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      window.location.port === '3000'
  );
  
  if (isLocal) {
    try {
      // Handle relative URLs gracefully
      const urlObj = new URL(originalUrl, window.location.origin);
      
      // Only proxy absolute HTTP/HTTPS URLs that are NOT the current origin
      if (!originalUrl.startsWith('http')) {
           return { url: originalUrl, headers: {} };
      }

      // Loop prevention
      if (urlObj.origin === window.location.origin) {
          return { url: originalUrl, headers: {} };
      }

      // FIXED: Use flat proxy structure to avoid 404s on the proxy server.
      // Instead of /cors-proxy/path/to/resource, we send /cors-proxy?__target=FULL_URL
      const proxyUrl = `/cors-proxy?__target=${encodeURIComponent(originalUrl)}`;
      
      return { url: proxyUrl, headers: {} };
    } catch (e) {
      console.warn("[IntegrationService] Failed to parse URL for proxying:", e);
      return { url: originalUrl, headers: {} };
    }
  }

  return { url: originalUrl, headers: {} };
};

/**
 * FETCH SERVICES (GET)
 */
export async function fetchEnvironmentServices(apiEndpoint: string, token: string): Promise<DiscoveryResult> {
  if (!apiEndpoint || apiEndpoint.trim() === '') {
    throw new Error("Configuration Error: API Endpoint URL is missing.");
  }

  const executeFetch = async (targetUrl: string): Promise<DiscoveryResult> => {
    const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(targetUrl);
    
    // Debug Log
    if (fetchUrl.startsWith('/cors-proxy')) {
        console.log(`[Discovery] Proxy Active: GET ${fetchUrl}`);
    } else {
        console.log(`[Discovery] Direct: GET ${fetchUrl}`);
    }

    try {
      // FIX: Do NOT send 'Content-Type: application/json' for GET requests.
      // This allows the request to be "Simple" (per CORS spec) and often skips Preflight (OPTIONS).
      const requestHeaders: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...proxyHeaders
      };

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: requestHeaders,
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle specific Proxy Errors (502)
        if (response.status === 502) {
             let details = errorText;
             try {
                const json = JSON.parse(errorText);
                if (json.code) details = `${json.code} - ${json.details}`;
             } catch(e) {}
             throw new Error(`502 Bad Gateway: Proxy could not reach backend. (${details})`);
        }

        if (response.status === 404) {
             throw new Error(`404 Not Found: Path '${targetUrl}' does not exist.`);
        }
        
        throw new Error(`Server Error (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      
      let servicesList: any[] = [];
      if (Array.isArray(data)) {
        servicesList = data;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.data)) servicesList = data.data;
        else if (Array.isArray(data.items)) servicesList = data.items;
        else if (Array.isArray(data.services)) servicesList = data.services;
        else if (Array.isArray(data.content)) servicesList = data.content;
        else if (data.loggers && typeof data.loggers === 'object') {
            servicesList = Object.entries(data.loggers).map(([key, val]: [string, any]) => ({
                id: key,
                name: key,
                defaultLevel: val.configuredLevel || val.effectiveLevel || 'INFO'
            }));
        }
      }

      if (servicesList.length === 0 && !Array.isArray(data) && !data.data && !data.loggers) {
         return { services: [], resolvedUrl: targetUrl };
      }

      const mappedServices = servicesList.map((item: any) => ({
        id: String(item.id || item.serviceId || item.name || 'unknown-id'),
        name: String(item.name || item.serviceName || item.id || 'Unknown Service'),
        defaultLevel: (item.defaultLevel || item.level || 'INFO').toUpperCase()
      })) as Service[];

      return { services: mappedServices, resolvedUrl: targetUrl };

    } catch (error: any) {
      throw error;
    }
  };

  try {
    return await executeFetch(apiEndpoint);
  } catch (error: any) {
    console.warn(`Primary discovery fetch failed: ${error.message}`);
    
    // Auto-Fallback Logic
    // If we got a 502, the network is broken, retrying different paths likely won't help unless the path itself was invalid.
    // If we got a 404, we can try other paths.
    
    if (error.message.includes('404')) {
        if (apiEndpoint.includes('managementLoggers')) {
            const singularUrl = apiEndpoint.replace('managementLoggers', 'managementLogger');
            try { return await executeFetch(singularUrl); } catch (e) { }
        }

        if (apiEndpoint.includes('/lightTracer/v1/')) {
            const rootUrl = apiEndpoint.replace('/lightTracer/v1/', '/lightTracer/');
            try { return await executeFetch(rootUrl); } catch (e) { }
        }
        
        if (apiEndpoint.match(/\/v\d+\//)) {
            const noVersionUrl = apiEndpoint.replace(/\/v\d+\//, '/');
             try { return await executeFetch(noVersionUrl); } catch (e) { }
        }

        try {
            const urlObj = new URL(apiEndpoint);
            const actuatorUrl = `${urlObj.origin}/actuator/loggers`;
            return await executeFetch(actuatorUrl);
        } catch (e) { }
    }

    throw error;
  }
}

/**
 * UPDATE LOG LEVEL (POST)
 */
export async function updateServiceLogLevel(
  discoveryEndpoint: string, 
  serviceId: string, 
  level: LogLevel, 
  durationMs: number, 
  token: string
): Promise<boolean> {
  
  let updateUrl = discoveryEndpoint;

  // Use simple heuristic to guess update endpoint if not explicit
  if (!updateUrl.endsWith('managementLoggers') && !updateUrl.endsWith('managementLogger')) {
       if (API_PATHS.DISCOVERY && discoveryEndpoint.endsWith(API_PATHS.DISCOVERY)) {
        updateUrl = discoveryEndpoint.replace(API_PATHS.DISCOVERY, API_PATHS.UPDATE_LEVEL);
      } else if (API_PATHS.UPDATE_LEVEL) {
        const base = discoveryEndpoint.endsWith('/') ? discoveryEndpoint.slice(0, -1) : discoveryEndpoint;
        const path = API_PATHS.UPDATE_LEVEL.startsWith('/') ? API_PATHS.UPDATE_LEVEL : `/${API_PATHS.UPDATE_LEVEL}`;
        updateUrl = `${base}${path}`;
      }
  }

  const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(updateUrl);
  
  try {
    const requestHeaders: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json', // KEEP Content-Type for POST
        'Accept': 'application/json',
        ...proxyHeaders
    };

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        serviceId,
        level,
        duration: durationMs,
        timestamp: Date.now()
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
        const txt = await response.text();
        console.error(`Update failed: ${response.status} - ${txt}`);
        return false;
    }

    return response.ok;

  } catch (error) {
    console.error("Network error updating log level:", error);
    return false;
  }
}