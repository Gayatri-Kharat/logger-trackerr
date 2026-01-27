import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, 
  RefreshCw, 
  Radar, 
  Zap, 
  Plus, 
  Clock, 
  Trash2,
  Check,
  LogOut,
  ListFilter,
  LayoutDashboard,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
  Network
} from 'lucide-react';

// Type Imports (Definitions)
import type { 
  ActiveOverride, 
  LogLevel, 
  DiagnosticSuggestion,
  User,
  Service
} from './types';

// Constant Imports (Data)
import { 
  ENVIRONMENTS, 
  DEMO_SERVICES, 
  LOG_LEVELS, 
  DURATION_OPTIONS, 
  EXPIRY_WARNING_THRESHOLD_MS 
} from './constants';

import TimerCircle from './components/TimerCircle';
import DecisionModal from './components/DecisionModal';
import Login from './components/Login';
import { getDiagnosticAdvice } from './services/diagnosticService';
import { fetchEnvironmentServices, updateServiceLogLevel } from './services/integrationService';
import { authenticate } from './services/authService';

// Storage Key for cross-tab synchronization
const STORAGE_KEY = 'logflow_active_overrides';
// Broadcast Channel for real-time timer synchronization
const BROADCAST_CHANNEL_NAME = 'logflow_sync_channel';

