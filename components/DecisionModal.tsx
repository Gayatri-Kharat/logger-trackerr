
import React from 'react';
import { ShieldAlert, Clock, RefreshCw, XCircle } from 'lucide-react';
import { ActiveOverride } from '../types';

interface DecisionModalProps {
  expiringOverrides: ActiveOverride[];
  onKeep: () => void;
  onAccept: () => void;
}

const DecisionModal: React.FC<DecisionModalProps> = ({ expiringOverrides, onKeep, onAccept }) => {
  if (expiringOverrides.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-xl w-full overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 mx-6">
        <div className="bg-amber-500 p-10 flex flex-col items-center text-center gap-6 text-white">
          <div className="bg-white/20 p-5 rounded-full backdrop-blur-md">
            <ShieldAlert className="w-12 h-12 text-white" />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tighter uppercase mb-2">Protocol Warning</h3>
            <p className="text-amber-50 text-sm font-medium opacity-90">
              Automatic reset sequence initiated for <span className="font-bold underline decoration-2 underline-offset-4">{expiringOverrides.length} service(s)</span>
            </p>
          </div>
        </div>
        
        <div className="p-10">
          <div className="space-y-3 mb-10 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
            {expiringOverrides.map(o => (
              <div key={o.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{o.envId}</div>
                  <div className="text-sm font-black text-slate-800 truncate">{o.serviceName}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl">{o.level}</span>
                  <div className="flex items-center gap-2 text-amber-600 font-black text-xs">
                    <Clock className="w-4 h-4" />
                    &lt;1m
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
              onClick={onKeep}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest py-5 rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" />
              Maintain State
            </button>
            <button 
              onClick={onAccept}
              className="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <XCircle className="w-4 h-4" />
              Authorize Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DecisionModal;
