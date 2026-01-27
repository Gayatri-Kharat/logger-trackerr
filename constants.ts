
import type { Environment, Service, LogLevel, SavedProfile, Cluster, AppConfig } from './types';

// ==========================================
// 🔧 CONFIGURATION AREA
// ==========================================

// Helper to safely access global config without strict type issues
const getAppConfig = (): AppConfig | undefined => (window as any).APP_CONFIG;

// 1. APP API URL TEMPLATE (Service Discovery)
// Updated to match specific gateway pattern: amd-apigw-{env}...
export const API_URL_TEMPLATE = getAppConfig()?.API_URL_TEMPLATE || "https://amd-apigw-{env}.apps.{cluster}.ocpd.corp.amdocs.com";

// 2. AUTH URL TEMPLATE (Keycloak)
// Matches the specific structure provided with 'apigw' realm:
export const AUTH_URL_TEMPLATE = getAppConfig()?.AUTH_URL_TEMPLATE || "https://keycloak-{env}.apps.{cluster}.ocpd.corp.amdocs.com";

// 3. DEFAULT REALM
// The Keycloak realm to use by default. Common values: 'apigw', 'master', or the environment name.
export const DEFAULT_REALM = getAppConfig()?.DEFAULT_REALM || "apigw";

// 4. DEFINE YOUR CLUSTERS (Dropdown List 1)
export const CLUSTERS: Cluster[] = getAppConfig()?.CLUSTERS || [
  // Prioritize User's Cluster
  { id: 'ildelocpvfd408', name: 'ildelocpvfd408' },
  { id: 'ildelocpvfd403', name: 'ildelocpvfd403' },
];

// 5. DEFINE YOUR ENVIRONMENTS (Dropdown List 2)
// Each environment is now linked to a specific cluster via clusterId
export const ENVIRONMENTS: Environment[] = getAppConfig()?.ENVIRONMENTS || [
  // Cluster 2 Environments (User Specific - Default)
  { id: 'vfde-il08-env24-runtime', name: 'vfde-il08-env24-runtime', clusterId: 'ildelocpvfd408' },
  { id: 'vfde-il08-env08-runtime', name: 'vfde-il08-env08-runtime', clusterId: 'ildelocpvfd408' },

  // Cluster 1 Environments
  { id: 'env13', name: 'env13', clusterId: 'ildelocpvfd403' },
  { id: 'env35', name: 'env35', clusterId: 'ildelocpvfd403' },
  { id: 'env4', name: 'env4', clusterId: 'ildelocpvfd403' },
];

// ==========================================
// END CONFIGURATION AREA
// ==========================================

// API Path Definitions
export const API_PATHS = {
  // Discovery endpoint appended to API_URL_TEMPLATE
  DISCOVERY: '/lightTracer/v1/managementLoggers',
  
  // Auth Token Endpoint appended to AUTH_URL_TEMPLATE
  // CRITICAL: Matches specific structure: /auth/realms/apigw/protocol/openid-connect/token
  AUTH_TOKEN: '/auth/realms/apigw/protocol/openid-connect/token',
    
  // Endpoint to post log level changes
  UPDATE_LEVEL: '/lightTracer/v1/managementLoggers' 
};

export const SAVED_PROFILES: SavedProfile[] = getAppConfig()?.SAVED_PROFILES || [
  { id: 'csruser', label: 'CSR User', username: 'csruser', password: 'Unix11!' },
  { id: 'dunning', label: 'Dunning User', username: 'dunninhuser', password: '[Credentials]' },
  { id: 'titan', label: 'Titan User', username: 'titan-user', password: '[Credentials]' },
  { id: 'batch', label: 'Batch Migration', username: 'bm-intergation-user', password: '[Credentials]' },
  { id: 'som', label: 'SOM Integration', username: 'som-intergation-user', password: '[Credentials]' },
  { id: 'admin', label: 'SysAdmin (Reference)', username: 'admin_ops', password: '[Credentials]' },
];

// Options for Client ID Dropdown with specific passwords (Reference)
export const CLIENT_ID_OPTIONS = [
  { value: 'apigw', label: 'csruser', password: 'Unix11!' },
  { value: 'dunninhuser', label: 'DUNNING', password: 'Unix11!_sup' },
  { value: 'titan-user', label: 'TITAN_USEER', password: 'Unix11!_aud' },
  { value: 'bm-intergation-user', label: 'BATCH_MIGRATION', password: 'Unix11!_gw' },
  { value: 'som-intergation-user', label: 'SOM', password: 'Unix11!_gw' }
];

export const DEMO_SERVICES: Service[] = getAppConfig()?.DEMO_SERVICES || [
  { id: 'auth-svc', name: 'Authentication Service', defaultLevel: 'ERROR' },
  { id: 'order-api', name: 'Order Processing API', defaultLevel: 'ERROR' },
  { id: 'payment-gw', name: 'Payment Gateway', defaultLevel: 'ERROR' },
  { id: 'inventory-svc', name: 'Inventory Manager', defaultLevel: 'ERROR' },
  { id: 'notif-svc', name: 'Notification Service', defaultLevel: 'ERROR' },
  { id: 'cart-svc', name: 'Shopping Cart Service', defaultLevel: 'ERROR' },
  { id: 'search-idx', name: 'Search Indexer', defaultLevel: 'WARN' },
  { id: 'rec-engine', name: 'Recommendation Engine', defaultLevel: 'INFO' },
];

export const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];

export const DURATION_OPTIONS = [
  { label: '2m', value: 2 * 60 * 1000 },
  { label: '10m', value: 10 * 60 * 1000 },
  { label: '30m', value: 30 * 60 * 1000 },
  { label: '1h', value: 60 * 60 * 1000 },
  { label: '4h', value: 4 * 60 * 60 * 1000 },
];

export const EXPIRY_WARNING_THRESHOLD_MS = 60 * 1000;