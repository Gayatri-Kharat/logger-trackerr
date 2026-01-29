
import React, { useState } from 'react';
import { Sparkles, Bot, ArrowRight, Activity, Microscope, CheckCircle2 } from 'lucide-react';
import type { Service, DiagnosticSuggestion, LogLevel } from '../types';
import { getDiagnosticAdvice } from '../services/diagnosticService';

interface AiAssistantProps {
  availableServices: Service[];
  onApplySuggestion: (serviceId: string, level: LogLevel) => void;
}

const AiAssistant: React.FC<AiAssistantProps> = ({ availableServices, onApplySuggestion }) => {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<DiagnosticSuggestion[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    
    setIsAnalyzing(true);
    setSuggestions([]);
    
    // Call the local heuristic engine
    const results = await getDiagnosticAdvice(input, availableServices);
    
    setSuggestions(results);
    setIsAnalyzing(false);
    setHasRun(true);
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-slate-200 shadow-xl shadow-indigo-100/50 overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      
      <div className="p-6 md:p-8 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">AI Diagnostic Assistant</h2>
            <p className="text-xs text-slate-500 font-medium">Paste error logs or describe the issue to generate observability strategies.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-4">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex: 'Order service is timing out with 504 Gateway Timeout' or paste a stack trace..."
                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-mono text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all placeholder:text-slate-400"
              />
              <div className="absolute bottom-3 right-3">
                 <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !input.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2"
                 >
                    {isAnalyzing ? (
                        <>
                           <Activity className="w-3 h-3 animate-spin" /> Analyzing...
                        </>
                    ) : (
                        <>
                           <Sparkles className="w-3 h-3" /> Analyze
                        </>
                    )}
                 </button>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-1 min-h-[140px] flex flex-col">
             {!hasRun ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 opacity-60">
                     <Microscope className="w-8 h-8" />
                     <span className="text-xs font-bold uppercase tracking-widest">Waiting for input</span>
                 </div>
             ) : suggestions.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                     <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                     <span className="text-xs font-bold text-slate-600">No anomalies detected</span>
                     <p className="text-[10px] text-center max-w-[200px]">The input didn't match known patterns. Try selecting services manually.</p>
                 </div>
             ) : (
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                     {suggestions.map((suggestion, idx) => (
                         <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-colors">
                             <div>
                                 <div className="flex items-center gap-2 mb-1">
                                     <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase">{suggestion.serviceId}</span>
                                     <ArrowRight className="w-3 h-3 text-slate-300" />
                                     <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                                         suggestion.suggestedLevel === 'TRACE' ? 'bg-fuchsia-100 text-fuchsia-600' :
                                         suggestion.suggestedLevel === 'DEBUG' ? 'bg-cyan-100 text-cyan-600' :
                                         'bg-amber-100 text-amber-600'
                                     }`}>{suggestion.suggestedLevel}</span>
                                 </div>
                                 <p className="text-[10px] text-slate-500 font-medium leading-tight">{suggestion.reason}</p>
                             </div>
                             <button 
                                onClick={() => onApplySuggestion(suggestion.serviceId, suggestion.suggestedLevel)}
                                className="bg-slate-900 text-white text-[10px] font-bold px-3 py-2 rounded-lg hover:bg-indigo-600 transition-colors shrink-0 ml-3"
                             >
                                Select
                             </button>
                         </div>
                     ))}
                 </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiAssistant;
