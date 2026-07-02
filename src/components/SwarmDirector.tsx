import React, { useState } from 'react';
import { AgentProfile } from '../types';
import { GeometricAvatar } from './GeometricAvatar';
import { Rocket, RefreshCw, Plus, Trash2, ChevronDown, ChevronUp, X, Pencil } from 'lucide-react';

interface SwarmDirectorProps {
  agents: AgentProfile[];
  onChange: (agents: AgentProfile[]) => void;
  onLaunch: () => void;
  onRegenerate: () => void;
  onDiscard: () => void;
  regenerating: boolean;
}

function AgentEditorRow({
  agent,
  index,
  onUpdate,
  onDelete
}: {
  agent: AgentProfile;
  index: number;
  onUpdate: (field: keyof AgentProfile, value: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border border-stone-800 rounded-lg bg-black/40 p-4 flex flex-col gap-3 animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        <GeometricAvatar seed={agent.geometric_avatar_seed || agent.id} size={40} />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={agent.designation}
            onChange={(e) => onUpdate('designation', e.target.value)}
            placeholder="Specialist designation"
            className="w-full bg-transparent text-sm font-medium text-stone-100 border-b border-transparent hover:border-stone-700 focus:border-phosphor-600 focus:outline-none pb-1 transition-colors"
          />
          <div className="text-[10px] uppercase tracking-widest text-stone-600 font-mono mt-1 truncate">{agent.id}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 text-stone-600 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors shrink-0"
          title="Remove specialist"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-stone-500 hover:text-phosphor-400 transition-colors self-start"
      >
        <Pencil className="w-3 h-3" />
        Directive
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded ? (
        <textarea
          value={agent.system_prompt}
          onChange={(e) => onUpdate('system_prompt', e.target.value)}
          rows={6}
          placeholder="System directive for this specialist..."
          className="w-full bg-black border border-stone-800 rounded px-3 py-2 text-xs text-stone-200 font-mono leading-relaxed focus:outline-none focus:border-phosphor-600 resize-y"
        />
      ) : (
        <p className="text-xs text-stone-500 leading-relaxed line-clamp-2 font-mono">
          {agent.system_prompt || <span className="italic text-stone-700">No directive set</span>}
        </p>
      )}
    </div>
  );
}

export function SwarmDirector({ agents, onChange, onLaunch, onRegenerate, onDiscard, regenerating }: SwarmDirectorProps) {
  const updateAgent = (id: string, field: keyof AgentProfile, value: string) => {
    onChange(agents.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const deleteAgent = (id: string) => {
    onChange(agents.filter((a) => a.id !== id));
  };

  const addAgent = () => {
    const existing = new Set(agents.map((a) => a.id));
    let n = agents.length + 1;
    let id = `agent_${n}`;
    while (existing.has(id)) {
      n += 1;
      id = `agent_${n}`;
    }
    onChange([
      ...agents,
      { id, designation: 'New Specialist', system_prompt: '', geometric_avatar_seed: id }
    ]);
  };

  const canLaunch = agents.length > 0 && agents.every((a) => a.system_prompt.trim() && a.designation.trim());

  return (
    <section className="border border-phosphor-900/50 rounded-xl bg-stone-950/60 overflow-hidden shadow-2xl shadow-phosphor-950/20 animate-fade-up">
      <div className="bg-stone-900 border-b border-stone-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm text-phosphor-400 uppercase tracking-widest flex items-center gap-2 glow-amber">
          <Pencil className="w-4 h-4" />
          Swarm Director
        </h2>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-[11px] font-mono uppercase tracking-widest text-stone-500">
            {agents.length} specialist{agents.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onDiscard}
            className="p-1.5 text-stone-500 hover:text-red-400 transition-colors"
            title="Discard swarm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-4">
        <p className="text-xs font-mono text-stone-500 leading-relaxed">
          The orchestrator designed this swarm. Rename specialists, rewrite their directives, drop weak angles, or add your own — then launch.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent, i) => (
            <AgentEditorRow
              key={agent.id}
              agent={agent}
              index={i}
              onUpdate={(field, value) => updateAgent(agent.id, field, value)}
              onDelete={() => deleteAgent(agent.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addAgent}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-dashed border-stone-700 text-stone-500 hover:text-phosphor-400 hover:border-phosphor-800 hover:bg-phosphor-950/10 transition-colors font-mono text-xs uppercase tracking-widest"
        >
          <Plus className="w-4 h-4" />
          Add Specialist
        </button>
      </div>

      <div className="border-t border-stone-800 bg-black/40 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-stone-700 text-stone-300 hover:text-phosphor-300 hover:border-phosphor-800 hover:bg-phosphor-950/10 disabled:opacity-50 transition-colors font-mono text-xs uppercase tracking-widest"
        >
          <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Regenerating…' : 'Regenerate Swarm'}
        </button>
        <button
          type="button"
          onClick={onLaunch}
          disabled={!canLaunch}
          title={canLaunch ? 'Launch the swarm' : 'Every specialist needs a designation and a directive'}
          className="flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg bg-phosphor-950 text-phosphor-300 border border-phosphor-800 hover:bg-phosphor-900 hover:text-phosphor-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-xs font-bold uppercase tracking-widest glow-amber"
        >
          <Rocket className="w-4 h-4" />
          Launch Swarm
        </button>
      </div>
    </section>
  );
}
