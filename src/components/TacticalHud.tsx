import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Eye,
  Heart,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Smile,
  Shirt,
  Home,
  Plus,
  Maximize,
  MapPin,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Zap,
  Check,
  Sparkles,
  Settings,
  X,
  Shield,
  Flame,
  Wind,
  Users,
  Copy,
  RefreshCw,
} from 'lucide-react';
import {
  CustomHudConfig,
  CustomHudItemId,
  DEFAULT_CUSTOM_HUD,
  DEFAULT_GAME_SETTINGS,
  Difficulty,
  EMOTE_CATALOG,
  EmoteId,
  GameSettings,
  GraphicsQuality,
  HudSnapshot,
  MAP_CATALOG,
  MapId,
  MatchConfig,
  OUTFIT_CATALOG,
  OnlineMode,
  OnlineRoomSnapshot,
  OutfitId,
  WEAPON_BY_ID,
  WEAPON_CATALOG,
  WeaponId,
} from '../game/types';
import { MiniMap } from './MiniMap';

const CUSTOM_HUD_STORAGE_KEY = 'agam_custom_hud_v1';

const CUSTOM_HUD_LABELS: Record<CustomHudItemId, string> = {
  joystick: 'Joystick',
  fire: 'Fire Button',
  health: 'Health / Medkit',
  reload: 'Reload',
  jump: 'Jump',
  crouch: 'Crouch',
  glooWall: 'Gloo Wall',
  grenade: 'Grenade',
  dash: 'Dash',
  minimap: 'MiniMap',
};

