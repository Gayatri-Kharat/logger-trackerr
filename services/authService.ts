
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

// Helper to determine proxy URL - ALIGNED with integrationService.ts
const getProxyConfig = (originalUrl: string): ProxyConfig => {
  // USER REQUEST: Disable automatic proxying to localhost.
  // The application will now attempt to hit the Auth Endpoint directly.
  return { url: originalUrl, headers: {} };
  
  /*
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

      // Use /cors-proxy for dynamic routing. 
      const proxyUrl = `/cors-proxy${urlObj.pathname}${urlObj.search}`;
      
      return { 
          url: proxyUrl, 
          headers: { 
              'x-target-origin': urlObj.origin 
          } 
      };
    } catch (_e) {
      console.warn("[AuthService] Failed to parse URL for proxying.");
      return { url: originalUrl, headers: {} };
    }
  }
  return { url: originalUrl, headers: {} };
  */
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
    
    // --- BUILD PARAMETERS ---
    if (strategy === 'PASSWORD_GRANT') {
        params.append('grant_type', 'password');
        // Ensure client_id is passed if required by the realm
        if (publicClientId) params.append('client_id', publicClientId);
        params.append('username', principal);       
        params.append('password', secret);          
       
    } else {
        // SERVICE LOGIN
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
    
    // DEBUG LOG: Print what we are sending (hide secret)
    const debugParams = new URLSearchParams(params);
    if (debugParams.has('password')) debugParams.set('password', '***');
    if (debugParams.has('client_secret')) debugParams.set('client_secret', '***');
    console.log(`[Auth] Strategy: ${strategy}`);
    console.log(`[Auth] Target: ${authEndpoint}`);
    console.log(`[Auth] Proxy:  ${fetchUrl}`);
    console.log(`[Auth] Payload: ${debugParams.toString()}`);

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
      
      // Try to parse Keycloak specific JSON error
      try {
        if (errorText) {
            const errJson = JSON.parse(errorText);
            console.error(`[Auth] ${strategy} Failed JSON:`, errJson);
            const description = errJson.error_description || errJson.error || errJson.message;
            if (description) errorMsg = `Auth Failed: ${description}`;
        } else {
             console.error(`[Auth] ${strategy} Failed Text:`, errorText);
        }
      } catch (e) {
         if (errorText) errorMsg = `${errorMsg} - ${errorText.substring(0, 100)}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  };

  // --- AUTOMATIC FALLBACK STRATEGY ---

  // 1. If explicit user login requested, try Password Grant immediately
  if (isUserLogin) {
      return parseTokenData(await executeAuthRequest('PASSWORD_GRANT'));
  }

  // 2. Otherwise, try sequence: Body -> Basic -> Password
  try {
    // Attempt A: Standard Client Credentials (Body)
    return parseTokenData(await executeAuthRequest('BODY'));
  } catch (err: any) {
    console.warn("Auth Strategy 1 (Client Body) failed:", err.message);
    
    try {
        // Attempt B: Client Credentials (Basic Auth Header)
        return parseTokenData(await executeAuthRequest('BASIC'));
    } catch (err2: any) {
        console.warn("Auth Strategy 2 (Client Basic) failed:", err2.message);

        // Attempt C: Password Grant (User)
        try {
             return parseTokenData(await executeAuthRequest('PASSWORD_GRANT'));
        } catch (err3) {
             throw new Error(err.message); // Throw the first error as it's usually the most relevant for Service Accounts
        }
    }
  }
}

function parseTokenData(data: any): AuthTokenResponse {
    const accessToken = data.access_token || data.accessToken || data.token;
    const refreshToken = data.refresh_token || data.refreshToken;
    if (!accessToken) throw new Error("Invalid Auth Response: No 'access_token' found.");
    return { accessToken, refreshToken, expiresIn: data.expires_in };
}
