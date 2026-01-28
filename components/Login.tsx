
import React, { useState, useEffect } from 'react';
import { Radar, Lock, ChevronRight, Link2, UserCircle, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { SAVED_PROFILES, ENVIRONMENTS, CLUSTERS, API_PATHS, API_URL_TEMPLATE, AUTH_URL_TEMPLATE, DEFAULT_REALM } from '../constants';
import { authenticate } from '../services/authService';
import type { Service, SavedProfile } from '../types';

interface LoginProps {
  onLogin: (
    username: string, 
    password: string, 
    apiEndpoint: string, 
    authEndpoint: string, 
    initialServices: Service[],
    clusterId: string,
    envId: string,
    isUserLogin: boolean,
    publicClientId: string,
    isDemoMode: boolean
  ) => void | Promise<void>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const defaultProfile: SavedProfile = SAVED_PROFILES[0] || { id: '', label: 'Default', username: '', password: '' };
  
  const [selectedProfileId, setSelectedProfileId] = useState<string>(defaultProfile.id);
  const [username, setUsername] = useState(defaultProfile.username);
  const [password, setPassword] = useState(defaultProfile.password);
  const [publicClientId, setPublicClientId] = useState('apigw');

  const [selectedClusterId, setSelectedClusterId] = useState(CLUSTERS[0]?.id || '');
  const [selectedEnvId, setSelectedEnvId] = useState(ENVIRONMENTS[0]?.id || '');
  
  const [constructedApiUrl, setConstructedApiUrl] = useState('');
  const [constructedAuthUrl, setConstructedAuthUrl] = useState('');
  
  useEffect(() => {
    let apiUrl = API_URL_TEMPLATE.replace('{cluster}', selectedClusterId).replace('{env}', selectedEnvId);
    setConstructedApiUrl(apiUrl.replace(/\/$/, ''));

    let authBase = AUTH_URL_TEMPLATE.replace('{cluster}', selectedClusterId).replace('{env}', selectedEnvId);
    authBase = authBase.replace(/\/$/, '');
    const tokenPath = API_PATHS.AUTH_TOKEN.replace('{realm}', DEFAULT_REALM);
    setConstructedAuthUrl(`${authBase}${tokenPath}`);
  }, [selectedClusterId, selectedEnvId]);

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    const profile = SAVED_PROFILES.find(p => p.id === profileId);
    if (profile) {
      setUsername(profile.username);
      setPassword(profile.password);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoading(true);
    setErrorMsg(null);
    
    // Discovery URL
    const targetApiUrl = `${constructedApiUrl}${API_PATHS.DISCOVERY}`;

    try {
        // 1. Authenticate Only
        await authenticate(
            constructedAuthUrl,
            username,
            password,
            { isUserLogin: true, publicClientId }
        );

        // 2. Success - Move to Dashboard immediately
        setIsSuccess(true);
        setTimeout(async () => {
            await onLogin(
                username, 
                password, 
                targetApiUrl, 
                constructedAuthUrl, 
                [], // Empty list triggers background fetch in App.tsx
                selectedClusterId,
                selectedEnvId,
                true, // isUserLogin
                publicClientId,
                false // Not demo mode
            );
        }, 500);

    } catch (err: any) {
      console.error("Login failed:", err);
      setErrorMsg(err.message || "Authentication failed.");
      setIsLoading(false);
    }
  };

  const loadDemoData = () => {
    onLogin(
        username, 
        password, 
        `${constructedApiUrl}${API_PATHS.DISCOVERY}`, 
        constructedAuthUrl, 
        [], 
        selectedClusterId,
        selectedEnvId,
        true,
        publicClientId,
        true // Demo Mode
    );
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
        
        {/* Branding */}
        <div className="md:col-span-2 relative bg-indigo-950/30 p-10 flex flex-col justify-between overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,23,42,0.8),rgba(15,23,42,0.95))] z-0"></div>
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]"></div>
          <div className="relative z-10">
             <div className="bg-white/5 w-fit p-3 rounded-2xl border border-white/10 mb-8 backdrop-blur-sm">
                <Radar className="text-indigo-400 w-8 h-8" />
             </div>
             <h1 className="text-3xl font-black text-white tracking-tighter mb-4 leading-tight">System <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Observability</span></h1>
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-3 p-8 md:p-12 bg-[#0a0c10] relative flex flex-col justify-center">
          <form onSubmit={handleLogin} className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
              
              <div className="space-y-4">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><UserCircle className="w-3.5 h-3.5" /> Identity Configuration</h3>
                 <div className="relative group">
                    <select value={selectedProfileId} onChange={(e) => handleProfileChange(e.target.value)} className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-white appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-bold cursor-pointer hover:border-slate-700 transition-colors">
                        {SAVED_PROFILES.map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 rotate-90 pointer-events-none" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Username</label>
                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 text-xs font-mono focus:border-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Password</label>
                        <div className="relative">
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-3 py-2.5 text-slate-300 text-xs font-mono focus:border-indigo-500 outline-none" />
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                        </div>
                    </div>
                 </div>
                 <div className="space-y-1 pt-2">
                    <label className="text-[9px] font-bold text-indigo-400 uppercase ml-1">Auth Client ID</label>
                    <input type="text" value={publicClientId} onChange={(e) => setPublicClientId(e.target.value)} placeholder="e.g. apigw" className="w-full bg-[#13161c] border border-indigo-900/30 rounded-xl px-3 py-2 text-indigo-300 text-xs font-mono focus:border-indigo-500 outline-none" />
                 </div>
              </div>

              <div className="h-px bg-slate-800 w-full" />

              <div className="space-y-5">
                 <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Link2 className="w-3.5 h-3.5" /> Topology</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Cluster</label>
                        <select value={selectedClusterId} onChange={(e) => setSelectedClusterId(e.target.value)} className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-indigo-300 appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono font-bold cursor-pointer">
                            {CLUSTERS.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-600 uppercase ml-1">Environment</label>
                        <select value={selectedEnvId} onChange={(e) => setSelectedEnvId(e.target.value)} className="w-full bg-[#13161c] border border-slate-800 rounded-xl px-4 py-3 text-emerald-400 appearance-none focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-mono font-bold cursor-pointer">
                            {ENVIRONMENTS.map(env => (<option key={env.id} value={env.id}>{env.name}</option>))}
                        </select>
                    </div>
                 </div>
                 <div className="space-y-3 pt-2 bg-slate-900/20 p-4 rounded-xl border border-slate-800/50">
                    <UrlPreview label="Target API Path" url={`${constructedApiUrl}${API_PATHS.DISCOVERY}`} />
                 </div>
              </div>

              {errorMsg && (
                 <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-bold text-rose-400">Login Failed</p>
                        <p className="text-[10px] text-rose-300/80 mt-1">{errorMsg}</p>
                        <button type="button" onClick={loadDemoData} className="mt-2 text-[10px] font-black uppercase text-indigo-400 hover:text-white underline">Or load offline demo data?</button>
                    </div>
                 </div>
              )}

              <div className="pt-2">
                <button type="submit" disabled={isLoading || isSuccess} className={`w-full font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 ${isSuccess ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                    {isSuccess ? <><CheckCircle2 className="w-5 h-5" /> Connected</> : <><ArrowRight className="w-4 h-4" /> Connect to Environment</>}
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