function loadSavedCustomHud(): CustomHudConfig {
  try {
    const raw = localStorage.getItem(CUSTOM_HUD_STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOM_HUD;
    const parsed = JSON.parse(raw) as Partial<CustomHudConfig>;
    return {
      joystick: parsed.joystick ?? DEFAULT_CUSTOM_HUD.joystick,
      fire: parsed.fire ?? DEFAULT_CUSTOM_HUD.fire,
      health: parsed.health ?? DEFAULT_CUSTOM_HUD.health,
      reload: parsed.reload ?? DEFAULT_CUSTOM_HUD.reload,
      jump: parsed.jump ?? DEFAULT_CUSTOM_HUD.jump,
      crouch: parsed.crouch ?? DEFAULT_CUSTOM_HUD.crouch,
      glooWall: parsed.glooWall ?? DEFAULT_CUSTOM_HUD.glooWall,
      grenade: parsed.grenade ?? DEFAULT_CUSTOM_HUD.grenade,
      dash: parsed.dash ?? DEFAULT_CUSTOM_HUD.dash,
      minimap: parsed.minimap ?? DEFAULT_CUSTOM_HUD.minimap,
    };
  } catch {
    return DEFAULT_CUSTOM_HUD;
  }
}

interface TacticalHudProps {
  hud: HudSnapshot;
  muted: boolean;
  settings: GameSettings;
  onlineRoom: OnlineRoomSnapshot;
  onUpdateSettings: (next: GameSettings) => void;
  onStartMatch: (config: MatchConfig) => void;
  onReload: () => void;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onLockPointer: () => void;
  onVirtualJoystick: (x: number, y: number) => void;
  onTouchFire: (firing: boolean) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onSelectOutfit: (outfit: OutfitId) => void;
  onSelectMap: (map: MapId) => void;
  onUseMedkit: () => void;
  onJump: () => void;
  onToggleCrouch: () => void;
  onToggleSprint: () => void;
  onTriggerDash: () => void;
  onDeployGlooWall: () => void;
  onThrowGrenade: () => void;
  onSetGraphicsQuality: (quality: GraphicsQuality) => void;
  onTriggerEmote: (emoteId: EmoteId) => void;
  onSetLobbyWeapons: (primary: WeaponId, secondary: WeaponId) => void;
  onSwitchWeapon: (slot?: 0 | 1) => void;
  onPickupWeapon: () => void;
  onReturnToLobby: () => void;
  onJoinRoom: (uid: string) => void;
  onLeaveRoom: () => void;
  onSetPlayerName: (name: string) => void;
  onSetOnlineMode: (mode: OnlineMode) => void;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const TacticalHud: React.FC<TacticalHudProps> = ({
  hud,
  muted,
  settings,
  onlineRoom,
  onUpdateSettings,
  onStartMatch,
  onReload,
  onToggleCamera,
  onToggleMute,
  onLockPointer,
  onVirtualJoystick,
  onTouchFire,
  onTouchLook,
  onSelectOutfit,
  onSelectMap,
  onUseMedkit,
  onJump,
  onToggleCrouch,
  onToggleSprint,
  onTriggerDash,
  onDeployGlooWall,
  onThrowGrenade,
  onSetGraphicsQuality,
  onTriggerEmote,
  onSetLobbyWeapons,
  onSwitchWeapon,
  onPickupWeapon,
  onReturnToLobby,
  onJoinRoom,
  onLeaveRoom,
  onSetPlayerName,
  onSetOnlineMode,
}) => {
  const [enemyCount, setEnemyCount] = useState<number>(9);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [primaryWeapon, setPrimaryWeapon] = useState<WeaponId>('carbine');
  const [secondaryWeapon, setSecondaryWeapon] = useState<WeaponId>('smg');
  const [friendUidInput, setFriendUidInput] = useState('');
  const [nameInput, setNameInput] = useState(onlineRoom.myName);
  const [copiedUid, setCopiedUid] = useState(false);
  const [quickEmoteOpen, setQuickEmoteOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockTray, setDockTray] = useState<'none' | 'emotes' | 'outfits'>('none');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1200;
  });

  // Custom HUD Editor state
  const [customHud, setCustomHud] = useState<CustomHudConfig>(loadSavedCustomHud);
  const [draftHud, setDraftHud] = useState<CustomHudConfig>(loadSavedCustomHud);
  const [isCustomizingHud, setIsCustomizingHud] = useState(false);
  const [selectedHudItem, setSelectedHudItem] = useState<CustomHudItemId>('fire');
  const dragHudRef = useRef<{
    id: CustomHudItemId;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Fixed bottom-left virtual joystick & right-side swipe look (crash-free window pointer tracking)
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyPointerIdRef = useRef<number | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joySprinting, setJoySprinting] = useState(false);
  const lookPointerRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const handleJoystickMove = useCallback(
    (clientX: number, clientY: number) => {
      const el = joyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width * 0.38;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      const nx = dx / maxR;
      const ny = -dy / maxR;
      setJoyKnob({ x: dx, y: dy });
      setJoySprinting(Math.hypot(nx, ny) > 0.85);
      onVirtualJoystick(nx, ny);
    },
    [onVirtualJoystick],
  );

  const resetJoystick = useCallback(() => {
    joyPointerIdRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    setJoySprinting(false);
    onVirtualJoystick(0, 0);
  }, [onVirtualJoystick]);

  const requestHorizontalPlay = useCallback(() => {
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenElement && docEl.requestFullscreen) {
        const p = docEl.requestFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      const orientation = screen.orientation as { lock?: (mode: string) => Promise<void> } | undefined;
      if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // Safe fallback inside sandboxed iframes
    }
  }, []);

  const openCustomHudEditor = useCallback(() => {
    setDraftHud(customHud);
    setIsCustomizingHud(true);
    setShowTouchControls(true);
    onTouchFire(false);
    resetJoystick();
  }, [customHud, onTouchFire, resetJoystick]);

  const saveCustomHud = useCallback(() => {
    setCustomHud(draftHud);
    try {
      localStorage.setItem(CUSTOM_HUD_STORAGE_KEY, JSON.stringify(draftHud));
    } catch {
      // Ignore storage quota restrictions
    }
    setIsCustomizingHud(false);
  }, [draftHud]);

  const resetCustomHud = useCallback(() => {
    setDraftHud(DEFAULT_CUSTOM_HUD);
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (dragHudRef.current && dragHudRef.current.pointerId === e.pointerId) {
        const vw = Math.max(window.innerWidth, 1);
        const vh = Math.max(window.innerHeight, 1);
        const xPct = Math.min(95, Math.max(5, ((e.clientX - dragHudRef.current.offsetX) / vw) * 100));
        const yPct = Math.min(92, Math.max(8, ((e.clientY - dragHudRef.current.offsetY) / vh) * 100));
        const id = dragHudRef.current.id;
        setDraftHud((prev) => ({
          ...prev,
          [id]: { ...prev[id], xPct: Math.round(xPct * 10) / 10, yPct: Math.round(yPct * 10) / 10 },
        }));
        return;
      }

      if (joyPointerIdRef.current === e.pointerId) {
        handleJoystickMove(e.clientX, e.clientY);
      }
      if (lookPointerRef.current && lookPointerRef.current.id === e.pointerId) {
        const dx = e.clientX - lookPointerRef.current.x;
        const dy = e.clientY - lookPointerRef.current.y;
        lookPointerRef.current.x = e.clientX;
        lookPointerRef.current.y = e.clientY;
        onTouchLook(dx * 2.1, dy * 1.7);
      }
    };

    const handlePointerUpOrCancel = (e: PointerEvent) => {
      if (dragHudRef.current && dragHudRef.current.pointerId === e.pointerId) {
        dragHudRef.current = null;
      }
      if (joyPointerIdRef.current === e.pointerId) {
        resetJoystick();
      }
      if (lookPointerRef.current && lookPointerRef.current.id === e.pointerId) {
        lookPointerRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUpOrCancel);
    window.addEventListener('pointercancel', handlePointerUpOrCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrCancel);
      window.removeEventListener('pointercancel', handlePointerUpOrCancel);
    };
  }, [handleJoystickMove, onTouchLook, resetJoystick]);

  useEffect(() => {
    setNameInput(onlineRoom.myName);
  }, [onlineRoom.myName]);

  useEffect(() => {
    if (hud.status !== 'playing' || !showTouchControls || isCustomizingHud) {
      resetJoystick();
      lookPointerRef.current = null;
      onTouchFire(false);
    }
    if (hud.status !== 'playing') {
      setQuickEmoteOpen(false);
    }
  }, [hud.status, isCustomizingHud, onTouchFire, resetJoystick, showTouchControls]);

  const handleCopyUid = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(onlineRoom.myUid);
      setCopiedUid(true);
      window.setTimeout(() => setCopiedUid(false), 1800);
    } catch {
      // Clipboard blocked in sandbox
    }
  }, [onlineRoom.myUid]);

  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const accuracy =
    hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;

  const selectedLayout = draftHud[selectedHudItem];

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* Damage & Outside Safe Zone Screen Edge Vignettes */}
      {hud.status === 'playing' && hud.isOutsideZone && (
        <div
          className="pointer-events-none fixed inset-0 transition-opacity duration-200"
          style={{
            boxShadow: 'inset 0 0 90px 24px rgba(14, 165, 233, 0.42)',
          }}
        />
      )}
      {settings.showDamageIndicators && hud.status === 'playing' && hud.damageFlashAge < 0.35 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            boxShadow: `inset 0 0 110px 34px rgba(239, 68, 68, ${Math.max(
              0,
              0.55 * (1 - hud.damageFlashAge / 0.35),
            )})`,
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {hud.status === 'playing' && !isCustomizingHud && (
        <>
          {/* Customizable MiniMap */}
          <MiniMap hud={hud} customLayout={customHud.minimap} />

          {/* Top-Right: Match Counters, Dedicated Emote Button, Kill & Emote Feed */}
          <div className="fixed top-3 right-3 flex flex-col items-end gap-2 sm:top-4 sm:right-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickEmoteOpen((v) => !v)}
                title="Open Emotes (1-5)"
                className={`pointer-events-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-lg transition-colors ${
                  quickEmoteOpen || hud.activeEmote
                    ? 'border-amber-400 bg-amber-500 text-slate-950'
                    : 'border-white/20 bg-[#0b0f14]/88 text-amber-300 hover:border-amber-400/60 hover:bg-slate-800'
                }`}
              >
                <Smile className="h-4 w-4" />
                <span>Emote</span>
              </button>

              <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-[#0b0f14]/85 px-3 py-1.5 text-sm shadow-lg sm:gap-4 sm:px-4 sm:py-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-slate-400">Alive</span>
                  <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                    {hud.aliveCount}
                  </span>
                </div>
                <span className="text-slate-600" aria-hidden="true">/</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-slate-400">Kills</span>
                  <span className="font-mono-tabular text-base font-bold text-amber-400 sm:text-lg">
                    {hud.kills}
                  </span>
                </div>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-slate-400">Time</span>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-200 sm:text-sm">
                    {formatTime(hud.survivalSeconds)}
                  </span>
                </div>
              </div>
            </div>

            {quickEmoteOpen && (
              <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5 rounded-xl border border-amber-400/35 bg-[#0b0f14]/94 p-2 shadow-xl">
                {EMOTE_CATALOG.map((em) => {
                  const isActive = hud.activeEmote === em.id;
                  return (
                    <button
                      key={`quick-em-${em.id}`}
                      type="button"
                      onClick={() => {
                        onTriggerEmote(em.id);
                        setQuickEmoteOpen(false);
                      }}
                      className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/15 bg-slate-800/90 text-slate-100 hover:border-amber-400/60 hover:bg-slate-700'
                      }`}
                    >
                      <span className="font-mono-tabular text-[10px] opacity-75">{em.hotkey}</span>
                      <span>{em.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {hud.killFeed.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                {hud.killFeed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded border border-white/10 bg-[#0b0f14]/80 px-2.5 py-1 text-xs text-slate-200"
                  >
                    <span className={item.isPlayerKill ? 'font-semibold text-amber-400' : 'text-slate-300'}>
                      {item.killer}
                    </span>
                    <span className="mx-1.5 text-slate-500">
                      {item.isZone ? 'claimed' : 'eliminated'}
                    </span>
                    <span className="font-medium text-red-300">{item.victim}</span>
                  </div>
                ))}
              </div>
            )}

            {hud.emoteFeed.length > 0 && (
              <div className="flex flex-col items-end gap-1">
                {hud.emoteFeed.map((item) => (
                  <div
                    key={`ef-${item.id}`}
                    className="rounded border border-sky-400/20 bg-[#0b0f14]/80 px-2.5 py-1 text-xs text-slate-200"
                  >
                    <span className={item.isPlayer ? 'font-semibold text-sky-300' : 'text-amber-300'}>
                      {item.actor}
                    </span>
                    <span className="ml-1.5 text-slate-300">{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Center Crosshair + Hitmarker */}
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <span className="absolute top-2 h-2 w-0.5 bg-white/90 shadow-sm" />
              <span className="absolute bottom-2 h-2 w-0.5 bg-white/90 shadow-sm" />
              <span className="absolute left-2 h-0.5 w-2 bg-white/90 shadow-sm" />
              <span className="absolute right-2 h-0.5 w-2 bg-white/90 shadow-sm" />
              <span className="h-1 w-1 rounded-full bg-amber-400" />

              {settings.showDamageIndicators && hud.hitMarkerAge < 0.22 && (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  className="absolute"
                  style={{ opacity: Math.max(0, 1 - hud.hitMarkerAge / 0.22) }}
                >
                  <line
                    x1="6"
                    y1="6"
                    x2="12"
                    y2="12"
                    stroke={hud.hitMarkerKill ? '#ef4444' : '#fbbf24'}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <line
                    x1="26"
                    y1="6"
                    x2="20"
                    y2="12"
                    stroke={hud.hitMarkerKill ? '#ef4444' : '#fbbf24'}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <line
                    x1="6"
                    y1="26"
                    x2="12"
                    y2="20"
                    stroke={hud.hitMarkerKill ? '#ef4444' : '#fbbf24'}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <line
                    x1="26"
                    y1="26"
                    x2="20"
                    y2="20"
                    stroke={hud.hitMarkerKill ? '#ef4444' : '#fbbf24'}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Horizontal Swipe Aim Overlay (right half of screen) */}
          {showTouchControls && (
            <div
              className="pointer-events-auto fixed top-14 right-0 bottom-24 left-1/2 touch-none select-none"
              onPointerDown={(e) => {
                if (lookPointerRef.current !== null) return;
                e.preventDefault();
                e.stopPropagation();
                lookPointerRef.current = {
                  id: e.pointerId,
                  x: e.clientX,
                  y: e.clientY,
                };
              }}
            />
          )}

          {/* Customized On-Screen Controls: Fixed Joystick, Sprint, Fire, Health, Jump, Crouch, Reload */}
          {showTouchControls && (
            <>
              {/* Fixed Joystick + Sprint Lock */}
              <div
                className="pointer-events-auto fixed flex flex-col items-center gap-1.5 touch-none select-none"
                style={{
                  left: `${customHud.joystick.xPct}%`,
                  top: `${customHud.joystick.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.joystick.scale})`,
                  opacity: customHud.joystick.opacity,
                }}
              >
                <button
                  type="button"
                  onClick={onToggleSprint}
                  title="Sprint Lock (Shift)"
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                    hud.isSprinting
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/20 bg-[#0b0f14]/80 text-slate-300'
                  }`}
                >
                  <Zap className="h-2.5 w-2.5" />
                  <span>Sprint</span>
                </button>
                <div
                  ref={joyRef}
                  className={`flex h-24 w-24 items-center justify-center rounded-full border-2 transition-colors sm:h-28 sm:w-28 ${
                    joySprinting || hud.isSprinting
                      ? 'border-amber-400/80 bg-[#0b0f14]/75'
                      : 'border-white/25 bg-[#0b0f14]/70'
                  }`}
                  onPointerDown={(e) => {
                    if (joyPointerIdRef.current !== null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    joyPointerIdRef.current = e.pointerId;
                    handleJoystickMove(e.clientX, e.clientY);
                  }}
                >
                  <div
                    className={`h-10 w-10 rounded-full border shadow sm:h-11 sm:w-11 ${
                      joySprinting || hud.isSprinting
                        ? 'border-amber-200 bg-amber-400/90'
                        : 'border-white/35 bg-slate-200/85'
                    }`}
                    style={{
                      transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                    }}
                  />
                </div>
              </div>

              {/* Fire Button */}
              <button
                type="button"
                className="pointer-events-auto fixed flex h-18 w-18 touch-none select-none flex-col items-center justify-center gap-0.5 rounded-full border-2 border-amber-400 bg-amber-500/90 font-display text-xs font-bold text-slate-950 shadow-lg active:scale-95 sm:h-20 sm:w-20 sm:text-sm"
                style={{
                  left: `${customHud.fire.xPct}%`,
                  top: `${customHud.fire.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.fire.scale})`,
                  opacity: customHud.fire.opacity,
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTouchFire(true);
                }}
                onPointerUp={() => onTouchFire(false)}
                onPointerLeave={() => onTouchFire(false)}
                onPointerCancel={() => onTouchFire(false)}
              >
                <Crosshair className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>FIRE</span>
              </button>

              {/* Health / Medkit Button */}
              <button
                type="button"
                onClick={onUseMedkit}
                disabled={hud.medkits <= 0 || hud.health >= hud.maxHealth}
                title="Use Medkit (+40 HP) [H]"
                className="pointer-events-auto fixed flex h-14 w-14 touch-none select-none flex-col items-center justify-center rounded-full border-2 border-emerald-400/80 bg-[#0b0f14]/88 text-emerald-300 shadow-lg transition-transform active:scale-95 disabled:opacity-45 sm:h-15 sm:w-15"
                style={{
                  left: `${customHud.health.xPct}%`,
                  top: `${customHud.health.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.health.scale})`,
                  opacity: customHud.health.opacity,
                }}
              >
                <Plus className="h-4 w-4 stroke-[2.8]" />
                <span className="font-mono-tabular text-[10px] font-bold leading-none text-white">
                  HP · {hud.medkits}
                </span>
              </button>

              {/* Jump Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onJump();
                }}
                title="Jump (J / G)"
                className="pointer-events-auto fixed flex h-12 w-12 touch-none select-none flex-col items-center justify-center rounded-full border border-white/25 bg-[#0b0f14]/85 text-slate-100 shadow-lg active:scale-95 sm:h-13 sm:w-13"
                style={{
                  left: `${customHud.jump.xPct}%`,
                  top: `${customHud.jump.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.jump.scale})`,
                  opacity: customHud.jump.opacity,
                }}
              >
                <ArrowUp className="h-4 w-4 text-cyan-300" />
                <span className="text-[9px] font-bold">JUMP</span>
              </button>

              {/* Crouch Button */}
              <button
                type="button"
                onClick={onToggleCrouch}
                title="Crouch (C)"
                className={`pointer-events-auto fixed flex h-12 w-12 touch-none select-none flex-col items-center justify-center rounded-full border shadow-lg active:scale-95 sm:h-13 sm:w-13 ${
                  hud.isCrouching
                    ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
                    : 'border-white/25 bg-[#0b0f14]/85 text-slate-100'
                }`}
                style={{
                  left: `${customHud.crouch.xPct}%`,
                  top: `${customHud.crouch.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.crouch.scale})`,
                  opacity: customHud.crouch.opacity,
                }}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="text-[9px] font-bold">CROUCH</span>
              </button>

              {/* Quick Reload Button */}
              <button
                type="button"
                onClick={onReload}
                disabled={hud.isReloading || hud.ammo === hud.magSize || hud.reserveAmmo === 0}
                title="Reload (R)"
                className="pointer-events-auto fixed flex h-12 w-12 touch-none select-none flex-col items-center justify-center rounded-full border border-white/25 bg-[#0b0f14]/85 text-amber-300 shadow-lg active:scale-95 disabled:opacity-40 sm:h-13 sm:w-13"
                style={{
                  left: `${customHud.reload.xPct}%`,
                  top: `${customHud.reload.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.reload.scale})`,
                  opacity: customHud.reload.opacity,
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="font-mono-tabular text-[9px] font-bold text-white">
                  {hud.ammo}
                </span>
              </button>

              {/* Gloo Wall Deploy Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeployGlooWall();
                }}
                disabled={hud.glooWalls <= 0}
                title="Deploy Gloo Wall (B)"
                className="pointer-events-auto fixed flex h-13 w-13 touch-none select-none flex-col items-center justify-center rounded-full border-2 border-sky-400/80 bg-[#0b0f14]/88 text-sky-300 shadow-lg active:scale-95 disabled:opacity-40 sm:h-14 sm:w-14"
                style={{
                  left: `${customHud.glooWall.xPct}%`,
                  top: `${customHud.glooWall.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.glooWall.scale})`,
                  opacity: customHud.glooWall.opacity,
                }}
              >
                <Shield className="h-4 w-4" />
                <span className="font-mono-tabular text-[9px] font-bold text-white">
                  GLOO · {hud.glooWalls}
                </span>
              </button>

              {/* Frag Grenade Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onThrowGrenade();
                }}
                disabled={hud.grenades <= 0}
                title="Throw Frag Grenade (G)"
                className="pointer-events-auto fixed flex h-13 w-13 touch-none select-none flex-col items-center justify-center rounded-full border-2 border-orange-400/80 bg-[#0b0f14]/88 text-orange-300 shadow-lg active:scale-95 disabled:opacity-40 sm:h-14 sm:w-14"
                style={{
                  left: `${customHud.grenade.xPct}%`,
                  top: `${customHud.grenade.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.grenade.scale})`,
                  opacity: customHud.grenade.opacity,
                }}
              >
                <Flame className="h-4 w-4" />
                <span className="font-mono-tabular text-[9px] font-bold text-white">
                  FRAG · {hud.grenades}
                </span>
              </button>

              {/* Tactical Dash / Slide Movement Button */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTriggerDash();
                }}
                disabled={hud.dashCooldown > 0}
                title="Tactical Dash (U)"
                className={`pointer-events-auto fixed flex h-12 w-12 touch-none select-none flex-col items-center justify-center rounded-full border shadow-lg active:scale-95 disabled:opacity-50 sm:h-13 sm:w-13 ${
                  hud.isDashing
                    ? 'border-cyan-300 bg-cyan-500 text-slate-950'
                    : 'border-cyan-400/60 bg-[#0b0f14]/88 text-cyan-300'
                }`}
                style={{
                  left: `${customHud.dash.xPct}%`,
                  top: `${customHud.dash.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${customHud.dash.scale})`,
                  opacity: customHud.dash.opacity,
                }}
              >
                <Wind className="h-4 w-4" />
                <span className="font-mono-tabular text-[9px] font-bold">
                  {hud.dashCooldown > 0 ? `${hud.dashCooldown.toFixed(1)}s` : 'DASH'}
                </span>
              </button>
            </>
          )}

          {/* Bottom-Center Collapsible Tactical Dock + Take Dropped Gun Banner + 2-Gun Switcher */}
          <div className="pointer-events-auto fixed bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center sm:bottom-3">
            {hud.nearbyWeaponDrop && (
              <button
                type="button"
                onClick={onPickupWeapon}
                className="mb-2 flex items-center gap-2 rounded-lg border border-purple-400/70 bg-[#171126]/95 px-3.5 py-1.5 text-xs font-bold text-purple-100 shadow-xl transition-colors hover:bg-purple-600/40"
              >
                <span className="rounded bg-purple-500 px-1.5 py-0.5 font-mono-tabular text-[10px] text-white">
                  Z
                </span>
                <span>
                  Take {WEAPON_BY_ID[hud.nearbyWeaponDrop.weaponId].name} (
                  {hud.nearbyWeaponDrop.ammo}/{hud.nearbyWeaponDrop.reserveAmmo})
                </span>
              </button>
            )}
            {!dockCollapsed && dockTray === 'emotes' && (
              <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#0b0f14]/94 p-2 shadow-xl">
                {EMOTE_CATALOG.map((em) => {
                  const isActive = hud.activeEmote === em.id;
                  return (
                    <button
                      key={em.id}
                      type="button"
                      onClick={() => {
                        onTriggerEmote(em.id);
                        setDockTray('none');
                      }}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-slate-800/90 text-slate-200 hover:border-white/25 hover:bg-slate-700'
                      }`}
                    >
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        {em.hotkey}
                      </span>
                      <span>{em.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!dockCollapsed && dockTray === 'outfits' && (
              <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#0b0f14]/94 p-2 shadow-xl">
                {OUTFIT_CATALOG.map((item) => {
                  const selected = hud.outfit === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectOutfit(item.id);
                        setDockTray('none');
                      }}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-white/10 bg-slate-800/90 text-slate-200 hover:border-white/25 hover:bg-slate-700'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-xs border border-white/25"
                        style={{ backgroundColor: item.primaryHex }}
                      />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              className="mb-1 flex items-center gap-1.5 rounded-t-md border border-b-0 border-white/15 bg-[#0b0f14]/85 px-3 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Show HUD</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Hide HUD</span>
                </>
              )}
            </button>

            {!dockCollapsed && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0b0f14]/90 px-3 py-1.5 shadow-xl sm:gap-3 sm:px-4 sm:py-2">
                {/* Health Bar + Medkit */}
                <div className="flex items-center gap-2">
                  <Heart
                    className={`h-4 w-4 shrink-0 ${
                      hud.health <= 30 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  />
                  <div className="w-20 sm:w-28">
                    <div className="mb-0.5 flex items-center justify-between text-[11px] font-mono-tabular">
                      <span className="text-slate-400">HP</span>
                      <span
                        className={`font-bold ${
                          hud.health <= 30 ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {hud.health}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800">
                      <div
                        className={`h-full transition-all duration-150 ${
                          hud.health <= 30
                            ? 'bg-red-500'
                            : hud.health <= 60
                              ? 'bg-amber-400'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${healthPct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onUseMedkit}
                    disabled={hud.medkits <= 0 || hud.health >= hud.maxHealth}
                    title="Use Medkit (+40 HP) [H]"
                    className="flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="font-mono-tabular">{hud.medkits}</span>
                  </button>
                </div>

                <div className="hidden h-6 w-px bg-white/10 sm:block" />

                {/* 2-Gun Loadout Switcher & Ammo */}
                <div className="flex items-center gap-1.5">
                  {hud.weaponSlots.map((slot, idx) => {
                    const slotNum = idx as 0 | 1;
                    const active = hud.activeWeaponSlot === slotNum;
                    const spec = WEAPON_BY_ID[slot.weaponId];
                    return (
                      <button
                        key={`hud-slot-${idx}`}
                        type="button"
                        onClick={() => onSwitchWeapon(slotNum)}
                        title={`Switch to Slot ${idx + 1} (X)`}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-amber-400 bg-amber-500/20 text-white'
                            : 'border-white/10 bg-slate-800/80 text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <span className="font-mono-tabular text-[10px] font-bold text-amber-300">
                          {idx + 1}
                        </span>
                        <span className="text-[11px] font-semibold">{spec.shortName}</span>
                        <span className="font-mono-tabular text-[10px] text-slate-300">
                          {slot.ammo}/{slot.reserveAmmo}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => onSwitchWeapon()}
                    title="Swap Gun (X)"
                    className="rounded-md border border-white/15 bg-slate-800 px-1.5 py-1 text-[11px] font-bold text-cyan-300 transition-colors hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onReload}
                    disabled={hud.isReloading || hud.ammo === hud.magSize || hud.reserveAmmo === 0}
                    className="rounded-md border border-white/15 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    {hud.isReloading ? '...' : 'R'}
                  </button>
                </div>

                {/* Desktop Quick Gloo Wall & Grenade Buttons */}
                <div className="hidden items-center gap-1 sm:flex">
                  <button
                    type="button"
                    onClick={onDeployGlooWall}
                    disabled={hud.glooWalls <= 0}
                    title="Deploy Gloo Wall (B)"
                    className="flex items-center gap-1 rounded-md border border-sky-400/35 bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
                  >
                    <Shield className="h-3 w-3" />
                    <span className="font-mono-tabular">{hud.glooWalls}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onThrowGrenade}
                    disabled={hud.grenades <= 0}
                    title="Throw Frag Grenade (G)"
                    className="flex items-center gap-1 rounded-md border border-orange-400/35 bg-orange-500/15 px-2 py-1 text-xs font-semibold text-orange-200 transition-colors hover:bg-orange-500/25 disabled:opacity-40"
                  >
                    <Flame className="h-3 w-3" />
                    <span className="font-mono-tabular">{hud.grenades}</span>
                  </button>
                </div>

                <div className="hidden h-6 w-px bg-white/10 sm:block" />

                {/* Quick Utility Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDockTray((prev) => (prev === 'emotes' ? 'none' : 'emotes'))
                    }
                    title="Emotes (Keys 1-5)"
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      dockTray === 'emotes' || hud.activeEmote
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Smile className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Emotes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDockTray((prev) => (prev === 'outfits' ? 'none' : 'outfits'))
                    }
                    title="Switch Outfit"
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      dockTray === 'outfits'
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Shirt className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Outfits</span>
                  </button>

                  <button
                    type="button"
                    onClick={openCustomHudEditor}
                    title="Customize HUD Layout & HD Graphics"
                    className="flex items-center gap-1 rounded-md border border-cyan-400/35 bg-cyan-500/15 px-2 py-1 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Custom HUD</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleCamera}
                    title="Switch Camera (V)"
                    className="flex items-center gap-1 rounded-md border border-white/15 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5 text-sky-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTouchControls((v) => !v)}
                    title="Toggle On-Screen Controls"
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      showTouchControls
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Gamepad2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={requestHorizontalPlay}
                    title="Horizontal Fullscreen"
                    className="rounded-md border border-white/15 bg-slate-800 p-1 text-slate-200 transition-colors hover:bg-slate-700"
                  >
                    <Maximize className="h-3.5 w-3.5 text-cyan-300" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleMute}
                    title="Mute / Unmute Audio"
                    className="rounded-md border border-white/15 bg-slate-800 p-1 text-slate-200 transition-colors hover:bg-slate-700"
                  >
                    {muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={onReturnToLobby}
                    title="Return to Lobby"
                    className="rounded-md border border-white/15 bg-slate-800 p-1 text-slate-200 transition-colors hover:bg-slate-700"
                  >
                    <Home className="h-4 w-4 text-slate-300" />
                  </button>

                  {!hud.pointerLocked && !showTouchControls && (
                    <button
                      type="button"
                      onClick={onLockPointer}
                      className="hidden sm:inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      <span>Aim</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Interactive Custom HUD & HD Graphics Editor Overlay */}
      {isCustomizingHud && (
        <div className="pointer-events-auto fixed inset-0 z-30 bg-[#0b0f14]/55 select-none">
          {/* Top-Center Editor Controls */}
          <div className="fixed top-3 left-1/2 flex w-[94vw] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/35 bg-[#0f1620]/96 px-3 py-2.5 shadow-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="text-xs font-bold text-white">
                  Custom HUD · {CUSTOM_HUD_LABELS[selectedHudItem]}
                </div>
                <div className="text-[10px] text-slate-400">
                  Drag any button to move · Adjust size, opacity &amp; HD quality
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span>Size</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  value={selectedLayout.scale}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDraftHud((prev) => ({
                      ...prev,
                      [selectedHudItem]: { ...prev[selectedHudItem], scale: val },
                    }));
                  }}
                  className="w-18 accent-cyan-400"
                />
                <span className="font-mono-tabular w-8 text-[10px] text-cyan-300">
                  {Math.round(selectedLayout.scale * 100)}%
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0.45}
                  max={1}
                  step={0.05}
                  value={selectedLayout.opacity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDraftHud((prev) => ({
                      ...prev,
                      [selectedHudItem]: { ...prev[selectedHudItem], opacity: val },
                    }));
                  }}
                  className="w-18 accent-cyan-400"
                />
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              {/* HD Quality Pills inside Customizer */}
              <div className="flex rounded-md bg-[#0b0f14] p-0.5">
                {(['smooth', 'hd', 'ultra'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSetGraphicsQuality(q)}
                    className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${
                      hud.graphicsQuality === q
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={resetCustomHud}
                className="rounded-md border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizingHud(false)}
                className="rounded-md border border-white/15 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCustomHud}
                className="flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Draggable HUD Handles */}
          {(Object.keys(CUSTOM_HUD_LABELS) as CustomHudItemId[]).map((id) => {
            const layout = draftHud[id];
            const isSelected = selectedHudItem === id;
            const sizeClass =
              id === 'joystick'
                ? 'h-24 w-24 rounded-full'
                : id === 'minimap'
                  ? 'h-28 w-28 rounded-lg'
                  : id === 'fire'
                    ? 'h-18 w-18 rounded-full'
                    : 'h-13 w-13 rounded-full';
            return (
              <div
                key={id}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedHudItem(id);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  dragHudRef.current = {
                    id,
                    pointerId: e.pointerId,
                    offsetX: e.clientX - centerX,
                    offsetY: e.clientY - centerY,
                  };
                }}
                style={{
                  left: `${layout.xPct}%`,
                  top: `${layout.yPct}%`,
                  transform: `translate(-50%, -50%) scale(${layout.scale})`,
                  opacity: layout.opacity,
                }}
                className={`fixed flex cursor-grab flex-col items-center justify-center border-2 text-center shadow-lg touch-none active:cursor-grabbing ${sizeClass} ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-500/25 text-white'
                    : 'border-white/40 bg-[#0b0f14]/80 text-slate-200'
                }`}
              >
                <span className="px-1 text-[10px] font-bold leading-tight">
                  {CUSTOM_HUD_LABELS[id]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Menu & Horizontal Live 3D Wardrobe Overlay */}
      {hud.status === 'menu' && !isCustomizingHud && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-gradient-to-r from-[#0b0f14]/90 via-[#0b0f14]/50 to-transparent p-2.5 sm:p-4 md:justify-start md:pl-6">
          <div className="max-h-[95vh] w-full max-w-[660px] overflow-y-auto rounded-xl border border-white/15 bg-[#0f1620]/95 p-4 shadow-2xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-cyan-400">
                  Tactical 3D Survival Arena
                </p>
                <h1 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Agam Battlegrounds
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-slate-800/90 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition-colors hover:border-white/35 hover:bg-slate-700 whitespace-nowrap shrink-0"
                >
                  <Settings className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={openCustomHudEditor}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/12 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/22 whitespace-nowrap shrink-0"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Custom HUD</span>
                </button>
                <button
                  type="button"
                  onClick={requestHorizontalPlay}
                  title="Play Horizontal Fullscreen"
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 whitespace-nowrap shrink-0"
                >
                  <Maximize className="h-3.5 w-3.5" />
                  <span>Horizontal</span>
                </button>
              </div>
            </div>

            {/* Online Multiplayer Squad & Friend UID Panel */}
            <div className="mt-3 rounded-lg border border-cyan-400/25 bg-[#0b0f14]/85 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      onlineRoom.connected ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <Users className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Online Squad</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono-tabular text-[11px] font-bold text-amber-300">
                    UID: {onlineRoom.myUid}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="flex items-center gap-1 rounded border border-white/15 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    <Copy className="h-2.5 w-2.5" />
                    <span>{copiedUid ? 'Copied' : 'Copy UID'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {(['coop', 'pvp'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={!onlineRoom.isHost}
                      onClick={() => onSetOnlineMode(m)}
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-colors disabled:opacity-60 ${
                        onlineRoom.mode === m
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {m === 'coop' ? 'Co-op' : 'PvP Duel'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameInput}
                    maxLength={18}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={() => onSetPlayerName(nameInput)}
                    placeholder="Your Callsign"
                    className="w-full rounded border border-white/15 bg-[#0f1620] px-2.5 py-1 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onSetPlayerName(nameInput)}
                    className="shrink-0 rounded border border-white/15 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    Set
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={friendUidInput}
                    onChange={(e) => setFriendUidInput(e.target.value.toUpperCase())}
                    placeholder="Friend UID (AGAM-...)"
                    className="w-full rounded border border-white/15 bg-[#0f1620] px-2.5 py-1 font-mono-tabular text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (friendUidInput.trim()) onJoinRoom(friendUidInput);
                    }}
                    className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
                  >
                    Join
                  </button>
                  {onlineRoom.roomUid !== onlineRoom.myUid && (
                    <button
                      type="button"
                      onClick={onLeaveRoom}
                      className="shrink-0 rounded border border-red-400/40 bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-500/25"
                    >
                      Leave
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                <span className="text-slate-400">Room {onlineRoom.roomUid}:</span>
                {onlineRoom.players.length === 0 ? (
                  <span className="text-slate-400">{onlineRoom.myName} (Solo)</span>
                ) : (
                  onlineRoom.players.map((p) => (
                    <span
                      key={p.uid}
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        p.uid === onlineRoom.myUid
                          ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                          : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      }`}
                    >
                      {p.name}
                      {p.uid === onlineRoom.hostUid ? ' · Host' : ''}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Map & HD Graphics */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
              {/* Arena Map Selector (Realistic Valley / Nextera / Compound) */}
              <div className="sm:col-span-7">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Battleground Map</span>
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {MAP_CATALOG.map((m) => {
                    const selected = hud.map === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onSelectMap(m.id)}
                        className={`flex flex-col rounded-lg border p-2 text-left transition-colors ${
                          selected
                            ? m.id === 'nextera'
                              ? 'border-cyan-400 bg-cyan-500/15 text-white'
                              : m.id === 'realistic'
                                ? 'border-emerald-400 bg-emerald-500/15 text-white'
                                : 'border-amber-400 bg-amber-500/15 text-white'
                            : 'border-white/10 bg-[#0b0f14]/80 text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: m.accentHex }}
                          />
                          <span className="truncate text-[11px] font-bold">{m.name}</span>
                        </div>
                        <span className="mt-0.5 truncate text-[10px] text-slate-400">
                          {m.id === 'realistic'
                            ? 'Roads & Outpost'
                            : m.id === 'nextera'
                              ? 'Tech Arena'
                              : 'Woodland'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom HD Graphics Quality */}
              <div className="sm:col-span-5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span>Graphics (HD)</span>
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-[#0b0f14] p-1">
                  {([
                    { id: 'smooth', label: 'Smooth' },
                    { id: 'hd', label: 'HD' },
                    { id: 'ultra', label: 'Ultra' },
                  ] as const).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onSetGraphicsQuality(g.id)}
                      className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                        hud.graphicsQuality === g.id
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2-Gun Loadout Selector (Primary + Secondary) */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0b0f14]/75 p-2">
                <div className="text-[11px] font-semibold text-amber-300">Gun Slot 1 (Primary)</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {WEAPON_CATALOG.map((w) => {
                    const active = primaryWeapon === w.id;
                    return (
                      <button
                        key={`p-${w.id}`}
                        type="button"
                        onClick={() => {
                          setPrimaryWeapon(w.id);
                          onSetLobbyWeapons(w.id, secondaryWeapon);
                        }}
                        className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'border-amber-400 bg-amber-500 text-slate-950'
                            : 'border-white/10 bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {w.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-[#0b0f14]/75 p-2">
                <div className="text-[11px] font-semibold text-cyan-300">Gun Slot 2 (Secondary)</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {WEAPON_CATALOG.map((w) => {
                    const active = secondaryWeapon === w.id;
                    return (
                      <button
                        key={`s-${w.id}`}
                        type="button"
                        onClick={() => {
                          setSecondaryWeapon(w.id);
                          onSetLobbyWeapons(primaryWeapon, w.id);
                        }}
                        className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                            : 'border-white/10 bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {w.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Character Clothes / Wardrobe Selector */}
            <div className="mt-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Character Clothes &amp; Gear
                </label>
                <span className="text-[11px] text-slate-400">Live 3D Squad Preview</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {OUTFIT_CATALOG.map((item) => {
                  const selected = hud.outfit === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectOutfit(item.id)}
                      className={`flex flex-col rounded-lg border p-2 text-left transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-white/10 bg-[#0b0f14]/80 text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="h-2.5 w-2.5 rounded-xs border border-white/20"
                          style={{ backgroundColor: item.primaryHex }}
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-xs border border-white/20"
                          style={{ backgroundColor: item.secondaryHex }}
                        />
                        <span
                          className="h-2.5 w-1 rounded-xs"
                          style={{ backgroundColor: item.accentHex }}
                        />
                      </div>
                      <span className="mt-1.5 truncate text-[11px] font-semibold">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Lobby Emotes (< md screens) */}
            <div className="mt-3 md:hidden">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">Squad Emotes</label>
                {hud.emoteFeed[0] && (
                  <span className="truncate pl-2 text-[11px] text-sky-300">
                    {hud.emoteFeed[0].actor} {hud.emoteFeed[0].text}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {EMOTE_CATALOG.map((em) => {
                  const isActive = hud.activeEmote === em.id;
                  return (
                    <button
                      key={`mob-${em.id}`}
                      type="button"
                      onClick={() => onTriggerEmote(em.id)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/10 bg-[#0b0f14]/80 text-slate-200 hover:border-white/25'
                      }`}
                    >
                      {em.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Match Configuration */}
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Hostile Combatants
                </label>
                <div className="mt-1 flex gap-1 rounded-lg bg-[#0b0f14] p-1">
                  {[6, 9, 12].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setEnemyCount(count)}
                      className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                        enemyCount === count
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400">
                  Combat Intensity
                </label>
                <div className="mt-1 flex gap-1 rounded-lg bg-[#0b0f14] p-1">
                  {(['standard', 'veteran'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`flex-1 rounded-md py-1 text-xs font-semibold capitalize transition-colors ${
                        difficulty === diff
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Concise Controls Guide */}
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-[11px] text-slate-300 sm:grid-cols-4">
              <div>
                <span className="font-semibold text-white">WASD / U</span> · Move / Dash
              </div>
              <div>
                <span className="font-semibold text-white">B / G</span> · Gloo / Grenade
              </div>
              <div>
                <span className="font-semibold text-white">X / Z</span> · Swap / Take Gun
              </div>
              <div>
                <span className="font-semibold text-white">1–5</span> · Emotes
              </div>
            </div>

            <div className="mt-3.5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  requestHorizontalPlay();
                  onStartMatch({
                    enemyCount,
                    difficulty,
                    outfit: hud.outfit,
                    map: hud.map,
                    primaryWeapon,
                    secondaryWeapon,
                  });
                }}
                className="flex-1 rounded-lg bg-amber-500 px-5 py-2.5 font-display text-base font-bold text-slate-950 transition-colors hover:bg-amber-400"
              >
                Deploy to{' '}
                {hud.map === 'nextera'
                  ? 'Nextera'
                  : hud.map === 'realistic'
                    ? 'Realistic Valley'
                    : 'Compound'}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label="Toggle Sound"
                className="rounded-lg border border-white/15 bg-slate-800 p-2.5 text-slate-200 transition-colors hover:bg-slate-700"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Lobby Emote Bar & Squad Reactions (desktop / wide horizontal screens) */}
          <div className="pointer-events-none fixed inset-y-4 right-4 hidden flex-col items-end justify-between md:flex">
            <div className="flex flex-col items-end gap-1.5">
              <div className="rounded-md border border-white/15 bg-[#0b0f14]/85 px-3 py-1.5 text-xs font-medium text-slate-300">
                Lobby Squad Ready · Press 1–5 to Emote
              </div>
              {hud.emoteFeed.map((item) => (
                <div
                  key={`lobby-ef-${item.id}`}
                  className="rounded-md border border-sky-400/25 bg-[#0b0f14]/88 px-3 py-1.5 text-xs text-slate-200 shadow"
                >
                  <span className={item.isPlayer ? 'font-semibold text-sky-300' : 'font-semibold text-amber-300'}>
                    {item.actor}
                  </span>
                  <span className="ml-1.5 text-slate-300">{item.text}</span>
                </div>
              ))}
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-1.5">
              <span className="text-[11px] font-medium text-slate-300">
                Communicate with Squad
              </span>
              <div className="flex flex-wrap justify-end gap-1.5 rounded-xl border border-white/15 bg-[#0b0f14]/90 p-2 shadow-xl">
                {EMOTE_CATALOG.map((em) => {
                  const isActive = hud.activeEmote === em.id;
                  return (
                    <button
                      key={em.id}
                      type="button"
                      onClick={() => onTriggerEmote(em.id)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-white/10 bg-slate-800/90 text-slate-200 hover:border-white/30 hover:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`font-mono-tabular text-[10px] ${
                          isActive ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {em.hotkey}
                      </span>
                      <span>{em.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Menu Settings Overlay */}
      {hud.status === 'menu' && !isCustomizingHud && isSettingsOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#0b0f14]/85 p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#0f1620] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-lg font-bold text-white">Game Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Close Settings"
                className="rounded-md border border-white/10 bg-slate-800 p-1.5 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Look Sensitivity */}
              <div className="rounded-lg border border-white/10 bg-[#0b0f14]/80 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Look Sensitivity</span>
                  <span className="font-mono-tabular text-xs font-bold text-cyan-300">
                    {settings.lookSensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={2.2}
                  step={0.05}
                  value={settings.lookSensitivity}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      lookSensitivity: Number(e.target.value),
                    })
                  }
                  className="mt-2.5 w-full accent-cyan-400"
                />
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {([
                    { label: 'Low', value: 0.65 },
                    { label: 'Medium', value: 1.0 },
                    { label: 'High', value: 1.55 },
                  ] as const).map((preset) => {
                    const active = Math.abs(settings.lookSensitivity - preset.value) < 0.06;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ ...settings, lookSensitivity: preset.value })
                        }
                        className={`rounded-md py-1 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Audio Volumes */}
              <div className="rounded-lg border border-white/10 bg-[#0b0f14]/80 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Audio Volumes</span>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                      muted
                        ? 'border-red-400/40 bg-red-500/15 text-red-300'
                        : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    <span>{muted ? 'Muted' : 'Audio On'}</span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Master Volume</span>
                    <span className="font-mono-tabular text-amber-300">
                      {Math.round(settings.masterVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.masterVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        masterVolume: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Combat SFX (Gunfire &amp; Hits)</span>
                    <span className="font-mono-tabular text-amber-300">
                      {Math.round(settings.sfxVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.sfxVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        sfxVolume: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>UI, Pickups &amp; Emotes</span>
                    <span className="font-mono-tabular text-amber-300">
                      {Math.round(settings.uiVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.uiVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        uiVolume: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full accent-amber-400"
                  />
                </div>
              </div>

              {/* Damage Indicators Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0b0f14]/80 p-3">
                <div className="pr-3">
                  <div className="text-xs font-semibold text-white">Damage Indicators</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Show screen damage flash and crosshair hitmarkers
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showDamageIndicators}
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      showDamageIndicators: !settings.showDamageIndicators,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                    settings.showDamageIndicators
                      ? 'border-emerald-400 bg-emerald-500'
                      : 'border-white/20 bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      settings.showDamageIndicators ? 'translate-x-5.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => onUpdateSettings(DEFAULT_GAME_SETTINGS)}
                className="rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
              >
                Reset Defaults
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over / Victory Screen */}
      {(hud.status === 'dead' || hud.status === 'victory') && (
        <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-[#0b0f14]/75 p-4 sm:p-6">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0f1620] p-6 shadow-2xl sm:p-8">
            <p
              className={`text-xs font-semibold tracking-wider ${
                hud.status === 'victory' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {hud.status === 'victory' ? 'Match Complete' : 'Eliminated'}
            </p>
            <h2 className="font-display mt-1.5 text-2xl font-bold text-white sm:text-3xl">
              {hud.status === 'victory'
                ? 'Winner #1 - Victory!'
                : `You Died! #${hud.rank} - Try Again`}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{hud.endReason}</p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-y border-white/10 py-4 font-mono-tabular">
              <div>
                <div className="text-xs text-slate-400">Kills</div>
                <div className="mt-1 text-2xl font-bold text-amber-400">{hud.kills}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Damage Dealt</div>
                <div className="mt-1 text-2xl font-bold text-white">{hud.damageDealt}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Accuracy</div>
                <div className="mt-1 text-xl font-bold text-slate-200">{accuracy}%</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Survived</div>
                <div className="mt-1 text-xl font-bold text-slate-200">
                  {formatTime(hud.survivalSeconds)}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={onReturnToLobby}
                className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-800 px-4 py-3 font-display text-sm font-bold text-slate-200 transition-colors hover:bg-slate-700"
              >
                <Home className="h-4 w-4" />
                <span>Lobby</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onStartMatch({
                    enemyCount,
                    difficulty,
                    outfit: hud.outfit,
                    map: hud.map,
                    primaryWeapon,
                    secondaryWeapon,
                  })
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 font-display text-base font-bold text-slate-950 transition-colors hover:bg-amber-400"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Play Again</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
