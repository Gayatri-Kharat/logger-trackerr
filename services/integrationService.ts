/// <reference types="vite/client" />
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
  const isLocal = import.meta.env?.DEV ?? false;
  
  if (isLocal) {
    try {
      if (!originalUrl.startsWith('http')) {
           return { url: originalUrl, headers: {} };
      }
      
      const urlObj = new URL(originalUrl);
      if (urlObj.origin === window.location.origin) {
          return { url: originalUrl, headers: {} };
      }

      const proxyUrl = `/cors-proxy?__target=${encodeURIComponent(originalUrl)}`;
      return { url: proxyUrl, headers: {} };
    } catch (e) {
      console.warn("[IntegrationService] Failed to parse URL for proxying:", e);
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

  const urlObj = new URL(apiEndpoint);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  const originalPath = urlObj.pathname;

  // PRIORITY LIST: Try these paths in order
  const candidates = [
    originalPath,                                   // 1. Configured Path
    '/lightTracer/v1/managementLoggers',            // 2. Standard Application Path (Fix for 403s)
    '/actuator/loggers',                            // 3. Spring Boot Actuator
    originalPath.replace('/v1', ''),                // 4. Fallback variations...
    '/management/loggers',                          
    '/loggers'
  ];

  const uniquePaths = [...new Set(candidates)].filter(p => p && p !== '/');
  let lastError: Error | null = null;

  for (const path of uniquePaths) {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const targetUrl = `${baseUrl}${cleanPath}`.replace(/([^:]\/)\/+/g, "$1");
      
      try {
          const result = await executeFetch(targetUrl, token, discoveryPayload, method);
          console.log(`[Discovery] Connected successfully to: ${targetUrl}`);
          return { services: result, resolvedUrl: targetUrl };
      } catch (err: any) {
          console.warn(`[Discovery] Attempt failed at ${targetUrl}: ${err.message}`);
          lastError = err;
          // Stop on explicit Auth failure, retry on 404/Connection Refused
          if (err.message.includes('401')) throw err;
      }
  }

  throw lastError || new Error("Failed to discover services. Please check the URL or your VPN connection.");
}

async function executeFetch(targetUrl: string, token: string, payload: any, method: string): Promise<Service[]> {
    const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(targetUrl);
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...proxyHeaders
    };

    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options: RequestInit = {
        method: method,
        headers: headers,
        referrerPolicy: 'no-referrer'
    };

    if (method === 'POST') options.body = JSON.stringify(payload);

    const response = await fetch(fetchUrl, options);

    if (!response.ok) {
        let errorDetails = response.statusText;
        try {
            const text = await response.text();
            if (text) errorDetails = text;
        } catch (e) {}
        throw new Error(`HTTP ${response.status}: ${errorDetails.substring(0, 100)}`);
    }

    const data = await response.json();
    let rawList: any[] = [];
    
    if (Array.isArray(data)) rawList = data;
    else if (data.data && Array.isArray(data.data)) rawList = data.data;
    else if (data.services && Array.isArray(data.services)) rawList = data.services;
    else if (data.loggers && typeof data.loggers === 'object') {
        rawList = Object.entries(data.loggers).map(([key, val]: [string, any]) => ({
            id: key, 
            name: key, 
            defaultLevel: val.configuredLevel || val.effectiveLevel || 'INFO'
        }));
    }

    if (rawList.length === 0 && (data.id || data.name)) rawList = [data];

    return rawList.map((s: any) => ({
        id: String(s.id || s.serviceId || s.name),
        name: String(s.name || s.serviceName || s.id),
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
  
  // Always try the standard path as a fallback for updates
  let baseUrl = apiEndpoint;
  try {
      const u = new URL(apiEndpoint);
      baseUrl = `${u.protocol}//${u.host}`;
  } catch(e) {}

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