

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface AuthOptions {
  isUserLogin?: boolean;
  publicClientId?: string; // e.g. 'apigw' or 'admin-cli'
}

interface ProxyConfig {
  url: string;
  headers: Record<string, string>;
}

const DEFAULT_CLIENT_ID = 'apigw';

// Helper to determine proxy URL
const getProxyConfig = (originalUrl: string): ProxyConfig => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = (
      hostname === 'localhost' || 
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      window.location.port === '3000' ||
      window.location.port === '3005' ||
      window.location.port === '3005'
  );
  
  // If running locally, route through the dev server proxy to avoid CORS errors
  if (isLocal) {
    try {
      // If it's already a relative path, use it directly
      if (!originalUrl.startsWith('http')) {
           return { url: originalUrl, headers: {} };
      }
      
      const urlObj = new URL(originalUrl);
      
      // If same origin, no proxy needed
      if (urlObj.origin === window.location.origin) {
        return { url: originalUrl, headers: {} };
      }

      // Extract just the pathname for CRA/Vite proxy
      // e.g., https://keycloak.../auth/realms/apigw/protocol/openid-connect/token
      //    -> /auth/realms/apigw/protocol/openid-connect/token
      // The dev server proxy (setupProxy.js) will forward /auth/* to Keycloak
      const proxyUrl = urlObj.pathname + urlObj.search;
      console.log(`[AuthService] Proxying: ${originalUrl} -> ${proxyUrl}`);
      return { url: proxyUrl, headers: {} };
    } catch (e) {
      console.warn("[AuthService] URL Parse Error:", e);
      return { url: originalUrl, headers: {} };
    }
  }

  return { url: originalUrl, headers: {} };
};

export async function authenticate(
  authEndpoint: string, 
  principal: string, 
  secret: string,
  options: AuthOptions = {}
): Promise<AuthTokenResponse> {
  
  if (!authEndpoint) throw new Error("Auth Endpoint is required.");

  const { isUserLogin = false, publicClientId = DEFAULT_CLIENT_ID } = options;

  const executeAuthRequest = async (strategy: 'BODY' | 'BASIC' | 'PASSWORD_GRANT') => {
    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };

    const params = new URLSearchParams();
    
    if (strategy === 'PASSWORD_GRANT') {
        params.append('grant_type', 'password');
        if (publicClientId) params.append('client_id', publicClientId);
        params.append('username', principal);       
        params.append('password', secret);          
       
    } else {
        params.append('grant_type', 'client_credentials');
        
        
        if (strategy === 'BASIC') {
            const credentials = btoa(`${principal}:${secret}`);
            customHeaders['Authorization'] = `Basic ${credentials}`;
        } else {
            params.append('client_id', principal);
            params.append('client_secret', secret);
        }
    }

    // Use proxy URL if local, otherwise direct
    const { url: fetchUrl, headers: proxyHeaders } = getProxyConfig(authEndpoint);
    console.log(`[Auth] Fetching: ${fetchUrl} (Original: ${authEndpoint})`);

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: { ...customHeaders, ...proxyHeaders } as any,
      body: params.toString(),
      referrerPolicy: 'no-referrer',
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `HTTP ${response.status} ${response.statusText}`;
      try {
        if (errorText) {
            const errJson = JSON.parse(errorText);
            const description = errJson.error_description || errJson.error || errJson.message;
            if (description) errorMsg = description;
        }
      } catch (e) {
         if (errorText) errorMsg = errorText.substring(0, 100);
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  };

  // 1. User Login (Password Grant)
  if (isUserLogin) {
      return parseTokenData(await executeAuthRequest('PASSWORD_GRANT'));
  }

  // 2. Service Login (Client Credentials) - Retry logic
  try {
    return parseTokenData(await executeAuthRequest('BODY'));
  } catch (err: any) {
    console.warn("Auth Strategy 1 (Body) failed:", err.message);
    const isCredError = err.message.includes('401') || err.message.includes('400') || err.message.includes('unauthorized');
    
    if (isCredError) {
        try {
            console.log("Retrying with Strategy 2 (Basic Auth)...");
            return parseTokenData(await executeAuthRequest('BASIC'));
        } catch (err2) { /* ignore */ }
    }
    throw err;
  }
}

function parseTokenData(data: any): AuthTokenResponse {
    const accessToken = data.access_token || data.accessToken || data.token;
    const refreshToken = data.refresh_token || data.refreshToken;
    if (!accessToken) throw new Error("Invalid Auth Response: No 'access_token' found.");
    return { accessToken, refreshToken, expiresIn: data.expires_in };
}