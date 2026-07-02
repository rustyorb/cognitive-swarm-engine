import React, { useState, useEffect } from 'react';
import { AppConfig, ProviderConfig } from '../types';
import { Settings, X, Save, RefreshCw, Key, Globe, Sparkles, Server, Check } from 'lucide-react';

interface ConfigPanelProps {
  onClose: () => void;
  config: AppConfig;
  onSave: (newConfig: AppConfig) => void;
}

const PROVIDERS = [
  { id: 'gemini', name: 'Gemini (Default)', placeholderKey: 'Uses default server key if empty', defaultUrl: '' },
  { id: 'openai', name: 'OpenAI', placeholderKey: 'sk-...', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', placeholderKey: 'sk-or-...', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'anthropic', name: 'Anthropic', placeholderKey: 'sk-ant-...', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'veniceai', name: 'Venice.ai', placeholderKey: 'sk-venice-...', defaultUrl: 'https://api.venice.ai/api/v1' },
  { id: 'ollama', name: 'Ollama (Local)', placeholderKey: 'No key needed', defaultUrl: 'http://localhost:11434' },
  { id: 'lmstudio', name: 'LM Studio (Local)', placeholderKey: 'No key needed', defaultUrl: 'http://localhost:1234/v1' }
];

export function ConfigPanel({ onClose, config, onSave }: ConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<AppConfig>(JSON.parse(JSON.stringify(config)));
  const [modelsMap, setModelsMap] = useState<Record<string, string[]>>({
    gemini: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash"
    ]
  });
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [fetchError, setFetchError] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load models on init for providers that have custom config or are gemini
  useEffect(() => {
    // Load stored models lists if any from localStorage
    const savedModels = localStorage.getItem('swarm_fetched_models');
    if (savedModels) {
      try {
        setModelsMap(prev => ({ ...prev, ...JSON.parse(savedModels) }));
      } catch (e) {
        console.warn("Failed to load saved models:", e);
      }
    }

    // Proactively fetch ONLY for configured external cloud providers that have a saved API key on mount
    PROVIDERS.forEach(provider => {
      if (provider.id === 'gemini') return;
      if (provider.id === 'ollama' || provider.id === 'lmstudio') return; // Never proactively fetch local engines to avoid localhost connection failures
      const provConf = config.providers[provider.id];
      if (provConf && provConf.apiKey && provConf.apiKey.trim() !== '') {
        // Fetch quietly and handle failures without throwing global errors
        fetchModelsForProvider(provider.id, provConf.apiKey, provConf.baseUrl || provider.defaultUrl).catch(e => {
          console.warn(`Silent background model fetch failure for ${provider.id}:`, e);
        });
      }
    });
  }, []);

  // Keep model selections synchronized with available models in modelsMap
  useEffect(() => {
    setLocalConfig(prev => {
      let changed = false;
      const updated = JSON.parse(JSON.stringify(prev)); // Deep clone to avoid mutating state directly
      
      (['orchestrator', 'specialist', 'synthesizer'] as const).forEach(node => {
        const provider = updated.models[node].provider;
        const available = modelsMap[provider] || [];
        const currentModel = updated.models[node].model;
        
        if (available.length > 0) {
          if (!currentModel || !available.includes(currentModel)) {
            updated.models[node].model = available[0];
            changed = true;
          }
        }
      });
      
      return changed ? updated : prev;
    });
  }, [modelsMap]);

  const fetchModelsForProvider = async (providerId: string, apiKey: string, baseUrl: string) => {
    setLoadingModels(prev => ({ ...prev, [providerId]: true }));
    setFetchError(prev => ({ ...prev, [providerId]: '' }));
    try {
      // For localhost providers, try direct browser fetch first to bypass container localhost barrier
      let data;
      const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
      if (isLocalhost) {
        try {
          if (providerId === 'ollama') {
            const res = await fetch(`${baseUrl}/api/tags`);
            if (res.ok) {
              const resData = await res.json();
              if (resData.models) {
                data = { models: resData.models.map((m: any) => m.name) };
              }
            }
          } else {
            const res = await fetch(`${baseUrl}/models`);
            if (res.ok) {
              const resData = await res.json();
              if (resData.data) {
                data = { models: resData.data.map((m: any) => m.id) };
              }
            }
          }
        } catch (e: any) {
          console.warn("Direct localhost fetch failed (this is normal if the service is not currently running locally):", e.message || e);
        }
      }

      // Fallback or standard fetch through our server-side proxy
      if (!data) {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId, apiKey, baseUrl })
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        data = await res.json();
      }

      if (data && data.models && data.models.length > 0) {
        const newModels = data.models;
        setModelsMap(prev => {
          const updated = { ...prev, [providerId]: newModels };
          localStorage.setItem('swarm_fetched_models', JSON.stringify(updated));
          return updated;
        });
      } else {
        throw new Error(data?.error || "No models returned from endpoint. Ensure the provider service is running.");
      }
    } catch (err: any) {
      console.warn(`Failed to retrieve models for provider ${providerId}:`, err.message || err);
      setFetchError(prev => ({ ...prev, [providerId]: err.message || 'Failed to fetch' }));
    } finally {
      setLoadingModels(prev => ({ ...prev, [providerId]: false }));
    }
  };

  const handleProviderChange = (id: string, field: keyof ProviderConfig, value: string) => {
    setLocalConfig(prev => {
      const updated = { ...prev };
      if (!updated.providers[id]) {
        updated.providers[id] = { apiKey: '', baseUrl: '' };
      }
      updated.providers[id][field] = value;
      return updated;
    });
  };

  const handleModelSelect = (node: 'orchestrator' | 'specialist' | 'synthesizer', field: 'provider' | 'model', value: string) => {
    setLocalConfig(prev => {
      const updated = { ...prev };
      updated.models[node][field] = value;
      
      // Auto-set the first model of that provider if we changed the provider
      if (field === 'provider') {
        const available = modelsMap[value] || [];
        updated.models[node].model = available[0] || '';
      }
      return updated;
    });
  };

  const handleSave = () => {
    onSave(localConfig);
    setSuccessMsg("Configuration saved successfully!");
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-900 flex justify-between items-center bg-black/40">
          <div className="flex items-center gap-3 text-cyan-400">
            <Settings className="w-5 h-5 animate-spin-slow" />
            <h2 className="font-mono text-lg font-bold tracking-widest uppercase">Swarm_System_Config</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Node Model Mapping Controls */}
          <div className="bg-gray-900/40 border border-gray-900 p-5 rounded-lg space-y-4">
            <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Cognitive Node Allocations
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Orchestrator Menu */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Orchestrator Node</label>
                <select
                  value={localConfig.models.orchestrator.provider}
                  onChange={(e) => handleModelSelect('orchestrator', 'provider', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={localConfig.models.orchestrator.model}
                  onChange={(e) => handleModelSelect('orchestrator', 'model', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {(modelsMap[localConfig.models.orchestrator.provider] || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Specialist Menu */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Specialist Swarm</label>
                <select
                  value={localConfig.models.specialist.provider}
                  onChange={(e) => handleModelSelect('specialist', 'provider', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={localConfig.models.specialist.model}
                  onChange={(e) => handleModelSelect('specialist', 'model', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {(modelsMap[localConfig.models.specialist.provider] || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Synthesizer Menu */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Synthesizer Node</label>
                <select
                  value={localConfig.models.synthesizer.provider}
                  onChange={(e) => handleModelSelect('synthesizer', 'provider', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={localConfig.models.synthesizer.model}
                  onChange={(e) => handleModelSelect('synthesizer', 'model', e.target.value)}
                  className="bg-black border border-gray-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {(modelsMap[localConfig.models.synthesizer.provider] || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Provider Settings */}
          <div className="space-y-6">
            <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4" /> LLM Provider API Integration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {PROVIDERS.map(provider => {
                const provConf = localConfig.providers[provider.id] || { apiKey: '', baseUrl: '' };
                const isLooming = loadingModels[provider.id];
                const hasError = fetchError[provider.id];
                const modelCount = modelsMap[provider.id]?.length || 0;

                return (
                  <div key={provider.id} className="bg-black/50 border border-gray-900 p-4 rounded-lg space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold font-mono text-white">{provider.name}</span>
                        <button
                          type="button"
                          onClick={() => fetchModelsForProvider(provider.id, provConf.apiKey, provConf.baseUrl || provider.defaultUrl)}
                          className="text-xs font-mono text-cyan-500 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/20 px-2 py-1 rounded border border-cyan-900/30 transition-colors disabled:opacity-50"
                          disabled={isLooming}
                        >
                          <RefreshCw className={`w-3 h-3 ${isLooming ? 'animate-spin' : ''}`} />
                          Sync ({modelCount})
                        </button>
                      </div>

                      <div className="space-y-2">
                        {provider.id !== 'ollama' && provider.id !== 'lmstudio' && (
                          <div className="flex items-center gap-2 bg-black border border-gray-900 rounded px-3 py-2">
                            <Key className="w-4 h-4 text-gray-500 shrink-0" />
                            <input
                              type="password"
                              value={provConf.apiKey}
                              onChange={(e) => handleProviderChange(provider.id, 'apiKey', e.target.value)}
                              placeholder={provider.placeholderKey}
                              className="bg-transparent text-xs w-full focus:outline-none text-white font-mono"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2 bg-black border border-gray-900 rounded px-3 py-2">
                          <Globe className="w-4 h-4 text-gray-500 shrink-0" />
                          <input
                            type="text"
                            value={provConf.baseUrl}
                            onChange={(e) => handleProviderChange(provider.id, 'baseUrl', e.target.value)}
                            placeholder={provider.defaultUrl || 'Base URL'}
                            className="bg-transparent text-xs w-full focus:outline-none text-white font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {hasError && (
                      <div className="text-[10px] font-mono text-red-500 mt-2 truncate bg-red-950/20 p-1.5 rounded border border-red-900/30">
                        {hasError}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-gray-900 flex justify-between items-center bg-black/40">
          <div className="text-xs font-mono text-gray-500 uppercase">
            {successMsg ? (
              <span className="text-green-400 flex items-center gap-1"><Check className="w-4 h-4" /> {successMsg}</span>
            ) : (
              <span>ALL KEYS PERSISTED LOCALLY</span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="bg-cyan-950 text-cyan-400 border border-cyan-900 hover:bg-cyan-900 hover:text-cyan-300 px-6 py-2.5 rounded-lg font-mono font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
