
/**
 * Runtime configuration loaded before the React app starts.
 * Do NOT put client secrets here (browser = public).
 */

window.APP_CONFIG = {
  // ==========================
  // KEYCLOAK CONFIG
  // ==========================
  KEYCLOAK_BASE_URL: "https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com",
  REALM: "apigw",
  CLIENT_ID: "apigw",        // <-- change to your Keycloak Client ID
  OIDC_FLOW: "auth_code_pkce",            // recommended for browser apps
  SCOPES: "openid profile email",

  // ==========================
  // API GATEWAY CONFIG
  // ==========================
  API_GATEWAY_BASE_URL: "https://amd-apigw-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com",

  /**
   * LightTracer service base path.
   * If your backend team confirms a different one, update only this.
   * The previous 404 indicates this path might be wrong, so verify if needed.
   */
  LIGHTTRACER_BASE_PATH: "/lightTracer/v1",

  /**
   * The endpoint name you tried was:
   *   /lightTracer/v1/managementLoggers
   * If backend says the correct one is /management/loggers or similar,
   * update ONLY this field:
   */
  LIGHTTRACER_MANAGEMENT_LOGGERS: "/managementLoggers",

  // ==========================
  // DEV SERVER PROXY
  // ==========================
  /**
   * Leave empty if React + Vite run on the same origin.
   * If your Vite dev server runs on 3003, leave blank ("") because
   * the browser already hits http://localhost:3003.
   */
  CORS_PROXY_BASE: "",

  // ==========================
  // FEATURE FLAGS
  // ==========================
  ENABLE_DISCOVERY: false,
  LOG_LEVEL: "info"
};
