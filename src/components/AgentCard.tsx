import React from 'react';
import { AgentExecutionState } from '../types';
import { GeometricAvatar } from './GeometricAvatar';
import { Terminal, Database, Activity, CheckCircle, AlertTriangle } from 'lucide-react';

interface AgentCardProps {
  executionState: AgentExecutionState;
}

export function AgentCard({ executionState }: AgentCardProps) {
  const { profile, state, result, error } = executionState;

  const getStateColor = () => {
    switch (state) {
      case 'PENDING': return 'text-gray-500 border-gray-800';
      case 'GATHERING_TELEMETRY': return 'text-cyan-400 border-cyan-900/50';
      case 'SYNTHESIZING_VECTORS': return 'text-magenta-400 border-magenta-900/50';
      case 'RESOLVED': return 'text-green-400 border-green-900/50';
      default: return 'text-gray-500 border-gray-800';
    }
  };

  const getStateIcon = () => {
    switch (state) {
      case 'PENDING': return <Terminal className="w-4 h-4" />;
      case 'GATHERING_TELEMETRY': return <Database className="w-4 h-4 animate-pulse" />;
      case 'SYNTHESIZING_VECTORS': return <Activity className="w-4 h-4 animate-pulse" />;
      case 'RESOLVED': return <CheckCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <div className={`flex flex-col p-4 border bg-black/40 backdrop-blur-sm rounded-lg transition-colors duration-300 ${getStateColor()}`}>
      <div className="flex items-center gap-4 mb-3">
        <GeometricAvatar seed={profile.geometric_avatar_seed} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-1 font-mono flex items-center gap-2">
            <span>{profile.id}</span>
            {error && <AlertTriangle className="w-3 h-3 text-red-500" />}
          </div>
          <div className="text-sm font-medium truncate text-white">
            {profile.designation}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between text-xs font-mono uppercase mt-auto">
        <div className="flex items-center gap-2">
          {getStateIcon()}
          <span>[{state}]</span>
        </div>
        {result && state !== 'RESOLVED' && (
          <span className="opacity-60">{result.length} Bytes</span>
        )}
      </div>

      {error && (
        <div className="mt-2 text-xs font-mono text-red-500 bg-red-950/30 p-2 rounded border border-red-900/50">
          ERR: {error}
        </div>
      )}
    </div>
  );
}
