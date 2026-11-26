import React, { useEffect, useState } from 'react';
import { Maximize2, ShieldAlert, X } from 'lucide-react';
import { HudButtonLayout, HudSnapshot, MinimapEntity } from '../game/types';

interface MiniMapProps {
  hud: HudSnapshot;
  customLayout?: HudButtonLayout;
}

const WORLD_SPAN = 170;

function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function projectCoord(worldVal: number, mapSize: number): number {
  return ((worldVal + WORLD_SPAN / 2) / WORLD_SPAN) * mapSize;
}

interface RadarCanvasProps {
  hud: HudSnapshot;
  size: number;
  expanded: boolean;
}

const RadarCanvas: React.FC<RadarCanvasProps> = ({ hud, size, expanded }) => {
  const scale = expanded ? 1.35 : 1;
  const pad = 7 * scale;

  const zoneCx = projectCoord(hud.zoneCenterX, size);
  const zoneCy = projectCoord(hud.zoneCenterZ, size);
  const zoneR = Math.max(3, (hud.zoneRadius / WORLD_SPAN) * size);

  const playerX = clamp(projectCoord(hud.playerX, size), pad, size - pad);
  const playerY = clamp(projectCoord(hud.playerZ, size), pad, size - pad);
  const playerDeg = (-hud.playerYaw * 180) / Math.PI + 180;

  const renderEntityIcon = (ent: MinimapEntity, idx: number) => {
    const mx = clamp(projectCoord(ent.x, size), pad, size - pad);
    const my = clamp(projectCoord(ent.z, size), pad, size - pad);

    if (ent.kind === 'ally') {
      const r = 4.3 * scale;
      return (
        <g key={`ally-${idx}`} transform={`translate(${mx}, ${my})`}>
          <circle r={r * 1.4} fill="rgba(56, 189, 248, 0.2)" />
          <circle r={r} fill="#38bdf8" stroke="#f0f9ff" strokeWidth={1.1} />
        </g>
      );
    }

    if (ent.kind === 'enemy') {
      const r = 4.2 * scale;
      return (
        <g key={`enemy-${idx}`} transform={`translate(${mx}, ${my})`}>
          {ent.firing && (
            <circle
              r={r * 1.95}
              fill="rgba(239, 68, 68, 0.18)"
              stroke="#fca5a5"
              strokeWidth={1.1}
            />
          )}
          {/* Hostile tactical diamond */}
          <polygon
            points={`0,${-r} ${r},0 0,${r} ${-r},0`}
            fill="#ef4444"
            stroke="#fee2e2"
            strokeWidth={0.9}
          />
          <circle r={1.1 * scale} fill="#fee2e2" />
        </g>
      );
    }

    if (ent.kind === 'ammo') {
      const w = 5.4 * scale;
      const h = 6.6 * scale;
      return (
        <g key={`ammo-${idx}`} transform={`translate(${mx}, ${my})`}>
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx={1}
            fill="#f59e0b"
            stroke="#fef3c7"
            strokeWidth={0.8}
          />
          <line
            x1={-w * 0.25}
            y1={-h * 0.15}
            x2={w * 0.25}
            y2={-h * 0.15}
            stroke="#0b0f14"
            strokeWidth={1.1}
          />
        </g>
      );
    }

    if (ent.kind === 'weapon') {
      const s = 5.2 * scale;
      return (
        <g key={`weapon-${idx}`} transform={`translate(${mx}, ${my})`}>
          <circle r={s} fill="rgba(168, 85, 247, 0.25)" stroke="#c084fc" strokeWidth={0.9} />
          <rect x={-s * 0.68} y={-s * 0.2} width={s * 1.36} height={s * 0.4} rx={0.8} fill="#e9d5ff" />
        </g>
      );
    }

    // Medkit cross icon
    const arm = 4.4 * scale;
    const thick = 1.8 * scale;
    return (
      <g key={`medkit-${idx}`} transform={`translate(${mx}, ${my})`}>
        <circle
          r={arm * 1.15}
          fill="#0f172a"
          stroke="#22c55e"
          strokeWidth={1}
        />
        <rect
          x={-thick / 2}
          y={-arm * 0.72}
          width={thick}
          height={arm * 1.44}
          fill="#22c55e"
        />
        <rect
          x={-arm * 0.72}
          y={-thick / 2}
          width={arm * 1.44}
          height={thick}
          fill="#22c55e"
        />
      </g>
    );
  };

  const isNextera = hud.map === 'nextera';
  const isRealistic = hud.map === 'realistic';
  const gridMinor = isNextera
    ? 'rgba(34, 211, 238, 0.08)'
    : isRealistic
      ? 'rgba(74, 222, 128, 0.08)'
      : 'rgba(255,255,255,0.04)';
  const gridMajor = isNextera
    ? 'rgba(34, 211, 238, 0.16)'
    : isRealistic
      ? 'rgba(74, 222, 128, 0.16)'
      : 'rgba(255,255,255,0.08)';
  const padPx = (30 / WORLD_SPAN) * size;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`block rounded ${
        isNextera ? 'bg-[#0b1622]' : isRealistic ? 'bg-[#101c16]' : 'bg-[#141c24]'
      }`}
      role="img"
      aria-label="Tactical radar minimap showing player position, safe zone, enemies, and supply drops"
    >
      {/* Sector grid */}
      <line x1={size * 0.25} y1={0} x2={size * 0.25} y2={size} stroke={gridMinor} strokeWidth={1} />
      <line x1={size * 0.5} y1={0} x2={size * 0.5} y2={size} stroke={gridMajor} strokeWidth={1} />
      <line x1={size * 0.75} y1={0} x2={size * 0.75} y2={size} stroke={gridMinor} strokeWidth={1} />
      <line x1={0} y1={size * 0.25} x2={size} y2={size * 0.25} stroke={gridMinor} strokeWidth={1} />
      <line x1={0} y1={size * 0.5} x2={size} y2={size * 0.5} stroke={gridMajor} strokeWidth={1} />
      <line x1={0} y1={size * 0.75} x2={size} y2={size * 0.75} stroke={gridMinor} strokeWidth={1} />

      {/* Central Compound / Nextera Grav-Pad Landmark */}
      <rect
        x={size / 2 - padPx / 2}
        y={size / 2 - padPx / 2}
        width={padPx}
        height={padPx}
        rx={isNextera ? 2 : 1}
        fill={isNextera ? 'rgba(34, 211, 238, 0.08)' : 'rgba(148, 163, 184, 0.08)'}
        stroke={isNextera ? 'rgba(34, 211, 238, 0.35)' : 'rgba(148, 163, 184, 0.2)'}
        strokeWidth={1}
      />
      {isNextera && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={padPx * 0.22}
          fill="none"
          stroke="rgba(34, 211, 238, 0.55)"
          strokeWidth={1}
        />
      )}

      {/* Safe Zone Boundary */}
      <circle
        cx={zoneCx}
        cy={zoneCy}
        r={zoneR}
        fill="rgba(14, 165, 233, 0.08)"
        stroke="#38bdf8"
        strokeWidth={expanded ? 2 : 1.5}
      />

      {/* North Compass Marker */}
      <text
        x={size / 2}
        y={expanded ? 14 : 10}
        textAnchor="middle"
        fill="rgba(148, 163, 184, 0.75)"
        fontSize={expanded ? 10 : 8}
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
      >
        N
      </text>

      {/* Nearby Entities from HudSnapshot.minimapEntities */}
      {hud.minimapEntities.map(renderEntityIcon)}

      {/* Player Directional Chevron & FOV Cone */}
      <g transform={`translate(${playerX}, ${playerY}) rotate(${playerDeg})`}>
        <path
          d={`M 0,0 L ${-11 * scale},${-22 * scale} A ${24 * scale},${24 * scale} 0 0,1 ${11 * scale},${-22 * scale} Z`}
          fill="rgba(248, 250, 252, 0.14)"
        />
        <polygon
          points={`0,${-6.2 * scale} ${4.4 * scale},${4.5 * scale} 0,${2.2 * scale} ${-4.4 * scale},${4.5 * scale}`}
          fill="#f8fafc"
          stroke="#0b0f14"
          strokeWidth={0.8}
        />
      </g>
    </svg>
  );
};