// Helper for Badge Styles (Active Overrides)
const getLevelBadgeStyles = (level: LogLevel) => {
  switch (level) {
    case 'TRACE': return 'bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200 shadow-sm';
    case 'DEBUG': return 'bg-cyan-100 text-cyan-700 border border-cyan-200 shadow-sm';
    case 'INFO': return 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm';
    case 'WARN': return 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm';
    case 'ERROR': return 'bg-rose-100 text-rose-700 border border-rose-200 shadow-sm';
    default: return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
};

// Helper for Button Styles (Configuration Selection)
const getLevelButtonStyles = (level: LogLevel, isSelected: boolean) => {
  const base = "px-3 py-2 rounded-xl text-[10px] font-black border transition-all duration-200 flex-1 text-center uppercase tracking-wider";
  
  if (isSelected) {
    switch (level) {
      case 'TRACE': return `${base} bg-fuchsia-600 text-white border-fuchsia-600 shadow-lg shadow-fuchsia-200 transform scale-105`;
      case 'DEBUG': return `${base} bg-cyan-600 text-white border-cyan-600 shadow-lg shadow-cyan-200 transform scale-105`;
      case 'INFO': return `${base} bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-200 transform scale-105`;
      case 'WARN': return `${base} bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-200 transform scale-105`;
      case 'ERROR': return `${base} bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-200 transform scale-105`;
      default: return `${base} bg-slate-900 text-white border-slate-900`;
    }
  }
  return `${base} bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:bg-slate-50`;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeOverrides, setActiveOverrides] = useState<ActiveOverride[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>(DEMO_SERVICES);
  const [isFetchingServices, setIsFetchingServices] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline' | 'demo'>('demo');

  const [selectedEnv, setSelectedEnv] = useState(ENVIRONMENTS[0].id);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('DEBUG');
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0].value);
  const [isApplying, setIsApplying] = useState(false);
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [diagnosticPrompt, setDiagnosticPrompt] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<DiagnosticSuggestion[]>([]);
  
  // Track notifications to prevent spamming
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  // Broadcast channel ref
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Auth Handling with Notification Permission
  const handleLogin = async (
      username: string, 
      password: string, 
      apiEndpoint: string, 
      authEndpoint: string,
      initialServices: Service[],
      clusterId: string,
      envId: string,
      isUserLogin: boolean,
      publicClientId: string
    ) => {
    console.log("Starting Login Sequence:", { username, apiEndpoint, authEndpoint, clusterId, envId, isUserLogin, publicClientId });
    setIsFetchingServices(true);
    
    // Artificial delay to ensure user sees the transition state
    await new Promise(resolve => setTimeout(resolve, 500));

    let servicesList = initialServices && initialServices.length > 0 ? initialServices : DEMO_SERVICES;
    let status: 'connected' | 'demo' = 'demo';
    
    // Default strategy: Use password directly as token (Direct Access / OpenShift Token)
    let finalToken = password; 
    let finalRefreshToken = undefined;

    // 1. ATTEMPT AUTHENTICATION (Optional)
    // If Keycloak is down, blocked by CORS, or SSL is untrusted, we LOG WARNING and CONTINUE.
    // We do NOT block the user. This solves "Going to Keycloak ... not supposed to happen".
    try {
      if (authEndpoint && authEndpoint.trim() !== '') {
        console.log("Attempting Identity Provider Auth...");
        // Pass publicClientId along with isUserLogin
        const authResponse = await authenticate(authEndpoint, username, password, { isUserLogin, publicClientId });
        finalToken = authResponse.accessToken;
        finalRefreshToken = authResponse.refreshToken;
        console.log("Authentication successful, obtained Access Token.");
        status = 'connected';
      }
    } catch (authError: any) {
        // Soft Fail: Log it, but proceed to try direct connection
        console.warn("Identity Provider Auth Failed/Skipped. Proceeding with direct credentials.", authError.message);
        
        // Note: We intentionally do NOT throw here. 
        // If the user provided a direct OpenShift token in the password field, 
        // or if the backend accepts Basic Auth (though we send Bearer), this might still work.
    }

    // 2. FETCH SERVICES / VALIDATE CONNECTION
    try {
      // If we didn't get pre-selected services from the new Login UI but have an endpoint, fetch them
      if ((!initialServices || initialServices.length === 0) && apiEndpoint && apiEndpoint.trim() !== '') {
        console.log("Fetching services with token:", finalToken ? '***' : 'null');
        const discoveryResult = await fetchEnvironmentServices(apiEndpoint, finalToken);
        servicesList = discoveryResult.services;
        // If discovery auto-corrected the URL (e.g. 404 fallback), we update the endpoint variable
        if (discoveryResult.resolvedUrl && discoveryResult.resolvedUrl !== apiEndpoint) {
            console.log(`[App] Auto-correcting API Endpoint: ${apiEndpoint} -> ${discoveryResult.resolvedUrl}`);
            apiEndpoint = discoveryResult.resolvedUrl;
        }
        status = 'connected';
      }
    } catch (error: any) {
      console.error("Login/Connection Failed:", error);
      
      let errorMsg = error.message || "Unknown error occurred";
      
      // CRITICAL FIX: If we have a URL that failed due to trust/CORS, 
      // throw it back to the Login component so it can display the "Trust Certificate" button.
      if (error.failedUrl) {
         setIsFetchingServices(false);
         throw error;
      }

      // SECURITY PATCH: Block demo mode fallback on explicit auth failures (401/403) from the API
      const isAuthError = errorMsg.includes('401') || 
                          errorMsg.includes('403') || 
                          errorMsg.toLowerCase().includes('access denied');

      if (isAuthError) {
        alert("Authentication Failed: The provided credentials were rejected by the Gateway.");
        setIsFetchingServices(false);
        return;
      }

      const proceedWithDemo = window.confirm(
        `CONNECTION ERROR\n\n${errorMsg}\n\nWould you like to load DEMO MODE instead?`
      );

      if (!proceedWithDemo) {
        setIsFetchingServices(false);
        return; 
      }
      status = 'demo';
    }

    setAvailableServices(servicesList);
    setConnectionStatus(status);
    
    // Auto-select the environment we just logged into for the "Global Configuration" context
    setSelectedEnv(envId);

    console.log("Setting authenticated user...");
    setUser({ 
      username, 
      role: 'Operator', 
      isAuthenticated: true,
      apiToken: finalToken,
      refreshToken: finalRefreshToken,
      apiEndpoint: apiEndpoint,
      authEndpoint: authEndpoint,
      connectedCluster: clusterId,
      connectedEnv: envId
    });

    setIsFetchingServices(false);
    
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };

  const handleLogout = () => {
    setUser(null);
    setActiveOverrides([]);
    setAvailableServices(DEMO_SERVICES);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Helper to re-calculate derived state (isExpiringSoon)
  const calculateDerivedState = (overrides: ActiveOverride[]) => {
    const now = Date.now();
    return overrides.map(o => ({
      ...o,
      isExpiringSoon: o.expiryTime - now < EXPIRY_WARNING_THRESHOLD_MS
    }));
  };

  // 1. Initialize from Storage & Setup Broadcast Channel
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Clean out stale entries and immediately calculate expiring status
        const valid = parsed.filter((o: ActiveOverride) => o.expiryTime > Date.now());
        setActiveOverrides(calculateDerivedState(valid));
      } catch (e) {
        console.error("Failed to sync state", e);
      }
    }

    // Initialize Broadcast Channel
    broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannelRef.current.onmessage = (event) => {
      if (event.data.type === 'SYNC_REQUIRED' || event.data.type === 'FORCE_POPUP') {
        // When another tab says "Check now!", we re-read storage or re-calculate state
        const currentStored = localStorage.getItem(STORAGE_KEY);
        if (currentStored) {
          try {
            const parsed = JSON.parse(currentStored);
            // Immediately apply calculation to ensure Modal pops up if needed
            setActiveOverrides(calculateDerivedState(parsed));
          } catch (e) { console.error(e); }
        } else {
            // Fallback if storage is empty
            setActiveOverrides(prev => calculateDerivedState(prev));
        }
      }
    };

    // Listen for changes from other tabs via Storage Event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const remoteState = JSON.parse(e.newValue);
          // CRITICAL: Immediately calculate isExpiringSoon so the Modal appears 
          // even if the timer hasn't ticked yet on this background tab.
          const hydratedState = calculateDerivedState(remoteState);
          setActiveOverrides(hydratedState);
        } catch (e) {
          console.error("Failed to parse remote state", e);
        }
      }
    };

    // Listen for visibility change to force a refresh
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setActiveOverrides(prev => calculateDerivedState(prev));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // 2. Persist State Changes
  // We strip 'isExpiringSoon' to avoid circular updates and unnecessary writes
  useEffect(() => {
    const cleanState = activeOverrides.map(({ isExpiringSoon, ...rest }) => rest);
    const json = JSON.stringify(cleanState);
    if (json !== localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, json);
    }
  }, [activeOverrides]);

  // 3. Document Title Flashing
  const expiringList = activeOverrides.filter(o => o.isExpiringSoon);
  useEffect(() => {
    if (expiringList.length > 0) {
      const flash = setInterval(() => {
        document.title = document.title === '⚠️ ACTION REQUIRED' 
          ? `Tracker Alert (${expiringList.length})` 
          : '⚠️ ACTION REQUIRED';
      }, 1000);
      return () => {
        clearInterval(flash);
        document.title = 'Logger Tracker | System Observability';
      };
    } else {
      document.title = 'Logger Tracker | System Observability';
    }
  }, [expiringList.length]);

  // 4. Timer, Notification & Sync Logic
  useEffect(() => {
    if (!user) return;
    const tick = setInterval(() => {
      const now = Date.now();
      
      setActiveOverrides(prev => {
        // 1. Detect Items that JUST Expired (Auto-Reset)
        const expired = prev.filter(o => o.expiryTime <= now);
        
        if (expired.length > 0) {
          if (Notification.permission === 'granted') {
            const names = expired.map(s => s.serviceName).join(', ');
            new Notification('System Auto-Reset Implemented', {
              body: `Timeout reached: ${names} have reverted to default safe configuration.`,
              tag: 'logflow-autoreset',
              icon: '/favicon.ico'
            });
          }
          expired.forEach(o => notifiedIdsRef.current.delete(o.id));
        }

        // 2. Calculate next state
        const next = prev.filter(o => o.expiryTime > now).map(o => ({
          ...o,
          isExpiringSoon: o.expiryTime - now < EXPIRY_WARNING_THRESHOLD_MS
        }));

        // 3. Detect items that need a Warning Notification
        const needsNotification = next.filter(n => n.isExpiringSoon && !notifiedIdsRef.current.has(n.id));
        
        // 3b. CROSS-TAB SYNC TRIGGER
        // If we have items that are expiring soon, we continuously signal other tabs 
        // to ensure they show the popup even if they are in background/throttled.
        const hasExpiringItems = next.some(n => n.isExpiringSoon);
        if (hasExpiringItems && broadcastChannelRef.current) {
             // Send a pulse to wake up other tabs to show the modal
             broadcastChannelRef.current.postMessage({ type: 'FORCE_POPUP' });
        }

        if (needsNotification.length > 0) {
          if (Notification.permission === 'granted') {
             const names = needsNotification.map(s => s.serviceName).join(', ');
             new Notification('Tracker Alert: Expiry Imminent', {
                body: `Overrides expiring in <1m: ${names}`,
                tag: 'logflow-expiry',
                icon: '/favicon.ico',
                requireInteraction: true 
              });
          }
          needsNotification.forEach(n => notifiedIdsRef.current.add(n.id));
        }

        // 4. Cleanup notifiedIds
        const currentExpiringIds = new Set(next.filter(o => o.isExpiringSoon).map(o => o.id));
        for (const id of notifiedIdsRef.current) {
            if (!currentExpiringIds.has(id)) {
                notifiedIdsRef.current.delete(id);
            }
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [user]);

  const toggleService = (id: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyBulk = useCallback(async () => {
    if (selectedServices.size === 0 || !user) return;
    setIsApplying(true);

    const successfulEntries: ActiveOverride[] = [];
    const failedIds: string[] = [];

    // Execute requests in parallel for better performance
    const promises = [...selectedServices].map(async (svcId) => {
        const service = availableServices.find(s => s.id === svcId);
        if (!service) return;

        let success = false;

        if (connectionStatus === 'demo') {
            // SIMULATION MODE: Always succeed if we are in demo/offline mode
            await new Promise(resolve => setTimeout(resolve, 300));
            success = true;
        } else {
            // Perform actual API Call
            success = await updateServiceLogLevel(
                user.apiEndpoint || '',
                svcId,
                selectedLevel,
                selectedDuration,
                user.apiToken || ''
            );
        }

        if (success) {
            successfulEntries.push({
                id: Math.random().toString(36).substr(2, 9),
                serviceId: svcId,
                serviceName: service.name || svcId,
                envId: selectedEnv,
                level: selectedLevel,
                startTime: Date.now(),
                expiryTime: Date.now() + selectedDuration,
                totalDuration: selectedDuration
            });
        } else {
            failedIds.push(service.name);
        }
    });

    await Promise.all(promises);

    // Update Local State with only successful ones
    if (successfulEntries.length > 0) {
        setActiveOverrides(prev => {
            const filtered = prev.filter(o => 
                !successfulEntries.some(n => n.serviceId === o.serviceId && n.envId === o.envId)
            );
            return calculateDerivedState([...filtered, ...successfulEntries]);
        });
        setSelectedServices(new Set());
    }

    if (failedIds.length > 0) {
        alert(`Failed to update log level for: ${failedIds.join(', ')}. Check console for network errors.`);
    }

    setIsApplying(false);
  }, [selectedEnv, selectedServices, selectedLevel, selectedDuration, availableServices, user, connectionStatus]);

  const handleRenewOverride = async (id: string) => {
    const override = activeOverrides.find(o => o.id === id);
    if (!override) return;

    // 1. Optimistic UI update
    setActiveOverrides(prev => prev.map(o => 
      o.id === id ? { ...o, expiryTime: Date.now() + o.totalDuration, isExpiringSoon: false } : o
    ));

    // 2. Call API to extend timer on backend
    if (user && user.isAuthenticated && user.apiEndpoint && user.apiToken) {
        // Ensure we only try to update services in the environment we are currently connected to
        if (override.envId === user.connectedEnv) {
            try {
                await updateServiceLogLevel(
                    user.apiEndpoint, 
                    override.serviceId, 
                    override.level, 
                    override.totalDuration, // Extend by original duration
                    user.apiToken
                );
                console.log(`Renewed log level for ${override.serviceName}`);
            } catch(e) {
                console.error("Failed to renew log level on backend", e);
            }
        }
    }
  };

  const handleRenewAllExpiring = async () => {
    const now = Date.now();
    const toRenew = activeOverrides.filter(o => o.isExpiringSoon);

    // 1. Optimistic Update
    setActiveOverrides(prev => prev.map(o => 
      o.isExpiringSoon ? { ...o, expiryTime: now + o.totalDuration, isExpiringSoon: false } : o
    ));

    // 2. Call API for each expiring item
    if (user && user.isAuthenticated && user.apiEndpoint && user.apiToken) {
        for (const override of toRenew) {
             if (override.envId === user.connectedEnv) {
                 try {
                     await updateServiceLogLevel(
                        user.apiEndpoint,
                        override.serviceId,
                        override.level,
                        override.totalDuration,
                        user.apiToken
                     );
                 } catch(e) {
                     console.error(`Failed to bulk renew ${override.serviceName}`, e);
                 }
             }
        }
    }
  };

  const handleAcceptAllResets = () => {
    setActiveOverrides(prev => prev.filter(o => !o.isExpiringSoon));
  };

  const handleRemoveOverride = (id: string) => {
    setActiveOverrides(prev => prev.filter(o => o.id !== id));
  };

  const runAiDiagnostics = async () => {
    if (!diagnosticPrompt.trim()) return;
    setIsAiLoading(true);
    setAiSuggestions([]);
    try {
      const suggestions = await getDiagnosticAdvice(diagnosticPrompt, availableServices);
      setAiSuggestions(suggestions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiSuggestion = (s: DiagnosticSuggestion) => {
    const service = availableServices.find(srv => srv.id === s.serviceId);
    if (!service) return;

    // Use default duration for AI suggestions
    const defaultDuration = DURATION_OPTIONS[1].value; // 10m

    // We can't immediately update state because we need to hit the API first
    // So we just select it in the UI and let the user click "Apply", 
    // OR we trigger a single update function.
    // For simplicity, we'll set the controls to match the suggestion so the user can just click Apply.
    setSelectedServices(new Set([s.serviceId]));
    setSelectedLevel(s.suggestedLevel);
    setSelectedDuration(defaultDuration);
  };

  if (isFetchingServices) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
           <p className="text-white font-bold tracking-widest uppercase text-xs">Authenticating & Discovering Fleet...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      {/* 
        DecisionModal is now purely state-driven.
        It appears whenever there are expiring overrides in the list.
        Multi-tab sync via BroadcastChannel ensures this state is consistent.
        
        Z-index 100 ensures it sits on top of everything including sticky headers.
      */}
      <DecisionModal 
        expiringOverrides={expiringList}
        onKeep={handleRenewAllExpiring}
        onAccept={handleAcceptAllResets}
      />

      {/* 
        Sticky Header Container 
        Wraps both the Emergency Banner and the Main Navigation.
        z-40 ensures it sits below the Modal (z-100) but above content.
      */}
      <div className="sticky top-0 z-40 flex flex-col w-full shadow-sm">
        {/* Top Emergency Banner */}
        {expiringList.length > 0 && (
          <div className="bg-rose-600 text-white px-4 py-3 text-center flex items-center justify-center gap-2 animate-pulse">
             <AlertTriangle className="w-5 h-5 fill-white text-rose-600" />
             <span className="text-xs font-black uppercase tracking-[0.15em]">
               Critical: {expiringList.length} Service(s) Reverting in &lt; 1 Minute
             </span>
          </div>
        )}

        {/* Modern Top Header */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100">
              <Radar className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter">Logger <span className="text-indigo-600">Tracker</span></h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                {connectionStatus === 'connected' ? (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Real-time Link Active</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-500" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Demo Mode (Offline)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{user.role}</p>
              <p className="text-sm font-bold text-slate-800">{user.username}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all font-bold text-xs"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </header>
      </div>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Column: Management (Checkboxes and Config) */}
        <section className="lg:col-span-4 border-r border-slate-200 bg-white p-8 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-10">
            
            {/* NEW: Active Connection Card */}
            <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl shadow-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5">
                    <Network className="w-24 h-24 text-white" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4 text-emerald-400">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Active Session</span>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Connected Cluster</p>
                            <p className="text-lg font-mono font-bold tracking-tight">{user.connectedCluster || 'Unknown'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Environment</p>
                            <p className="text-lg font-mono font-bold tracking-tight text-indigo-400">{user.connectedEnv || 'Unknown'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-8">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Global Configuration</h2>
              </div>

              <div className="space-y-8">
                {/* Environment List - Filtered by Cluster */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Target Environment</label>
                  <div className="flex flex-wrap gap-2">
                    {ENVIRONMENTS
                        .filter(env => !user.connectedCluster || env.clusterId === user.connectedCluster)
                        .map(env => (
                      <button
                        key={env.id}
                        onClick={() => setSelectedEnv(env.id)}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          selectedEnv === env.id 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' 
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {env.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Service Selection (The Multiple List) */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Services ({selectedServices.size})</label>
                    <button 
                      onClick={() => {
                        if (selectedServices.size === availableServices.length) setSelectedServices(new Set());
                        else setSelectedServices(new Set(availableServices.map(s => s.id)));
                      }}
                      className="text-[10px] font-black text-indigo-600 hover:underline uppercase"
                    >
                      {selectedServices.size === availableServices.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar border-y border-slate-50 py-4">
                    {availableServices.length === 0 ? (
                       <div className="text-center py-4 text-slate-400 text-xs">No Services Found</div>
                    ) : (
                      availableServices.map(s => (
                        <div
                          key={s.id}
                          onClick={() => toggleService(s.id)}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                            selectedServices.has(s.id) 
                            ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                            : 'bg-white border-transparent hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              selectedServices.has(s.id) 
                              ? 'bg-indigo-600 border-indigo-600 text-white' 
                              : 'bg-white border-slate-300'
                            }`}>
                              <Check className={`w-3.5 h-3.5 stroke-[3.5px] ${selectedServices.has(s.id) ? 'opacity-100' : 'opacity-0'}`} />
                            </div>
                            <span className={`text-xs font-bold ${selectedServices.has(s.id) ? 'text-indigo-900' : 'text-slate-600'}`}>{s.name}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Severity Selection - COLOR CODED */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Severity Override</label>
                  <div className="flex flex-wrap gap-2">
                    {LOG_LEVELS.map(level => (
                      <button
                        key={level}
                        onClick={() => setSelectedLevel(level)}
                        className={getLevelButtonStyles(level, selectedLevel === level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Reset Timer</label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedDuration(opt.value)}
                        className={`py-2 rounded-xl text-[10px] font-black border transition-all ${
                          selectedDuration === opt.value
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  disabled={selectedServices.size === 0 || isApplying}
                  onClick={handleApplyBulk}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-bold py-5 px-4 rounded-3xl shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                  {isApplying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  {isApplying ? 'Applying Changes...' : `Apply Overrides (${selectedServices.size})`}
                </button>
              </div>
            </div>

            {/* AI Assistant */}
            <div className="bg-[#12151c] rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-600 rounded-full p-1">
                    <Zap className="w-3.5 h-3.5 text-white fill-white" />
                  </div>
                  <h3 className="font-black text-white text-[10px] uppercase tracking-widest">AI Diagnostics</h3>
                </div>
                <textarea
                  value={diagnosticPrompt}
                  onChange={(e) => setDiagnosticPrompt(e.target.value)}
                  className="w-full rounded-2xl border-none bg-white/5 p-4 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-600 outline-none min-h-[100px] mb-4"
                  placeholder="Paste crash log or describe issue..."
                />
                <button 
                  disabled={isAiLoading || !diagnosticPrompt.trim()}
                  onClick={runAiDiagnostics}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl transition-all"
                >
                  {isAiLoading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : 'Analyze & Recommend'}
                </button>

                {aiSuggestions.length > 0 && (
                  <div className="mt-6 space-y-3 animate-in fade-in slide-in-from-top-2">
                    {aiSuggestions.map((s, idx) => (
                      <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-xs font-bold text-white truncate max-w-[160px]">{availableServices.find(srv => srv.id === s.serviceId)?.name || s.serviceId}</p>
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-600 rounded text-white font-black">{s.suggestedLevel}</span>
                        </div>
                        <button 
                          onClick={() => applyAiSuggestion(s)}
                          className="w-full text-[10px] font-black text-indigo-400 hover:text-white transition-colors py-2 border border-indigo-400/20 rounded-xl"
                        >
                          Select Configuration
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Active Overrides List Interface */}
        <section className="lg:col-span-8 p-10 bg-[#f8fafc] overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end justify-between mb-12">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Operational Dashboard</p>
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Fleet Overrides</h2>
              </div>
              <div className="flex gap-4">
                <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Tunnels</p>
                  <p className="text-2xl font-black text-slate-900">{activeOverrides.length}</p>
                </div>
                <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expiring</p>
                  <p className="text-2xl font-black text-amber-500">{activeOverrides.filter(o => o.isExpiringSoon).length}</p>
                </div>
              </div>
            </div>

            {activeOverrides.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-[3rem] p-24 flex flex-col items-center text-center shadow-sm border-dashed">
                <div className="bg-slate-50 p-8 rounded-[2rem] mb-8 border border-slate-100">
                  <ListFilter className="w-16 h-16 text-slate-200" />
                </div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">System Baseline: ERROR</h3>
                <p className="text-slate-400 max-w-sm mt-3 font-medium leading-relaxed">
                  No verbose logging detected. All service containers are running at default production thresholds.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeOverrides.map(override => (
                  <div 
                    key={override.id} 
                    className={`group bg-white border-2 rounded-[2rem] p-6 transition-all shadow-sm hover:shadow-xl hover:shadow-indigo-900/5 flex items-center justify-between gap-8 ${
                      override.isExpiringSoon ? 'border-amber-400 bg-amber-50/20 shadow-amber-900/5' : 'border-white hover:border-indigo-100'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${
                          override.envId === 'prod' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/20' : 'bg-slate-900 text-white'
                        }`}>
                          {override.envId}
                        </span>
                        <h4 className="font-black text-slate-800 truncate text-lg tracking-tight">{override.serviceName}</h4>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* COLOR CODED BADGE */}
                        <div className={`px-4 py-1.5 rounded-xl mono font-black text-[10px] ${getLevelBadgeStyles(override.level)}`}>
                          {override.level}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          Set {new Date(override.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <TimerCircle 
                        expiryTime={override.expiryTime} 
                        totalDuration={override.totalDuration} 
                        size={64} 
                      />

                      <div className="flex gap-2 min-w-[110px]">
                        <button 
                          onClick={() => handleRenewOverride(override.id)}
                          className="bg-slate-900 text-white p-3 rounded-2xl hover:bg-indigo-600 transition-all active:scale-90"
                          title="Refresh Timer"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleRemoveOverride(override.id)}
                          className="bg-white text-slate-400 p-3 rounded-2xl hover:bg-rose-50 hover:text-rose-600 border border-slate-200 transition-all active:scale-90"
                          title="Force Reset"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 px-8 py-4 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
        <div className="flex gap-10">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            Core Engine: v2.6.4
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
            Cluster Affinity: Staged
          </div>
        </div>
        <div className="flex items-center gap-2">
          ESG INFRASTRUCTURE • {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};

export default App;