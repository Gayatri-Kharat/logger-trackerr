
import React, { useState, useEffect } from 'react';
import { Radar, Lock, Globe, Activity, ChevronRight, Server, Link2, UserCircle, CheckCircle2, Search, Database, AlertCircle } from 'lucide-react';
import { SAVED_PROFILES, ENVIRONMENTS, CLUSTERS, API_PATHS, API_URL_TEMPLATE, AUTH_URL_TEMPLATE } from './constants';
import { DEMO_SERVICES } from './data/demoServices';
import type { Service, LogLevel, SavedProfile } from './types';

interface LoginProps {
  onLogin: (username: string, password: string, apiEndpoint: string, authEndpoint: string, initialServices: Service[]) => void | Promise<void>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // Stage 1: Configuration | Stage 2: Service Selection
  const [step, setStep] = useState<1 | 2>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Credentials State - Safe array access with fallbacks
  const defaultProfile: SavedProfile = SAVED_PROFILES[0] || { id: '', label: 'Default', username: '', password: '' };
  
  const [selectedProfileId, setSelectedProfileId] = useState<string>(defaultProfile.id);
  const [username, setUsername] = useState(defaultProfile.username);
  const [password, setPassword] = useState(defaultProfile.password);

  // Topology State - Safe array access with fallbacks
  const defaultCluster = CLUSTERS[0] || { id: '', name: '' };
  const defaultEnv = ENVIRONMENTS[0] || { id: '', name: '' };
  
  const [selectedClusterId, setSelectedClusterId] = useState(defaultCluster.id);
  const [selectedEnvId, setSelectedEnvId] = useState(defaultEnv.id);
  
  // Computed URLs
  const [constructedApiUrl, setConstructedApiUrl] = useState('');
  const [constructedAuthUrl, setConstructedAuthUrl] = useState('');

  // Update base URLs whenever dropdowns change
  useEffect(() => {
    // 1. Construct API Base URL
    let apiUrl = API_URL_TEMPLATE;
    apiUrl = apiUrl.replace('{cluster}', selectedClusterId);
    apiUrl = apiUrl.replace('{env}', selectedEnvId);
    // Remove trailing slash if present
    setConstructedApiUrl(apiUrl.replace(/\/$/, ''));

    // 2. Construct Auth URL (Keycloak)
    let authUrl = AUTH_URL_TEMPLATE;
    authUrl = authUrl.replace('{cluster}', selectedClusterId);
    authUrl = authUrl.replace('{env}', selectedEnvId);
    setConstructedAuthUrl(authUrl);

  }, [selectedClusterId, selectedEnvId]);

  // Discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredServices, setDiscoveredServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = SAVED_PROFILES.find(p => p.id === profileId);
    if (profile) {
      setUsername(profile.username);
      setPassword(profile.password);
    }
  };

  // Step 1: Real Service Discovery
  const handleScanEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsDiscovering(true);
    setErrorMsg(null);
    
    // Construct full discovery URL using the API URL (not Auth URL)
    const targetUrl = `${constructedApiUrl}${API_PATHS.DISCOVERY}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); 

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${password}`, 
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        let realServices: any[] = [];
        if (Array.isArray(data)) realServices = data;
        else if (data.data && Array.isArray(data.data)) realServices = data.data;
        else if (data.services && Array.isArray(data.services)) realServices = data.services;

        if (realServices.length > 0) {
            // Explicitly cast mapped objects to Service type to fix "Type 'any' is not assignable"
            const mappedServices: Service[] = realServices.map((s: any) => ({
                id: String(s.id || s.serviceId),
                name: String(s.name || s.serviceName),
                defaultLevel: (s.defaultLevel || 'INFO') as LogLevel
            }));

            setDiscoveredServices(mappedServices);
            setSelectedServiceIds(new Set(mappedServices.map((s) => s.id)));
            setIsDiscovering(false);
            setStep(2);
            return;
        } else {
            throw new Error("Authenticated, but no services returned.");
        }
      } else {
        throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);
      }
    } catch (err: unknown) {
      console.error("Discovery failed", err);
      // Safe error message extraction for unknown types
      const msg = err instanceof Error ? err.message : "Failed to connect to cluster.";
      setErrorMsg(msg);
      setIsDiscovering(false);
    }
  };

  const loadDemoData = () => {
    const mockFound: Service[] = DEMO_SERVICES.map(s => ({
        ...s, 
        id: `${selectedEnvId}-${s.id}`,
        name: `[${selectedEnvId.toUpperCase()}] ${s.name}`
      }));
      
    setDiscoveredServices(mockFound);
    setSelectedServiceIds(new Set(mockFound.map(s => s.id)));
    setStep(2);
    setErrorMsg(null);
  };

  const toggleServiceSelection = (id: string) => {
    setSelectedServiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Step 2: Final Connect
  const handleFinalConnect = () => {
    const finalAuthUrl = constructedAuthUrl;
    const finalApiUrl = `${constructedApiUrl}${API_PATHS.DISCOVERY}`;
    
    const finalServices = discoveredServices.filter(s => selectedServiceIds.has(s.id));
    onLogin(username, password, finalApiUrl, finalAuthUrl, finalServices);
  };

  const UrlPreview: React.FC<{ url: string, label: string }> = ({ url, label }) => (
    <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
        <div className="flex items-center gap-0.5 text-[10px] font-mono text-slate-500 bg-slate-900/50 p-2 rounded-lg border border-slate-800 w-full overflow-hidden whitespace-nowrap">
            <span className="text-slate-400 truncate">{url}</span>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-6 font-sans text-slate-200">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-5 gap-0 shadow-2xl rounded-[2rem] overflow-hidden border border-slate-800 bg-[#13161c]">
        
        {/* Left Branding Panel */}
        <div className="md:col-span-2 relative bg-indigo-950/30 p-10 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.8),rgba(15,23,42,0.95))] z-0"></div>
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="relative z-10">
             <div className="bg-white/5 w-fit p-3 rounded-2xl border border-white/10 mb-8 backdrop-blur-sm">
                <Radar className="text-indigo-400 w-8 h-8" />
             </div>
             <h1 className="text-3xl font-black text-white tracking-tighter mb-4 leading-tight">
               System <br/>
               <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Observability</span>
             </h1>
             <p className="text-slate-400 text-xs leading-relaxed font-medium max-w-[240px]">
               Establish a secure session, configure dynamic topology, and inject log overrides across distributed microservices.
             </p>
          </div>

          <div className="relative z-10 space-y-4">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
               Gateway Online
             </div>
          </div>
        </div>

        {/* Right Configuration Panel */}
        <div className="md:col-span-3 p-8 md:p-12 bg-[#0a0c10] relative flex flex-col">
          
          <div className="flex items-center gap-4 mb-8">
             <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-800'}`} />
             <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-800'}`} />
          </div>

          {step === 1 && (
            <form onSubmit={handleScanEnvironment} className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300 flex-1 flex flex-col">
              
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <UserCircle className="w-3.5 h-3.5" /> Identity Configuration
                    </h3>
                 </div>

                 <div className="relative group">
                    <select 
                        value={selectedProfileId}
                        onChange={(e) => handleProfileChange(e.target.value)}
                        className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-white appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-bold cursor-pointer hover:border-slate-700 transition-colors"
                    >
                        {SAVED_PROFILES.map(p => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 rotate-90 pointer-events-none" />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Client ID</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 text-xs font-mono focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Client Secret</label>
                        <div className="relative">
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 text-xs font-mono focus:border-indigo-500 outline-none"
                            />
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                        </div>
                    </div>
                 </div>
              </div>

              <div className="h-px bg-slate-800 w-full" />

              <div className="space-y-5">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5" /> Connection Topology
                 </h3>

                 {/* DROPDOWN 1: Cluster Selection */}
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Select Cluster Node</label>
                    <div className="relative">
                        <select 
                            value={selectedClusterId}
                            onChange={(e) => setSelectedClusterId(e.target.value)}
                            className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-indigo-300 appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono font-bold cursor-pointer hover:border-slate-700 transition-colors"
                        >
                            {CLUSTERS.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <Database className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                 </div>

                 {/* DROPDOWN 2: Environment Selection */}
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Select Environment</label>
                    <div className="relative">
                        <select 
                            value={selectedEnvId}
                            onChange={(e) => setSelectedEnvId(e.target.value)}
                            className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-emerald-400 appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono font-bold cursor-pointer hover:border-slate-700 transition-colors"
                        >
                            {ENVIRONMENTS.map(env => (
                                <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                        </select>
                        <Globe className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                 </div>

                 <div className="space-y-3 pt-2 bg-slate-900/20 p-4 rounded-xl border border-slate-800/50">
                    <UrlPreview label="Target API Path" url={`${constructedApiUrl}${API_PATHS.DISCOVERY}`} />
                    <UrlPreview label="Target Auth Provider" url={constructedAuthUrl} />
                 </div>
              </div>

              {errorMsg && (
                 <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-rose-400">Connection Failed</p>
                        <p className="text-[10px] text-rose-300/80 mt-1 leading-relaxed">{errorMsg}</p>
                        <button 
                            type="button"
                            onClick={loadDemoData}
                            className="mt-2 text-[10px] font-black uppercase text-indigo-400 hover:text-white underline"
                        >
                            Or load offline demo data instead?
                        </button>
                    </div>
                 </div>
              )}

              <div className="pt-2 mt-auto">
                <button
                    type="submit"
                    disabled={isDiscovering || !username}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-900/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    {isDiscovering ? (
                        <>
                            <Activity className="w-4 h-4 animate-spin" />
                            Scanning...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4" />
                            Scan Environment
                        </>
                    )}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-500 flex flex-col h-full">
                
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white">Target Services</h2>
                        <p className="text-xs text-slate-400 mt-1">
                            Connected to: <span className="text-emerald-400 font-mono bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/50">{constructedApiUrl.replace('https://', '')}</span>
                        </p>
                    </div>
                    <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-2">
                        {discoveredServices.length} Detected
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800 rounded-2xl bg-[#0a0c10]/50 p-2 space-y-1 min-h-[200px]">
                    <div className="flex justify-end px-2 py-1">
                         <button 
                            onClick={() => {
                                if (selectedServiceIds.size === discoveredServices.length) setSelectedServiceIds(new Set());
                                else setSelectedServiceIds(new Set(discoveredServices.map(s => s.id)));
                            }}
                            className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                         >
                            {selectedServiceIds.size === discoveredServices.length ? 'None' : 'Select All'}
                         </button>
                    </div>
                    
                    {discoveredServices.map(svc => (
                        <div 
                            key={svc.id}
                            onClick={() => toggleServiceSelection(svc.id)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200 group ${
                                selectedServiceIds.has(svc.id)
                                ? 'bg-indigo-600/10 border-indigo-500/50'
                                : 'bg-transparent border-transparent hover:bg-slate-800/50 hover:border-slate-800'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                    selectedServiceIds.has(svc.id)
                                    ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                                    : 'border-slate-700 bg-transparent group-hover:border-slate-500'
                                }`}>
                                    <CheckCircle2 className={`w-3.5 h-3.5 text-white ${selectedServiceIds.has(svc.id) ? 'opacity-100' : 'opacity-0'}`} />
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-xs font-bold transition-colors ${selectedServiceIds.has(svc.id) ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{svc.name}</span>
                                    <span className="text-[9px] font-mono text-slate-600">{svc.id}</span>
                                </div>
                            </div>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                svc.defaultLevel === 'ERROR' ? 'bg-rose-500/10 text-rose-500' : 
                                svc.defaultLevel === 'WARN' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-500'
                            }`}>
                                {svc.defaultLevel}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-800/50">
                    <button
                        onClick={handleFinalConnect}
                        disabled={selectedServiceIds.size === 0}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <Server className="w-4 h-4" />
                        Initialize Dashboard ({selectedServiceIds.size})
                    </button>
                    <button
                        onClick={() => setStep(1)}
                        className="w-full text-slate-500 hover:text-white text-xs font-bold py-2 transition-colors flex items-center justify-center gap-2"
                    >
                        Modify Configuration
                    </button>
                </div>
             </div>
          )}

        </div>
      </div>
      
      <div className="fixed bottom-6 text-center w-full pointer-events-none opacity-40">
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em]">End-to-End Encrypted Session</p>
      </div>
    </div>
  );
};

export default Login;
