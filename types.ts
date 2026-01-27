
// This file must ONLY contain type definitions.
// Do not import values (constants) here.

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Environment {
  id: string;
  name: string;
  clusterId: string; // Links environment to a parent cluster
}

export interface Cluster {
  id: string;
  name: string;
}

export interface Service {
  id: string;
  name: string;
  defaultLevel: LogLevel;
}

export interface SavedProfile {
  id: string;
  label: string;
  username: string;
  password: string;
}

export interface ActiveOverride {
  id: string;
  serviceId: string;
  serviceName: string;
  envId: string;
  level: LogLevel;
  startTime: number;
  expiryTime: number;
  totalDuration: number;
  isExpiringSoon?: boolean;
}

export interface DiagnosticSuggestion {
  serviceId: string;
  reason: string;
  suggestedLevel: LogLevel;
}

export interface User {
  username: string;
  role: string;
  isAuthenticated: boolean;
  apiToken?: string;
  refreshToken?: string;
  apiEndpoint?: string;
  authEndpoint?: string;
  connectedCluster?: string;
  connectedEnv?: string;
}

export interface AppConfig {
  API_URL_TEMPLATE?: string;
  AUTH_URL_TEMPLATE?: string;
  DEFAULT_REALM?: string;
  CLUSTERS?: Cluster[];
  ENVIRONMENTS?: Environment[];
  SAVED_PROFILES?: SavedProfile[];
  DEMO_SERVICES?: Service[];
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}