export const MiniMap: React.FC<MiniMapProps> = ({ hud, customLayout }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && hud.status === 'playing') {
        e.preventDefault();
        setIsExpanded((prev) => !prev);
      } else if (e.code === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hud.status, isExpanded]);

  const wrapperStyle: React.CSSProperties | undefined = customLayout
    ? {
        left: `${customLayout.xPct}%`,
        top: `${customLayout.yPct}%`,
        transform: `translate(-50%, -50%) scale(${customLayout.scale})`,
        opacity: customLayout.opacity,
      }
    : undefined;

  return (
    <>
      {/* Compact Corner Radar */}
      <div
        className={`pointer-events-auto fixed flex flex-col gap-2 ${
          customLayout ? '' : 'top-3 left-3 sm:top-4 sm:left-4'
        }`}
        style={wrapperStyle}
      >
        <div
          className={`relative overflow-hidden rounded-lg border bg-[#0b0f14]/88 p-2 shadow-lg ${
            hud.map === 'nextera'
              ? 'border-cyan-400/30'
              : hud.map === 'realistic'
                ? 'border-emerald-400/30'
                : 'border-white/15'
          }`}
          style={{ width: 146 }}
        >
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            title="Expand Tactical Map (Tab)"
            className="group relative block w-full text-left focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <RadarCanvas hud={hud} size={128} expanded={false} />
            <span
              className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded bg-[#0b0f14]/80 text-slate-300 transition-colors group-hover:text-white"
              aria-hidden="true"
            >
              <Maximize2 className="h-3 w-3" />
            </span>
          </button>

          <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-slate-300 font-mono-tabular">
            <span
              className={
                hud.map === 'nextera'
                  ? 'text-cyan-300'
                  : hud.map === 'realistic'
                    ? 'text-emerald-300'
                    : 'text-slate-300'
              }
            >
              {hud.map === 'nextera'
                ? 'Nextera'
                : hud.map === 'realistic'
                  ? 'Realistic'
                  : 'Compound'}{' '}
              · {Math.round(hud.zoneRadius)}m
            </span>
            <span>{formatTimer(hud.zoneTimer)}</span>
          </div>
        </div>

        {hud.isOutsideZone && (
          <div className="flex items-center gap-2 rounded-md border border-sky-400/40 bg-[#0c1b29]/90 px-3 py-1.5 text-xs font-semibold text-sky-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-sky-400" />
            <span>Outside Safe Zone (-{hud.zoneDamagePerSec} HP/s)</span>
          </div>
        )}
      </div>

      {/* Expanded Tactical Map Overlay */}
      {isExpanded && (
        <div
          className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-[#0b0f14]/75 p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-[344px] rounded-xl border border-white/15 bg-[#0f1620] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  {hud.map === 'nextera'
                    ? 'Nextera Sector Map'
                    : hud.map === 'realistic'
                      ? 'Realistic Valley Map'
                      : 'Compound Arena Map'}
                </h2>
                <p className="text-xs text-slate-400 font-mono-tabular">
                  Zone {Math.round(hud.zoneRadius)}m · {formatTimer(hud.zoneTimer)} remaining
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                aria-label="Close Tactical Map"
                className="rounded-md border border-white/15 bg-slate-800 p-1.5 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-center">
              <RadarCanvas hud={hud} size={300} expanded />
            </div>

            {/* Compact Icon Legend */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rotate-45 bg-red-500" />
                <span>Hostile Combatant</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-red-300 bg-red-500/40" />
                <span>Active Gunfire</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2 rounded-xs bg-amber-500" />
                <span>Ammo Crate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-emerald-500 bg-slate-900" />
                <span>Medkit (+35 HP)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-purple-400 bg-purple-500/30" />
                <span>Dropped Gun</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-white bg-sky-400" />
                <span>Online Squadmate</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
