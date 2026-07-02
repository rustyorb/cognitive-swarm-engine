import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentExecutionState } from '../types';
import { GeometricAvatar } from './GeometricAvatar';
import { Terminal, Database, Activity, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentCardProps {
  executionState: AgentExecutionState;
}

export function AgentCard({ executionState }: AgentCardProps) {
  const { profile, state, result, error } = executionState;
  const [expanded, setExpanded] = useState(false);

  const getStateColor = () => {
    switch (state) {
      case 'PENDING': return 'text-stone-500 border-stone-800';
      case 'GATHERING_TELEMETRY': return 'text-phosphor-400 border-phosphor-900/60';
      case 'SYNTHESIZING_VECTORS': return 'text-orange-400 border-orange-900/60';
      case 'RESOLVED': return 'text-lime-400 border-lime-900/50';
      case 'ERROR': return 'text-red-400 border-red-900/50';
      default: return 'text-stone-500 border-stone-800';
    }
  };

  const getStateIcon = () => {
    switch (state) {
      case 'PENDING': return <Terminal className="w-4 h-4" />;
      case 'GATHERING_TELEMETRY': return <Database className="w-4 h-4 animate-pulse" />;
      case 'SYNTHESIZING_VECTORS': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'RESOLVED': return <CheckCircle className="w-4 h-4" />;
      case 'ERROR': return <AlertTriangle className="w-4 h-4" />;
      default: return null;
    }
  };

  const isStreaming = state === 'GATHERING_TELEMETRY' || state === 'SYNTHESIZING_VECTORS';

  return (
    <div className={`flex flex-col p-4 border bg-black/40 backdrop-blur-sm rounded-lg transition-colors duration-300 ${getStateColor()}`}>
      <div className="flex items-center gap-4 mb-3">
        <GeometricAvatar seed={profile.geometric_avatar_seed} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-1 font-mono flex items-center gap-2">
            <span className="truncate">{profile.id}</span>
            {error && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
          </div>
          <div className="text-sm font-medium truncate text-stone-100">
            {profile.designation}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono uppercase mt-auto">
        <div className={`flex items-center gap-2 ${isStreaming ? 'glow-amber' : ''}`}>
          {getStateIcon()}
          <span className={isStreaming ? 'cursor-blink' : ''}>[{state}]</span>
        </div>
        <div className="flex items-center gap-2">
          {result && isStreaming && (
            <span className="opacity-60">{result.length} Bytes</span>
          )}
          {result && (
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="p-1 text-stone-500 hover:text-phosphor-400 transition-colors"
              title={expanded ? 'Collapse output' : 'Expand output'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {expanded && result && (
        <div className="mt-3 border-t border-stone-800 pt-3 max-h-80 overflow-y-auto">
          <div className="prose prose-invert prose-stone prose-sm max-w-none
                          prose-a:text-phosphor-400 prose-strong:text-phosphor-200
                          prose-code:text-orange-300 prose-code:bg-orange-950/40 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                          prose-pre:bg-stone-950 prose-pre:border prose-pre:border-stone-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs font-mono text-red-500 bg-red-950/30 p-2 rounded border border-red-900/50">
          ERR: {error}
        </div>
      )}
    </div>
  );
}
