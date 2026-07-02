import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { BrainCircuit, Cpu, Zap, Binary, Check, Database, Settings } from 'lucide-react';
import { AgentProfile, AgentExecutionState, AppConfig } from './types';
import { AgentCard } from './components/AgentCard';
import { ConfigPanel } from './components/ConfigPanel';

type Phase = 'IDLE' | 'ORCHESTRATING' | 'EXECUTING' | 'SYNTHESIZING' | 'DONE' | 'ERROR';

const DEFAULT_CONFIG: AppConfig = {
  providers: {
    gemini: { apiKey: '', baseUrl: '' },
    openai: { apiKey: '', baseUrl: '' },
    openrouter: { apiKey: '', baseUrl: '' },
    anthropic: { apiKey: '', baseUrl: '' },
    veniceai: { apiKey: '', baseUrl: '' },
    ollama: { apiKey: '', baseUrl: 'http://localhost:11434' },
    lmstudio: { apiKey: '', baseUrl: 'http://localhost:1234/v1' }
  },
  models: {
    orchestrator: { provider: 'gemini', model: 'gemini-3.5-flash' },
    specialist: { provider: 'gemini', model: 'gemini-3.5-flash' },
    synthesizer: { provider: 'gemini', model: 'gemini-3.1-pro-preview' }
  }
};

