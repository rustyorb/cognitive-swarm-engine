import { useId, useMemo } from 'react';
import { AgentProfile, AgentExecutionState, AgentState } from '../types';

interface SwarmConstellationProps {
  agents: AgentProfile[];
  agentStates: Record<string, AgentExecutionState>;
  phase: 'IDLE' | 'ORCHESTRATING' | 'REVIEW' | 'EXECUTING' | 'SYNTHESIZING' | 'DONE' | 'ERROR';
}

// CRT-phosphor palette — amber on near-black. No cyan/teal/blue/violet/purple.
const PALETTE = {
  dim: '#57534e',      // stone-600 — idle / pending
  phosphor: '#f2b035', // phosphor amber — gathering
  orange: '#fb923c',   // ember orange — synthesizing
  lime: '#a3e635',     // terminal lime — resolved
  red: '#ef4444',      // signal red — error
};

function colorForState(state: AgentState): string {
  switch (state) {
    case 'PENDING': return PALETTE.dim;
    case 'GATHERING_TELEMETRY': return PALETTE.phosphor;
    case 'SYNTHESIZING_VECTORS': return PALETTE.orange;
    case 'RESOLVED': return PALETTE.lime;
    case 'ERROR': return PALETTE.red;
    default: return PALETTE.dim;
  }
}

function isStreamingState(state: AgentState): boolean {
  return state === 'GATHERING_TELEMETRY' || state === 'SYNTHESIZING_VECTORS';
}

function truncate(text: string, max = 14): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + '…';
}

// Geometry of the constellation. Kept generous so glow + labels stay inside the viewBox.
const VIEW_W = 800;
const VIEW_H = 500;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2 - 8;
const RING_RX = 300;
const RING_RY = 175;

