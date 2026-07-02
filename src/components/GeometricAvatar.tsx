import React, { useMemo } from 'react';

interface GeometricAvatarProps {
  seed: string;
  size?: number;
}

export function GeometricAvatar({ seed, size = 48 }: GeometricAvatarProps) {
  const hash = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return Math.abs(h);
  }, [seed]);

  const colors = [
    '#f2b035', // Phosphor Amber
    '#fb923c', // Ember Orange
    '#ef4444', // Signal Red
    '#a3e635', // Terminal Lime
    '#fde68a', // Pale Amber
    '#e11d48'  // Hot Rose
  ];

  const bg = colors[hash % colors.length];
  const fg1 = colors[(hash >> 2) % colors.length];
  const fg2 = colors[(hash >> 4) % colors.length];

  const shapeType = hash % 3;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill={bg} fillOpacity={0.15} rx="8" />
      <rect width="100" height="100" stroke={bg} strokeWidth="4" rx="8" />
      
      {shapeType === 0 && (
        <>
          <circle cx="50" cy="50" r="30" stroke={fg1} strokeWidth="6" strokeDasharray="10 5" />
          <path d="M50 20L80 70H20L50 20Z" stroke={fg2} strokeWidth="4" />
        </>
      )}
      
      {shapeType === 1 && (
        <>
          <rect x="25" y="25" width="50" height="50" stroke={fg1} strokeWidth="6" />
          <circle cx="50" cy="50" r="15" fill={fg2} />
        </>
      )}

      {shapeType === 2 && (
        <>
          <path d="M20 50 L50 20 L80 50 L50 80 Z" stroke={fg1} strokeWidth="6" />
          <circle cx="50" cy="50" r="10" stroke={fg2} strokeWidth="4" />
          <line x1="20" y1="20" x2="80" y2="80" stroke={fg1} strokeWidth="4" />
        </>
      )}
    </svg>
  );
}
