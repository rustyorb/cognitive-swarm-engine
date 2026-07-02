import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BrainCircuit, Cpu, Zap, Binary, Check, Database, Settings, Copy, Download, History, X, ChevronDown, ChevronUp, LayoutGrid, Waypoints, Globe, Telescope, Fingerprint, Printer } from 'lucide-react';
import { AgentProfile, AgentExecutionState, AppConfig } from './types';
import { AgentCard } from './components/AgentCard';
import { ConfigPanel } from './components/ConfigPanel';
import { SwarmDirector } from './components/SwarmDirector';
import { SwarmConstellation } from './components/SwarmConstellation';
import { InterrogatePanel } from './components/InterrogatePanel';

type Phase = 'IDLE' | 'ORCHESTRATING' | 'REVIEW' | 'EXECUTING' | 'SYNTHESIZING' | 'DONE' | 'ERROR';
type ViewMode = 'grid' | 'constellation';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RunRecord {
  id: string;
  query: string;
  dossier: string;
  timestamp: number;
  messages?: ChatMessage[];
}

const HISTORY_KEY = 'swarm_run_history';

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
  },
  webGrounding: true,
  investigative: true
};

const LENSES: { key: string; label: string }[] = [
  { key: 'full', label: 'Full Dossier' },
  { key: 'executive', label: 'Executive Brief' },
  { key: 'technical', label: 'Deep-Dive' },
  { key: 'eli5', label: 'ELI5' },
  { key: 'skeptic', label: "Skeptic's Cut" },
  { key: 'slides', label: 'Slide Outline' }
];

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
        const parsed = JSON.parse(saved);
        // One-time migration: turn the investigative + grounding modes ON.
        // `_v` marks that this ran, so we force it only once and respect the
        // user's own toggles afterward (even if they later turn a mode off).
        if (!parsed._v) {
          parsed.webGrounding = true;
          parsed.investigative = true;
          parsed._v = 1;
          // Persist immediately so the stamp sticks (and we don't re-force on every load).
          try { localStorage.setItem('swarm_app_config', JSON.stringify(parsed)); } catch { /* quota */ }
        }
        return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_CONFIG;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('constellation');
  const [activeRunId, setActiveRunId] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [activeLens, setActiveLens] = useState('full');
  const [lensCache, setLensCache] = useState<Record<string, string>>({});
  const [lensStreaming, setLensStreaming] = useState(false);
  const lensAbortRef = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<RunRecord[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isRunning = phase === 'ORCHESTRATING' || phase === 'EXECUTING' || phase === 'SYNTHESIZING';

  useEffect(() => {
    if (phase === 'DONE' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [phase]);

  // Warn before a reload/navigation wipes an in-flight run (the report lives
  // in memory until synthesis completes).
  useEffect(() => {
    if (!isRunning) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRunning]);

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

  const persistHistory = (next: RunRecord[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  };

  const saveRunToHistory = (runQuery: string, runDossier: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActiveRunId(id);
    setHistory(prev => {
      const entry: RunRecord = { id, query: runQuery, dossier: runDossier, timestamp: Date.now() };
      const next = [entry, ...prev].slice(0, 20);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // The dossier text currently on screen (the selected lens, or the original).
  const shownDossier = activeLens === 'full' ? dossier : (lensCache[activeLens] ?? dossier);

  const resetLenses = () => {
    lensAbortRef.current?.abort();
    lensAbortRef.current = null;
    setActiveLens('full');
    setLensCache({});
    setLensStreaming(false);
  };

  // Persist an interrogation thread onto its run record in history.
  const updateRunMessages = (id: string, messages: ChatMessage[]) => {
    if (!id) return;
    setHistory(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], messages };
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const loadRun = (run: RunRecord) => {
    resetLenses();
    setQuery(run.query);
    setDossier(run.dossier);
    setAgents([]);
    setAgentStates({});
    setErrorMsg(null);
    setActiveRunId(run.id);
    setPhase('DONE');
  };

  const handleHalt = () => {
    abortRef.current?.abort();
  };

  const handleCopy = async () => {
    if (!shownDossier) return;
    try {
      await navigator.clipboard.writeText(shownDossier);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = () => {
    if (!shownDossier) return;
    const blob = new Blob([shownDossier], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = activeLens === 'full' ? '' : `-${activeLens}`;
    a.download = `swarm-dossier${suffix}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Open the rendered dossier in a clean, light print view (Save as PDF).
  const handlePrint = () => {
    const el = document.getElementById('dossier-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=850,height=1100');
    if (!w) return;
    const title = (shownDossier || 'Dossier').replace(/^#\s*/, '').split('\n')[0].slice(0, 80);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      * { box-sizing: border-box; }
      body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; }
      h1, h2, h3, h4 { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.25; margin-top: 1.6em; color: #111; }
      h1 { font-size: 1.9rem; border-bottom: 2px solid #ddd; padding-bottom: .3em; }
      h2 { font-size: 1.4rem; border-bottom: 1px solid #eee; padding-bottom: .2em; }
      h3 { font-size: 1.15rem; }
      a { color: #7a4a12; }
      code { background: #f2efe9; padding: .1em .35em; border-radius: 3px; font-size: .9em; }
      pre { background: #f6f4ef; border: 1px solid #e5e0d6; padding: 1em; overflow-x: auto; border-radius: 4px; }
      table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .92em; }
      th, td { border: 1px solid #d8d2c6; padding: .5em .7em; text-align: left; vertical-align: top; }
      th { background: #f4f1ea; }
      blockquote { border-left: 3px solid #cbb48a; margin: 1em 0; padding: .2em 1em; color: #555; }
      @media print { body { margin: 0; max-width: none; } a { color: #333; } }
    </style></head><body><article>${el.innerHTML}</article></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  // Re-render the finished dossier through a "lens" (executive brief, ELI5, …).
  // 'full' shows the original; other lenses stream once from /api/lens, then cache.
  const handleLens = async (lens: string) => {
    if (lens === 'full') {
      lensAbortRef.current?.abort();
      setLensStreaming(false);
      setActiveLens('full');
      return;
    }
    setActiveLens(lens);
    if (lensCache[lens] || !dossier) return; // already generated (or nothing to transform)

    lensAbortRef.current?.abort();
    const controller = new AbortController();
    lensAbortRef.current = controller;
    setLensStreaming(true);
    setLensCache(prev => ({ ...prev, [lens]: '' }));

    try {
      const res = await fetch('/api/lens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossier, lens, config }),
        signal: controller.signal
      });
      if (!res.ok || !res.body) throw new Error(`Lens failed: ${await res.text()}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLensCache(prev => ({ ...prev, [lens]: acc }));
      }
      acc += decoder.decode();
      reader.releaseLock();
      setLensCache(prev => ({ ...prev, [lens]: acc || '_(empty response)_' }));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Discard the partial so re-selecting this lens streams a full version.
        setLensCache(prev => { const next = { ...prev }; delete next[lens]; return next; });
      } else {
        setLensCache(prev => ({ ...prev, [lens]: `**Lens error:** ${err.message || 'Unknown error'}` }));
      }
    } finally {
      // Only clear shared state if this invocation still owns the request
      // (a newer lens may have replaced the ref while this one was aborting).
      if (lensAbortRef.current === controller) {
        setLensStreaming(false);
        lensAbortRef.current = null;
      }
    }
  };

  // Ask the orchestrator to design a swarm for the current query.
  const fetchAgents = async (signal: AbortSignal): Promise<AgentProfile[]> => {
    const orchRes = await fetch('/api/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, config }),
      signal
    });
    if (!orchRes.ok) throw new Error(`Orchestration failed: ${await orchRes.text()}`);
    const orchData = await orchRes.json();
    const generatedAgents: AgentProfile[] = orchData.agents;
    if (!Array.isArray(generatedAgents) || generatedAgents.length === 0) {
      throw new Error("Orchestration failed: the model did not return a valid list of agents. Try again or pick a different orchestrator model.");
    }
    return generatedAgents;
  };

  // Stage 1: design the swarm, then hand off to the Director for review.
  const handleOrchestrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setPhase('ORCHESTRATING');
    setErrorMsg(null);
    setAgents([]);
    setAgentStates({});
    setDossier(null);
    setActiveRunId('');

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const generatedAgents = await fetchAgents(controller.signal);
      setAgents(generatedAgents);
      setPhase('REVIEW');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.name === 'AbortError' ? 'Run halted by operator.' : (err.message || 'An unknown error occurred'));
      setPhase('ERROR');
    } finally {
      abortRef.current = null;
    }
  };

  // Re-roll the swarm from the Director without leaving review.
  const handleRegenerate = async () => {
    setRegenerating(true);
    setErrorMsg(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const generatedAgents = await fetchAgents(controller.signal);
      setAgents(generatedAgents);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error(err);
        setErrorMsg(err.message || 'An unknown error occurred');
        setPhase('ERROR');
      }
    } finally {
      setRegenerating(false);
      abortRef.current = null;
    }
  };

  const handleDiscard = () => {
    setPhase('IDLE');
    setAgents([]);
    setAgentStates({});
    setErrorMsg(null);
  };

  const toggleGrounding = () => {
    handleConfigSave({ ...config, webGrounding: !config.webGrounding });
  };

  const toggleInvestigative = () => {
    handleConfigSave({ ...config, investigative: !config.investigative });
  };

  // Stage 2: run the (possibly edited) swarm and synthesize the dossier.
  const launchSwarm = async () => {
    const launchAgents = agents;
    if (launchAgents.length === 0) return;

    resetLenses();
    setPhase('EXECUTING');
    setErrorMsg(null);
    setDossier(null);
    setActiveRunId('');

    const initialStates: Record<string, AgentExecutionState> = {};
    launchAgents.forEach(agent => {
      initialStates[agent.id] = { profile: agent, state: 'PENDING', result: null };
    });
    setAgentStates(initialStates);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      // Parallel Execute
      const results = await Promise.all(
        launchAgents.map(async (agent) => {
          let accumulatedResult = '';
          try {
            updateAgentState(agent.id, { state: 'GATHERING_TELEMETRY' });

            const res = await fetch('/api/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, agent, config }),
              signal
            });

            if (!res.ok) {
              let apiError = 'API Error';
              try {
                const errData = await res.json();
                if (errData?.error) apiError = errData.error;
              } catch { /* non-JSON error body */ }
              throw new Error(apiError);
            }
            if (!res.body) throw new Error('No stream body');

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');

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
            return { agent, result: accumulatedResult, ok: true };

          } catch (err: any) {
            console.error(`Agent ${agent.id} failed`, err);
            const message = err?.name === 'AbortError' ? 'Aborted' : (err.message || 'Unknown error');
            updateAgentState(agent.id, { state: 'ERROR', error: message });
            return { agent, result: accumulatedResult, ok: false };
          }
        })
      );

      // 3. Synthesize (only successfully-resolved agents)
      const successfulResults = results
        .filter(r => r.ok)
        .map(({ agent, result }) => ({ agent, result }));

      if (successfulResults.length === 0) {
        throw new Error('All specialist agents failed — check provider configuration.');
      }

      setPhase('SYNTHESIZING');
      const syncRes = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, results: successfulResults, config }),
        signal
      });

      if (!syncRes.ok) throw new Error(`Synthesis failed: ${await syncRes.text()}`);
      if (!syncRes.body) throw new Error('No synthesis stream body');

      // Stream the dossier so it renders as it compiles instead of appearing
      // all at once at the very end (and never silently ending empty).
      const synthReader = syncRes.body.getReader();
      const synthDecoder = new TextDecoder('utf-8');
      let compiledDossier = '';
      setDossier('');

      while (true) {
        const { done, value } = await synthReader.read();
        if (done) break;
        compiledDossier += synthDecoder.decode(value, { stream: true });
        setDossier(compiledDossier);
      }

      // Flush any buffered UTF-8 bytes.
      compiledDossier += synthDecoder.decode();
      setDossier(compiledDossier);
      synthReader.releaseLock();

      if (!compiledDossier.trim()) {
        throw new Error('Synthesis returned an empty dossier — try again or pick a different synthesizer model.');
      }

      setPhase('DONE');
      saveRunToHistory(query, compiledDossier);

    } catch (err: any) {
      console.error(err);
      if (err?.name === 'AbortError') {
        setAgentStates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(id => {
            if (next[id].state !== 'RESOLVED' && next[id].state !== 'ERROR') {
              next[id] = { ...next[id], state: 'ERROR', error: 'Aborted' };
            }
          });
          return next;
        });
        setErrorMsg('Run halted by operator.');
      } else {
        setErrorMsg(err.message || 'An unknown error occurred');
      }
      setPhase('ERROR');
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="min-h-screen text-stone-100 font-sans">
      <div className="crt-overlay" aria-hidden="true" />

      {/* Header */}
      <header className="border-b border-stone-900 bg-black/50 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-phosphor-400 min-w-0">
            <BrainCircuit className="w-6 h-6 shrink-0 glow-amber" />
            <h1 className="font-display text-base sm:text-lg font-bold tracking-widest uppercase truncate glow-amber">Cognitive_Swarm_Engine</h1>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-stone-500 uppercase">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {config.models.orchestrator.model}</span>
              <span className="flex items-center gap-1"><Binary className="w-3 h-3" /> {config.models.specialist.model}</span>
            </div>
            <button
              onClick={() => setIsConfigOpen(true)}
              className="p-2 text-stone-400 hover:text-phosphor-400 hover:bg-phosphor-950/20 rounded border border-stone-900 hover:border-phosphor-900/50 transition-all bg-black"
              title="Configure Swarm Models"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

        {/* Input Interface */}
        <section className="bg-stone-950/80 border border-stone-800 p-4 sm:p-6 rounded-xl shadow-2xl shadow-phosphor-950/20">
          <form onSubmit={handleOrchestrate} className="flex flex-col gap-4">
            <label htmlFor="query" className="text-sm font-mono text-stone-400 uppercase tracking-wider flex flex-wrap gap-2 justify-between items-center">
              <span>Input Research Vector</span>
              <span className="text-xs text-phosphor-500 uppercase tracking-widest normal-case">Orchestrated by: {config.models.orchestrator.model}</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Analyze the socio-economic impacts of asteroid mining by 2050..."
                className="flex-1 bg-black border border-stone-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-phosphor-500 focus:ring-1 focus:ring-phosphor-500 transition-all font-mono"
                disabled={isRunning}
              />
              {isRunning ? (
                <button
                  type="button"
                  onClick={handleHalt}
                  className="bg-red-950 text-red-400 border border-red-900 px-8 py-3 rounded-lg font-mono font-bold uppercase tracking-wider hover:bg-red-900 hover:text-red-300 transition-colors"
                >
                  Halt
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="bg-phosphor-950 text-phosphor-400 border border-phosphor-900 px-8 py-3 rounded-lg font-mono font-bold uppercase tracking-wider hover:bg-phosphor-900 hover:text-phosphor-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {phase === 'REVIEW' ? 'Re-Design' : 'Initialize'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleInvestigative}
                disabled={isRunning}
                aria-pressed={!!config.investigative}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-50 ${
                  config.investigative
                    ? 'border-phosphor-800 bg-phosphor-950/40 text-phosphor-300 glow-amber'
                    : 'border-stone-800 bg-black text-stone-500 hover:text-phosphor-400 hover:border-phosphor-900/50'
                }`}
                title="Investigative mode: the swarm hunts non-obvious connections, biographical/institutional context, and documented-but-underemphasized threads instead of the canonical summary."
              >
                <Fingerprint className={`w-3.5 h-3.5 ${config.investigative ? 'animate-pulse' : ''}`} />
                Investigative: {config.investigative ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={toggleGrounding}
                disabled={isRunning}
                aria-pressed={!!config.webGrounding}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-50 ${
                  config.webGrounding
                    ? 'border-phosphor-800 bg-phosphor-950/40 text-phosphor-300 glow-amber'
                    : 'border-stone-800 bg-black text-stone-500 hover:text-phosphor-400 hover:border-phosphor-900/50'
                }`}
                title="Ground specialist research in live web search (Gemini uses native search; other providers use Brave/Serply if a key is set)"
              >
                <Globe className={`w-3.5 h-3.5 ${config.webGrounding ? 'animate-spin-slow' : ''}`} />
                Web-Grounded: {config.webGrounding ? 'ON' : 'OFF'}
              </button>
            </div>
          </form>
        </section>

        {/* Phase Indicator */}
        {phase !== 'IDLE' && phase !== 'REVIEW' && (
          <div className="flex flex-col gap-2 font-mono text-sm border-l-2 border-stone-800 pl-4 py-2">
            <div className={`flex items-center gap-2 ${phase === 'ORCHESTRATING' ? 'text-phosphor-400 animate-pulse glow-amber' : 'text-stone-500'}`}>
              <Cpu className="w-4 h-4" /> [1. ORCHESTRATION_NODE_ACTIVE: {config.models.orchestrator.model}]
            </div>
            <div className={`flex items-center gap-2 ${phase === 'EXECUTING' ? 'text-orange-400 animate-pulse glow-amber' : 'text-stone-500'}`}>
              <Binary className="w-4 h-4" /> [2. PARALLEL_SWARM_EXECUTION: {config.models.specialist.model}]
            </div>
            <div className={`flex items-center gap-2 ${phase === 'SYNTHESIZING' ? 'text-phosphor-400 animate-pulse glow-amber' : 'text-stone-500'}`}>
              <BrainCircuit className="w-4 h-4" /> [3. SYNTHESIS_NODE_COMPILING: {config.models.synthesizer.model}]
            </div>
            {phase === 'DONE' && (
              <div className="flex items-center gap-2 text-lime-400 glow-green">
                <Check className="w-4 h-4" /> [SYSTEM_HALT: RESOLVED]
              </div>
            )}
            {phase === 'ERROR' && (
              <div className="text-red-500 glow-red">
                [FATAL_EXCEPTION]: {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Swarm Director (human-in-the-loop review) */}
        {phase === 'REVIEW' && agents.length > 0 && (
          <SwarmDirector
            agents={agents}
            onChange={setAgents}
            onLaunch={launchSwarm}
            onRegenerate={handleRegenerate}
            onDiscard={handleDiscard}
            regenerating={regenerating}
          />
        )}

        {/* Telemetry HUD */}
        {agents.length > 0 && phase !== 'REVIEW' && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-mono text-stone-500 uppercase tracking-widest">Live Telemetry HUD</h2>
              <div className="flex items-center gap-1 bg-black/50 border border-stone-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('constellation')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-widest transition-colors ${viewMode === 'constellation' ? 'bg-phosphor-950 text-phosphor-300' : 'text-stone-500 hover:text-phosphor-400'}`}
                  title="Constellation view"
                >
                  <Waypoints className="w-3.5 h-3.5" /> Swarm
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-widest transition-colors ${viewMode === 'grid' ? 'bg-phosphor-950 text-phosphor-300' : 'text-stone-500 hover:text-phosphor-400'}`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grid
                </button>
              </div>
            </div>
            {viewMode === 'constellation' ? (
              <SwarmConstellation agents={agents} agentStates={agentStates} phase={phase} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {agents.map((agent, i) => (
                  <div key={agent.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                    <AgentCard
                      executionState={agentStates[agent.id] || { profile: agent, state: 'PENDING', result: null }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Final Dossier Render */}
        {dossier && (
          <section className="mt-8 border border-stone-800 rounded-xl bg-black/70 overflow-hidden shadow-2xl shadow-phosphor-950/30 animate-fade-up">
            <div className="bg-stone-900 border-b border-stone-800 px-6 py-3 flex items-center justify-between">
              <h3 className="font-mono text-sm text-phosphor-400 uppercase tracking-widest flex items-center gap-2">
                <Database className="w-4 h-4" />
                Compiled Markdown Dossier
              </h3>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-stone-500">{(shownDossier || '').length} BYTES</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 text-stone-400 hover:text-phosphor-400 hover:bg-phosphor-950/20 rounded border border-stone-800 hover:border-phosphor-900/50 transition-all bg-black"
                  title="Copy dossier to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-lime-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 text-stone-400 hover:text-phosphor-400 hover:bg-phosphor-950/20 rounded border border-stone-800 hover:border-phosphor-900/50 transition-all bg-black"
                  title="Download dossier as markdown"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="p-1.5 text-stone-400 hover:text-phosphor-400 hover:bg-phosphor-950/20 rounded border border-stone-800 hover:border-phosphor-900/50 transition-all bg-black"
                  title="Print / Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Lens bar — re-render the finished dossier for different audiences */}
            {phase === 'DONE' && (
              <div className="border-b border-stone-800 bg-stone-950/60 px-4 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-stone-500 mr-1">
                  <Telescope className="w-3.5 h-3.5" /> Lens
                </span>
                {LENSES.map(l => {
                  const isActive = activeLens === l.key;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => handleLens(l.key)}
                      disabled={lensStreaming && !isActive}
                      className={`px-3 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-colors disabled:opacity-40 ${
                        isActive
                          ? 'border-phosphor-700 bg-phosphor-950/50 text-phosphor-300'
                          : 'border-stone-800 bg-black text-stone-500 hover:text-phosphor-400 hover:border-phosphor-900/50'
                      }`}
                    >
                      {l.label}
                      {isActive && lensStreaming && l.key !== 'full' && <span className="cursor-blink" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div id="dossier-content" className="p-5 sm:p-8 prose prose-invert prose-stone max-w-none
                            prose-headings:font-display prose-headings:tracking-tight
                            prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl
                            prose-a:text-phosphor-400 prose-strong:text-phosphor-200
                            prose-code:text-orange-300 prose-code:bg-orange-950/40 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-stone-950 prose-pre:border prose-pre:border-stone-800
                            prose-th:text-phosphor-300 prose-th:border-stone-700 prose-td:border-stone-800 prose-blockquote:border-phosphor-700
                            prose-table:block prose-table:overflow-x-auto">
              {activeLens !== 'full' && lensStreaming && !shownDossier ? (
                <p className="font-mono text-sm text-phosphor-400 cursor-blink">Refracting dossier through {LENSES.find(l => l.key === activeLens)?.label} lens</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{shownDossier || ''}</ReactMarkdown>
              )}
            </div>
          </section>
        )}

        {/* Interrogate the Swarm (post-run Q&A grounded in the dossier) */}
        {phase === 'DONE' && dossier && (
          <InterrogatePanel
            runId={activeRunId || 'current'}
            query={query}
            dossier={dossier}
            findings={Object.values(agentStates)
              .filter(s => s.state === 'RESOLVED' && s.result)
              .map(s => ({ designation: s.profile.designation, result: s.result as string }))}
            config={config}
            initialMessages={history.find(r => r.id === activeRunId)?.messages}
            onMessagesChange={(m) => updateRunMessages(activeRunId, m)}
          />
        )}

        {/* Run History */}
        {history.length > 0 && !isRunning && (
          <section className="border border-stone-900 rounded-xl bg-stone-950/50">
            <button
              type="button"
              onClick={() => setHistoryOpen(prev => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono text-stone-500 uppercase tracking-widest hover:text-phosphor-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                Run History ({history.length})
              </span>
              {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {historyOpen && (
              <div className="border-t border-stone-900 divide-y divide-stone-900">
                {history.map(run => (
                  <div key={run.id} className="flex items-center gap-3 px-4 py-2 hover:bg-phosphor-950/10 transition-colors">
                    <button
                      type="button"
                      onClick={() => loadRun(run)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                      title="Load this run"
                    >
                      <span className="font-mono text-xs text-stone-600 whitespace-nowrap">
                        {new Date(run.timestamp).toLocaleString()}
                      </span>
                      <span className="text-sm text-stone-400 truncate">{run.query}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => persistHistory(history.filter(r => r.id !== run.id))}
                      className="p-1 text-stone-700 hover:text-red-400 transition-colors"
                      title="Delete run"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => persistHistory([])}
                    className="text-xs font-mono uppercase tracking-wider text-stone-600 hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
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