export function SwarmConstellation({ agents, agentStates, phase }: SwarmConstellationProps) {
  const uid = useId().replace(/[:]/g, '');

  const nodes = useMemo(() => {
    const total = agents.length;
    if (total === 0) return [];
    // Start at the top (-90deg) and distribute evenly around the ring.
    return agents.map((profile, i) => {
      const angle = -Math.PI / 2 + (i / total) * Math.PI * 2;
      const x = CX + RING_RX * Math.cos(angle);
      const y = CY + RING_RY * Math.sin(angle);
      const exec = agentStates[profile.id];
      const state: AgentState = exec?.state ?? 'PENDING';
      return {
        id: profile.id,
        x,
        y,
        label: truncate(profile.designation || profile.id),
        color: colorForState(state),
        state,
        streaming: isStreamingState(state),
        resolved: state === 'RESOLVED',
        bytes: exec?.result?.length ?? 0,
        // Push labels below or above the node depending on hemisphere so they never clip the core.
        labelBelow: y <= CY,
      };
    });
  }, [agents, agentStates]);

  const igniting = phase === 'SYNTHESIZING';
  const settled = phase === 'DONE';
  const coreErr = phase === 'ERROR';

  const coreColor = coreErr
    ? PALETTE.red
    : igniting
      ? PALETTE.orange
      : settled
        ? PALETTE.lime
        : PALETTE.phosphor;

  // SMIL <animateMotion> is not covered by the CSS reduced-motion rule, so gate it here too.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="border border-stone-800 rounded-xl bg-black/40 p-4">
      <style>{`
        @keyframes swarm-node-pulse-${uid} {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50%      { transform: scale(1.18); opacity: 1; }
        }
        @keyframes swarm-glow-breathe-${uid} {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.85; }
        }
        @keyframes swarm-core-ignite-${uid} {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%      { transform: scale(1.35); opacity: 1; }
        }
        @keyframes swarm-ring-spin-${uid} {
          to { transform: rotate(360deg); }
        }
        .swarm-node-pulse-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: swarm-node-pulse-${uid} 1.6s ease-in-out infinite;
        }
        .swarm-glow-breathe-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: swarm-glow-breathe-${uid} 2s ease-in-out infinite;
        }
        .swarm-core-ignite-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: swarm-core-ignite-${uid} 1.3s ease-in-out infinite;
        }
        .swarm-edge-flow-${uid} {
          stroke-dasharray: 6 10;
          animation: swarm-dash-${uid} 0.9s linear infinite;
        }
        @keyframes swarm-dash-${uid} {
          to { stroke-dashoffset: -32; }
        }
        .swarm-core-ring-${uid} {
          transform-box: fill-box;
          transform-origin: center;
          animation: swarm-ring-spin-${uid} 14s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .swarm-node-pulse-${uid},
          .swarm-glow-breathe-${uid},
          .swarm-core-ignite-${uid},
          .swarm-edge-flow-${uid},
          .swarm-core-ring-${uid} {
            animation: none;
          }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="auto"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Swarm constellation visualization"
        className="block"
      >
        <defs>
          {/* Phosphor bloom for nodes */}
          <filter id={`swarm-glow-${uid}`} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Heavier bloom reserved for the core */}
          <filter id={`swarm-core-glow-${uid}`} x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* EDGES: core -> each agent, drawn first so nodes sit on top */}
        <g>
          {nodes.map((n) => {
            const active = n.streaming;
            const strokeW = active ? 2 : n.resolved ? 1.5 : 1;
            const opacity = active ? 0.9 : n.resolved ? 0.55 : n.state === 'ERROR' ? 0.6 : 0.22;
            return (
              <g key={`edge-${n.id}`}>
                <line
                  x1={CX}
                  y1={CY}
                  x2={n.x}
                  y2={n.y}
                  stroke={n.color}
                  strokeWidth={strokeW}
                  strokeOpacity={opacity}
                  strokeLinecap="round"
                />
                {active && (
                  <line
                    x1={CX}
                    y1={CY}
                    x2={n.x}
                    y2={n.y}
                    stroke={n.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    className={`swarm-edge-flow-${uid}`}
                  />
                )}
                {/* Traveling energy pip along active or synthesizing-converging edges */}
                {(active || (igniting && n.resolved)) && (
                  prefersReducedMotion ? (
                    <circle
                      cx={(CX + n.x) / 2}
                      cy={(CY + n.y) / 2}
                      r={active ? 4 : 3}
                      fill={igniting && n.resolved ? coreColor : n.color}
                    />
                  ) : (
                    <circle r={active ? 4 : 3} fill={igniting && n.resolved ? coreColor : n.color}>
                      <animateMotion
                        dur={active ? '1.1s' : '0.8s'}
                        repeatCount="indefinite"
                        keyPoints={igniting && n.resolved ? '1;0' : '0;1'}
                        keyTimes="0;1"
                        calcMode="linear"
                        path={`M ${CX} ${CY} L ${n.x} ${n.y}`}
                      />
                    </circle>
                  )
                )}
              </g>
            );
          })}
        </g>

        {/* CORE node */}
        <g filter={`url(#swarm-core-glow-${uid})`}>
          {/* outer bloom halo */}
          <circle
            cx={CX}
            cy={CY}
            r={igniting ? 40 : 30}
            fill={coreColor}
            fillOpacity={0.18}
            className={igniting ? `swarm-core-ignite-${uid}` : ''}
          />
          {/* rotating dashed containment ring */}
          <circle
            cx={CX}
            cy={CY}
            r={26}
            fill="none"
            stroke={coreColor}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeDasharray="4 8"
            className={`swarm-core-ring-${uid}`}
          />
          {/* solid core */}
          <circle cx={CX} cy={CY} r={14} fill="#0c0a09" stroke={coreColor} strokeWidth={2.5} />
          <circle
            cx={CX}
            cy={CY}
            r={6}
            fill={coreColor}
            className={igniting ? `swarm-node-pulse-${uid}` : ''}
          />
        </g>
        <text
          x={CX}
          y={CY + 58}
          textAnchor="middle"
          className="font-display"
          fill={coreColor}
          fillOpacity={0.85}
          fontSize={13}
          style={{ letterSpacing: '0.18em', textTransform: 'uppercase' }}
        >
          {coreErr ? 'CORE // FAULT' : igniting ? 'SYNTHESIZING' : settled ? 'RESOLVED' : 'CORE'}
        </text>

        {/* AGENT nodes */}
        {nodes.map((n) => {
          const hexPoints = hexagon(n.x, n.y, 13);
          return (
            <g key={`node-${n.id}`}>
              {/* soft glow disc under active/resolved nodes */}
              {(n.streaming || n.resolved || n.state === 'ERROR') && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={18}
                  fill={n.color}
                  fillOpacity={0.16}
                  filter={`url(#swarm-glow-${uid})`}
                  className={n.streaming ? `swarm-glow-breathe-${uid}` : ''}
                />
              )}
              <g filter={n.streaming ? `url(#swarm-glow-${uid})` : undefined}>
                <polygon
                  points={hexPoints}
                  fill="#0c0a09"
                  stroke={n.color}
                  strokeWidth={n.streaming ? 2.5 : 1.8}
                  className={n.streaming ? `swarm-node-pulse-${uid}` : ''}
                />
                <circle cx={n.x} cy={n.y} r={4} fill={n.color} />
              </g>

              {/* designation label */}
              <text
                x={n.x}
                y={n.labelBelow ? n.y + 30 : n.y - 22}
                textAnchor="middle"
                className="font-mono"
                fill={n.color}
                fontSize={11}
                style={{ letterSpacing: '0.05em' }}
              >
                {n.label}
              </text>

              {/* live byte count while streaming */}
              {n.streaming && n.bytes > 0 && (
                <text
                  x={n.x}
                  y={n.labelBelow ? n.y + 44 : n.y - 36}
                  textAnchor="middle"
                  className="font-mono"
                  fill={n.color}
                  fillOpacity={0.6}
                  fontSize={9}
                  style={{ letterSpacing: '0.1em' }}
                >
                  {n.bytes} B
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Flat-top hexagon points centered at (cx, cy).
function hexagon(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
