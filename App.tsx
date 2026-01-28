
import React, { useState, useEffect, useRef } from 'react';
import { Settings,Zap, Clock, Trash2, Check, LogOut, ListFilter, LayoutDashboard, Wifi, WifiOff, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { ActiveOverride, LogLevel, User, Service } from './types';
import { ENVIRONMENTS, LOG_LEVELS, DURATION_OPTIONS, EXPIRY_WARNING_THRESHOLD_MS, DEFAULT_DISCOVERY_PAYLOAD } from './constants';
import { DEMO_SERVICES } from './data/demoServices';
import TimerCircle from './components/TimerCircle';
import DecisionModal from './components/DecisionModal';
import Login from './components/Login';
import { fetchEnvironmentServices, updateServiceLogLevel } from './services/integrationService';

const STORAGE_KEY = 'logflow_active_overrides';
const BROADCAST_CHANNEL_NAME = 'logflow_sync_channel';

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
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isFetchingServices, setIsFetchingServices] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline' | 'demo'>('demo');
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  const [selectedEnv, setSelectedEnv] = useState(ENVIRONMENTS[0].id);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('DEBUG');
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0].value);
  const [isApplying, setIsApplying] = useState(false);
  
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // OPTIMISTIC LOGIN + ROBUST FALLBACK
  const handleLogin = async (
      username: string, 
      password: string, 
      apiEndpoint: string, 
      authEndpoint: string,
      initialServices: Service[],
      clusterId: string,
      envId: string,
      _isUserLogin: boolean,
      _publicClientId: string,
      isDemoMode: boolean
    ) => {
    
    // 1. Initialize User State
    const newUserState: User = { 
        username, 
        role: 'Operator', 
        isAuthenticated: true,
        apiToken: password,
        apiEndpoint: apiEndpoint,
        authEndpoint: authEndpoint,
        connectedCluster: clusterId,
        connectedEnv: envId
    };
    
    setUser(newUserState);
    setSelectedEnv(envId);
    setFallbackMessage(null);
    
    // 2. Check for Explicit Demo Mode
    if (isDemoMode) {
        setConnectionStatus('demo');
        setAvailableServices(initialServices.length > 0 ? initialServices : DEMO_SERVICES);
        return;
    }

    // 3. Attempt Real Fetch with Fallback
    setConnectionStatus('connected');
    setIsFetchingServices(true);
    setAvailableServices([]); 

    try {
        const discoveryResult = await fetchEnvironmentServices(
            apiEndpoint, 
            password, 
            DEFAULT_DISCOVERY_PAYLOAD, 
            'GET'
        );
        
        setAvailableServices(discoveryResult.services);
        if (discoveryResult.resolvedUrl !== apiEndpoint) {
             setUser(prev => prev ? ({ ...prev, apiEndpoint: discoveryResult.resolvedUrl }) : null);
        }

    } catch (error: any) {
        console.warn("Service Discovery Failed. Switching to Demo Mode.", error);
        
        // AUTOMATIC FALLBACK TO DEMO
        setConnectionStatus('demo');
        setAvailableServices(DEMO_SERVICES);
        setFallbackMessage("Backend connection failed (403/404). Loaded demo data for simulation.");
    } finally {
        setIsFetchingServices(false);
    }
  };

  const retryServiceFetch = async () => {
    if (!user || !user.apiEndpoint) return;
    setIsFetchingServices(true);
    setFallbackMessage(null);
    try {
        const res = await fetchEnvironmentServices(user.apiEndpoint, user.apiToken || '', DEFAULT_DISCOVERY_PAYLOAD, 'GET');
        setAvailableServices(res.services);
        setConnectionStatus('connected');
        if (res.resolvedUrl !== user.apiEndpoint) {
             setUser(prev => prev ? ({ ...prev, apiEndpoint: res.resolvedUrl }) : null);
        }
    } catch (e) {
        console.error("Retry failed", e);
        setConnectionStatus('demo');
        setFallbackMessage("Retry failed. Still in demo mode.");
    } finally {
        setIsFetchingServices(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setActiveOverrides([]);
    setAvailableServices([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ... (Effect hooks kept identical) ...
  const calculateDerivedState = (overrides: ActiveOverride[]) => {
    const now = Date.now();
    return overrides.map(o => ({
      ...o,
      isExpiringSoon: o.expiryTime - now < EXPIRY_WARNING_THRESHOLD_MS
    }));
  };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const valid = parsed.filter((o: ActiveOverride) => o.expiryTime > Date.now());
        setActiveOverrides(calculateDerivedState(valid));
      } catch (e) {}
    }
    broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannelRef.current.onmessage = (event) => {
      if (event.data.type === 'SYNC_REQUIRED' || event.data.type === 'FORCE_POPUP') {
        const currentStored = localStorage.getItem(STORAGE_KEY);
        if (currentStored) {
          try {
            setActiveOverrides(calculateDerivedState(JSON.parse(currentStored)));
          } catch (e) {}
        }
      }
    };
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setActiveOverrides(calculateDerivedState(JSON.parse(e.newValue)));
        } catch (e) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (broadcastChannelRef.current) broadcastChannelRef.current.close();
    };
  }, []);

  useEffect(() => {
    const cleanState = activeOverrides.map(({ isExpiringSoon, ...rest }) => rest);
    const json = JSON.stringify(cleanState);
    if (json !== localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, json);
  }, [activeOverrides]);

  useEffect(() => {
    const expiringList = activeOverrides.filter(o => o.isExpiringSoon);
    if (expiringList.length > 0) {
      const flash = setInterval(() => {
        document.title = document.title === '⚠️ ACTION REQUIRED' ? `Tracker Alert (${expiringList.length})` : '⚠️ ACTION REQUIRED';
      }, 1000);
      return () => { clearInterval(flash); document.title = 'Logger Tracker | System Observability'; };
    } else { document.title = 'Logger Tracker | System Observability'; }
  }, [activeOverrides]);

  useEffect(() => {
    if (!user) return;
    const tick = setInterval(() => {
      const now = Date.now();
      setActiveOverrides(prev => {
        const expired = prev.filter(o => o.expiryTime <= now);
        if (expired.length > 0) {
             expired.forEach(e => {
                 if (!notifiedIdsRef.current.has(e.id)) {
                     notifiedIdsRef.current.add(e.id);
                     if (Notification.permission === 'granted') new Notification("Log Level Reset", { body: `${e.serviceName} returned to default behavior.` });
                 }
             });
        }
        const valid = prev.filter(o => o.expiryTime > now);
        return valid.map(o => ({ ...o, isExpiringSoon: o.expiryTime - now < EXPIRY_WARNING_THRESHOLD_MS }));
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [user]);

  const handleApplyChanges = async () => {
     if (selectedServices.size === 0) return;
     
     // Simulation for Demo Mode
     if (connectionStatus === 'demo') {
         const now = Date.now();
         const newOverrides: ActiveOverride[] = [];
         for (const serviceId of selectedServices) {
             const service = availableServices.find(s => s.id === serviceId);
             if (service) {
                newOverrides.push({
                    id: serviceId + '-' + now,
                    serviceId: serviceId,
                    serviceName: service.name,
                    envId: user!.connectedEnv || selectedEnv,
                    level: selectedLevel,
                    startTime: now,
                    expiryTime: now + selectedDuration,
                    totalDuration: selectedDuration,
                    isExpiringSoon: false
                });
             }
         }
         setActiveOverrides(prev => [...prev.filter(o => !selectedServices.has(o.serviceId)), ...newOverrides]);
         setSelectedServices(new Set());
         return;
     }

     setIsApplying(true);
     const newOverrides: ActiveOverride[] = [];
     const now = Date.now();
     
     for (const serviceId of selectedServices) {
         const service = availableServices.find(s => s.id === serviceId);
         if (!service) continue;
         const success = await updateServiceLogLevel(user!.apiEndpoint || '', serviceId, selectedLevel, selectedDuration, user!.apiToken || '');
         if (success) {
             newOverrides.push({
                 id: serviceId + '-' + now,
                 serviceId: serviceId,
                 serviceName: service.name,
                 envId: user!.connectedEnv || selectedEnv,
                 level: selectedLevel,
                 startTime: now,
                 expiryTime: now + selectedDuration,
                 totalDuration: selectedDuration,
                 isExpiringSoon: false
             });
         }
     }
     setActiveOverrides(prev => {
         const filtered = prev.filter(o => !selectedServices.has(o.serviceId));
         return [...filtered, ...newOverrides];
     });
     setSelectedServices(new Set());
     setIsApplying(false);
  };

  const handleRemoveOverride = async (override: ActiveOverride) => {
      if (connectionStatus !== 'demo') {
        const service = availableServices.find(s => s.id === override.serviceId);
        const defaultLevel = service?.defaultLevel || 'INFO';
        await updateServiceLogLevel(user!.apiEndpoint || '', override.serviceId, defaultLevel, 0, user!.apiToken || '');
      }
      setActiveOverrides(prev => prev.filter(o => o.id !== override.id));
  };
  

  if (!user) return <Login onLogin={handleLogin} />;

  const expiringOverrides = activeOverrides.filter(o => o.isExpiringSoon);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
       <DecisionModal 
           expiringOverrides={expiringOverrides}
           onKeep={() => setActiveOverrides(prev => prev.map(o => expiringOverrides.find(e => e.id === o.id) ? { ...o, expiryTime: o.expiryTime + 600000, totalDuration: o.totalDuration + 600000, isExpiringSoon: false } : o))}
           onAccept={() => setActiveOverrides(prev => prev.filter(o => !expiringOverrides.find(e => e.id === o.id)))}
       />

       <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
           <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
               <div className="flex items-center gap-3">
                   <div className="bg-indigo-600 p-2 rounded-lg">
                       <LayoutDashboard className="w-5 h-5 text-white" />
                   </div>
                   <div>
                       <h1 className="text-lg font-black tracking-tight text-slate-800">Logger<span className="text-indigo-600">Flow</span></h1>
                       <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                           <span>{user.connectedCluster}</span><span className="text-slate-300">/</span><span>{user.connectedEnv}</span>
                       </div>
                   </div>
               </div>
               <div className="flex items-center gap-4">
                   <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 ${connectionStatus === 'connected' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                       {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                       {connectionStatus === 'connected' ? 'Live Connection' : 'Demo Mode'}
                   </div>
                   <button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><LogOut className="w-5 h-5" /></button>
               </div>
           </div>
       </header>

       <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-7 space-y-6">
               <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
                   <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-500" /> Configuration Control</h2>
                   <div className="space-y-3">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Severity Level</label>
                       <div className="flex gap-2">
                           {LOG_LEVELS.map(level => (
                               <button key={level} onClick={() => setSelectedLevel(level)} className={getLevelButtonStyles(level, selectedLevel === level)}>{level}</button>
                           ))}
                       </div>
                   </div>
                   <div className="space-y-3">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Override Duration</label>
                       <div className="grid grid-cols-5 gap-2">
                           {DURATION_OPTIONS.map(opt => (
                               <button key={opt.label} onClick={() => setSelectedDuration(opt.value)} className={`py-2 rounded-xl text-xs font-bold border transition-all ${selectedDuration === opt.value ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{opt.label}</button>
                           ))}
                       </div>
                   </div>
                   <button onClick={handleApplyChanges} disabled={selectedServices.size === 0 || isApplying} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 transition-all active:scale-[0.99] flex items-center justify-center gap-2">
                       {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                       {selectedServices.size === 0 ? 'Select Services Below' : `Apply to ${selectedServices.size} Service(s)`}
                   </button>
               </div>

               {/* SERVICE LIST AREA */}
               <div className="space-y-4">
                   <div className="flex items-center justify-between px-2">
                       <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Available Services</h3>
                       <div className="flex gap-2">
                            <button onClick={() => setSelectedServices(new Set(availableServices.map(s => s.id)))} className="text-[10px] font-bold text-indigo-600 hover:underline">Select All</button>
                            <span className="text-slate-300">|</span>
                            <button onClick={() => setSelectedServices(new Set())} className="text-[10px] font-bold text-slate-500 hover:underline">Clear</button>
                       </div>
                   </div>
                   
                   {fallbackMessage && (
                       <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-[10px] font-bold text-amber-700">{fallbackMessage}</span>
                       </div>
                   )}

                   <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm min-h-[300px] flex flex-col">
                        {isFetchingServices ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                <span className="text-xs font-bold">Discovering Services...</span>
                            </div>
                        ) : availableServices.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <AlertTriangle className="w-10 h-10 text-amber-500 mb-3 opacity-50" />
                                <h3 className="text-sm font-black text-slate-700">No Services Found</h3>
                                <p className="text-xs text-slate-400 max-w-[250px] mt-1 mb-4">Discovery returned empty results.</p>
                                <button onClick={retryServiceFetch} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
                                    <RefreshCw className="w-3 h-3" /> Retry Discovery
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                                {availableServices.map(svc => (
                                    <div key={svc.id} onClick={() => { const next = new Set(selectedServices); if (next.has(svc.id)) next.delete(svc.id); else next.add(svc.id); setSelectedServices(next); }} className={`p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50 ${selectedServices.has(svc.id) ? 'bg-indigo-50/50' : ''}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${selectedServices.has(svc.id) ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'border-slate-300 bg-white'}`}>
                                                <Check className={`w-3 h-3 text-white ${selectedServices.has(svc.id) ? 'opacity-100' : 'opacity-0'}`} />
                                            </div>
                                            <div>
                                                <div className={`text-sm font-bold ${selectedServices.has(svc.id) ? 'text-indigo-900' : 'text-slate-700'}`}>{svc.name}</div>
                                                <div className="text-[10px] font-mono text-slate-400">{svc.id}</div>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">{svc.defaultLevel}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                   </div>
               </div>
           </div>

           <div className="lg:col-span-5 space-y-6">
               <div className="flex items-center justify-between">
                   <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-500" /> Active Overrides</h2>
                   <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-black">{activeOverrides.length}</span>
               </div>
               {activeOverrides.length === 0 ? (
                   <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 flex flex-col items-center text-center text-slate-400">
                       <ListFilter className="w-12 h-12 mb-4 opacity-50" />
                       <h3 className="text-sm font-bold text-slate-600">No Active Overrides</h3>
                       <p className="text-xs mt-2 max-w-[200px]">Select services and apply a temporary log level to see them here.</p>
                   </div>
               ) : (
                   <div className="space-y-4">
                       {activeOverrides.map(override => (
                           <div key={override.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                               {override.isExpiringSoon && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />}
                               <div className="flex justify-between items-start mb-4">
                                   <div>
                                       <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${getLevelBadgeStyles(override.level)}`}>{override.level}</span>
                                            {override.isExpiringSoon && <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1 animate-pulse"><AlertTriangle className="w-3 h-3" /> Expiring</span>}
                                       </div>
                                       <h3 className="text-sm font-bold text-slate-800">{override.serviceName}</h3>
                                   </div>
                                   <TimerCircle expiryTime={override.expiryTime} totalDuration={override.totalDuration} size={48} />
                               </div>
                               <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                   <div className="text-[10px] font-bold text-slate-400">Env: {override.envId}</div>
                                   <button onClick={() => handleRemoveOverride(override)} className="text-slate-400 hover:text-rose-500 p-2 -mr-2 transition-colors rounded-lg hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                               </div>
                           </div>
                       ))}
                   </div>
               )}
           </div>
       </main>
    </div>
  );
};

export default App;