export default function App() {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentExecutionState>>({});
  const [dossier, setDossier] = useState<string | null>(null);

  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('swarm_app_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_CONFIG;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === 'DONE' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [phase]);

  const updateAgentState = (id: string, updates: Partial<AgentExecutionState>) => {
    setAgentStates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  };

  const handleConfigSave = (newConfig: AppConfig) => {
    setConfig(newConfig);
    localStorage.setItem('swarm_app_config', JSON.stringify(newConfig));
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setPhase('ORCHESTRATING');
    setErrorMsg(null);
    setAgents([]);
    setAgentStates({});
    setDossier(null);

    try {
      // 1. Orchestrate
      const orchRes = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, config })
      });
      if (!orchRes.ok) throw new Error(`Orchestration failed: ${await orchRes.text()}`);
      const orchData = await orchRes.json();
      const generatedAgents: AgentProfile[] = orchData.agents;
      
      if (!Array.isArray(generatedAgents) || generatedAgents.length === 0) {
        throw new Error("Orchestration failed: The model did not return a valid list of agents. Please try again or select a different model in configuration.");
      }
      
      setAgents(generatedAgents);
      
      const initialStates: Record<string, AgentExecutionState> = {};
      generatedAgents.forEach(agent => {
        initialStates[agent.id] = { profile: agent, state: 'PENDING', result: null };
      });
      setAgentStates(initialStates);
      
      setPhase('EXECUTING');

      // 2. Parallel Execute
      const results = await Promise.all(
        generatedAgents.map(async (agent) => {
          try {
            updateAgentState(agent.id, { state: 'GATHERING_TELEMETRY' });
            
            const res = await fetch('/api/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, agent, config })
            });
            
            if (!res.ok) throw new Error('API Error');
            if (!res.body) throw new Error('No stream body');

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedResult = '';

            let isFirstChunk = true;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              if (isFirstChunk) {
                updateAgentState(agent.id, { state: 'SYNTHESIZING_VECTORS' });
                isFirstChunk = false;
              }

              accumulatedResult += decoder.decode(value, { stream: true });
              updateAgentState(agent.id, { result: accumulatedResult });
            }
            
            updateAgentState(agent.id, { state: 'RESOLVED' });
            return { agent, result: accumulatedResult };

          } catch (err: any) {
            console.error(`Agent ${agent.id} failed`, err);
            updateAgentState(agent.id, { state: 'RESOLVED', error: err.message });
            return { agent, result: `[ERROR_STATE]: ${err.message}` };
          }
        })
      );

      // 3. Synthesize
      setPhase('SYNTHESIZING');
      const syncRes = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, results, config })
      });
      
      if (!syncRes.ok) throw new Error(`Synthesis failed: ${await syncRes.text()}`);
      const syncData = await syncRes.json();
      
      setDossier(syncData.dossier);
      setPhase('DONE');

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unknown error occurred');
      setPhase('ERROR');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-50">
      
      {/* Header */}
      <header className="border-b border-gray-900 bg-black/50 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 text-cyan-400">
            <BrainCircuit className="w-6 h-6" />
            <h1 className="font-mono text-lg font-bold tracking-widest uppercase">Cognitive_Swarm_Engine</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-xs font-mono text-gray-500 uppercase">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {config.models.orchestrator.model}</span>
              <span className="flex items-center gap-1"><Binary className="w-3 h-3" /> {config.models.specialist.model}</span>
            </div>
            <button
              onClick={() => setIsConfigOpen(true)}
              className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-cyan-950/20 rounded border border-gray-900 hover:border-cyan-900/50 transition-all bg-black"
              title="Configure Swarm Models"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8">
        
        {/* Input Interface */}
        <section className="bg-gray-950 border border-gray-800 p-6 rounded-xl">
          <form onSubmit={handleExecute} className="flex flex-col gap-4">
            <label htmlFor="query" className="text-sm font-mono text-gray-400 uppercase tracking-wider flex justify-between items-center">
              <span>Input Research Vector</span>
              <span className="text-xs text-cyan-500 uppercase tracking-widest normal-case">Orchestrated by: {config.models.orchestrator.model}</span>
            </label>
            <div className="flex gap-4">
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Analyze the socio-economic impacts of asteroid mining by 2050..."
                className="flex-1 bg-black border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
                disabled={phase !== 'IDLE' && phase !== 'DONE' && phase !== 'ERROR'}
              />
              <button
                type="submit"
                disabled={!query.trim() || (phase !== 'IDLE' && phase !== 'DONE' && phase !== 'ERROR')}
                className="bg-cyan-950 text-cyan-400 border border-cyan-900 px-8 py-3 rounded-lg font-mono font-bold uppercase tracking-wider hover:bg-cyan-900 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Initialize
              </button>
            </div>
          </form>
        </section>

        {/* Phase Indicator */}
        {phase !== 'IDLE' && (
          <div className="flex flex-col gap-2 font-mono text-sm border-l-2 border-gray-800 pl-4 py-2">
            <div className={`flex items-center gap-2 ${phase === 'ORCHESTRATING' ? 'text-cyan-400 animate-pulse' : 'text-gray-500'}`}>
              <Cpu className="w-4 h-4" /> [1. ORCHESTRATION_NODE_ACTIVE: {config.models.orchestrator.model}]
            </div>
            <div className={`flex items-center gap-2 ${phase === 'EXECUTING' ? 'text-magenta-400 animate-pulse' : 'text-gray-500'}`}>
              <Binary className="w-4 h-4" /> [2. PARALLEL_SWARM_EXECUTION: {config.models.specialist.model}]
            </div>
            <div className={`flex items-center gap-2 ${phase === 'SYNTHESIZING' ? 'text-cyan-400 animate-pulse' : 'text-gray-500'}`}>
              <BrainCircuit className="w-4 h-4" /> [3. SYNTHESIS_NODE_COMPILING: {config.models.synthesizer.model}]
            </div>
            {phase === 'DONE' && (
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-4 h-4" /> [SYSTEM_HALT: RESOLVED]
              </div>
            )}
            {phase === 'ERROR' && (
              <div className="text-red-500">
                [FATAL_EXCEPTION]: {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Telemetry HUD */}
        {agents.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest">Live Telemetry HUD</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {agents.map(agent => (
                <AgentCard 
                  key={agent.id} 
                  executionState={agentStates[agent.id] || { profile: agent, state: 'PENDING', result: null }} 
                />
              ))}
            </div>
          </section>
        )}

        {/* Final Dossier Render */}
        {dossier && (
          <section className="mt-8 border border-gray-800 rounded-xl bg-black overflow-hidden shadow-2xl shadow-cyan-900/10">
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
              <h3 className="font-mono text-sm text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <Database className="w-4 h-4" />
                Compiled Markdown Dossier
              </h3>
              <span className="font-mono text-xs text-gray-500">{dossier.length} BYTES</span>
            </div>
            <div className="p-8 prose prose-invert prose-cyan max-w-none 
                            prose-headings:font-sans prose-headings:tracking-tight 
                            prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                            prose-a:text-cyan-400 prose-code:text-magenta-400 prose-code:bg-magenta-950/30 prose-code:px-1 prose-code:rounded
                            prose-pre:bg-gray-950 prose-pre:border prose-pre:border-gray-800">
              <ReactMarkdown>{dossier}</ReactMarkdown>
            </div>
          </section>
        )}
        
        <div ref={bottomRef} />
      </main>

      {/* Config Panel Modal */}
      {isConfigOpen && (
        <ConfigPanel 
          config={config} 
          onClose={() => setIsConfigOpen(false)} 
          onSave={handleConfigSave} 
        />
      )}

    </div>
  );
}
