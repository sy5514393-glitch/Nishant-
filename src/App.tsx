import { useCallback, useEffect, useRef, useState } from 'react';
import { TacticalHud } from './components/TacticalHud';
import { tacticalAudio } from './game/audio';
import { BattlegroundsEngine } from './game/BattlegroundsEngine';
import { MultiplayerClient } from './game/multiplayer';
import {
  DEFAULT_GAME_SETTINGS,
  EmoteId,
  GameSettings,
  GraphicsQuality,
  HudSnapshot,
  MapId,
  MatchConfig,
  OnlineMode,
  OnlineRoomSnapshot,
  OutfitId,
  WEAPON_BY_ID,
  WeaponId,
} from './game/types';

const SETTINGS_STORAGE_KEY = 'agam_settings_v1';

function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GAME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      lookSensitivity:
        typeof parsed.lookSensitivity === 'number'
          ? parsed.lookSensitivity
          : DEFAULT_GAME_SETTINGS.lookSensitivity,
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? parsed.masterVolume
          : DEFAULT_GAME_SETTINGS.masterVolume,
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? parsed.sfxVolume
          : DEFAULT_GAME_SETTINGS.sfxVolume,
      uiVolume:
        typeof parsed.uiVolume === 'number'
          ? parsed.uiVolume
          : DEFAULT_GAME_SETTINGS.uiVolume,
      showDamageIndicators:
        typeof parsed.showDamageIndicators === 'boolean'
          ? parsed.showDamageIndicators
          : DEFAULT_GAME_SETTINGS.showDamageIndicators,
    };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}

const INITIAL_HUD: HudSnapshot = {
  status: 'menu',
  health: 100,
  maxHealth: 100,
  medkits: 2,
  glooWalls: 3,
  grenades: 3,
  dashCooldown: 0,
  isDashing: false,
  ammo: WEAPON_BY_ID.carbine.magSize,
  magSize: WEAPON_BY_ID.carbine.magSize,
  reserveAmmo: WEAPON_BY_ID.carbine.startReserve,
  weaponSlots: [
    {
      weaponId: 'carbine',
      ammo: WEAPON_BY_ID.carbine.magSize,
      magSize: WEAPON_BY_ID.carbine.magSize,
      reserveAmmo: WEAPON_BY_ID.carbine.startReserve,
    },
    {
      weaponId: 'smg',
      ammo: WEAPON_BY_ID.smg.magSize,
      magSize: WEAPON_BY_ID.smg.magSize,
      reserveAmmo: WEAPON_BY_ID.smg.startReserve,
    },
  ],
  activeWeaponSlot: 0,
  nearbyWeaponDrop: null,
  isReloading: false,
  isCrouching: false,
  isSprinting: false,
  graphicsQuality: 'hd',
  kills: 0,
  aliveCount: 10,
  totalCombatants: 10,
  rank: 1,
  survivalSeconds: 0,
  damageDealt: 0,
  shotsFired: 0,
  shotsHit: 0,
  zoneRadius: 72,
  maxZoneRadius: 72,
  zoneCenterX: 0,
  zoneCenterZ: 0,
  zoneTimer: 60,
  zoneDamagePerSec: 5,
  isOutsideZone: false,
  distanceToZoneCenter: 0,
  playerX: 0,
  playerZ: 18,
  playerYaw: Math.PI,
  cameraMode: 'third-person',
  pointerLocked: false,
  hitMarkerAge: 99,
  hitMarkerKill: false,
  damageFlashAge: 99,
  minimapEntities: [],
  killFeed: [],
  endReason: '',
  outfit: 'tactical-camo',
  map: 'realistic',
  activeEmote: null,
  emoteFeed: [],
};

const INITIAL_ONLINE: OnlineRoomSnapshot = {
  connected: false,
  myUid: 'AGAM-000000',
  myName: 'Soldier',
  roomUid: 'AGAM-000000',
  hostUid: 'AGAM-000000',
  isHost: true,
  mode: 'coop',
  map: 'realistic',
  matchActive: false,
  players: [],
};

export default function App() {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BattlegroundsEngine | null>(null);
  const mpRef = useRef<MultiplayerClient | null>(null);
  const hudRef = useRef<HudSnapshot>(INITIAL_HUD);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot>(INITIAL_ONLINE);
  const [settings, setSettings] = useState<GameSettings>(loadSavedSettings);
  const [muted, setMuted] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const engine = new BattlegroundsEngine(
      container,
      (snapshot) => {
        hudRef.current = snapshot;
        setHud(snapshot);
      },
      (lost) => setContextLost(lost),
    );
    engineRef.current = engine;
    engine.setLookSensitivity(settings.lookSensitivity);

    const mp = new MultiplayerClient({
      onRoomChange: (snapshot) => {
        setOnlineRoom(snapshot);
        engine.setPvpMode(snapshot.mode === 'pvp');
        engine.syncRemotePlayers(snapshot.players, snapshot.myUid);
        if (!snapshot.isHost && hudRef.current.status === 'menu') {
          engine.setMap(snapshot.map);
        }
      },
      onPeerDelta: (player) => {
        engine.applyRemoteDelta(player, mp.getSnapshot().myUid);
      },
      onPeerShoot: ({ uid, weaponId, start, end }) => {
        engine.playRemoteShoot(uid, weaponId, start, end);
      },
      onDamagedByPeer: ({ damage }) => {
        engine.takeDamage(damage, 'enemy');
      },
      onPeerEmote: ({ uid, name, emoteId }) => {
        engine.triggerRemoteEmote(uid, name, emoteId);
      },
      onPeerGlooDeploy: ({ x, y, z, yaw }) => {
        engine.spawnGlooWallAt(x, y, z, yaw);
      },
      onPeerGrenadeThrow: ({ origin, vel }) => {
        engine.spawnGrenadeProjectile(origin, vel, false);
      },
      onMatchStart: ({ map, difficulty, enemyCount, mode }) => {
        engine.setPvpMode(mode === 'pvp');
        engine.startMatch({
          map,
          difficulty,
          enemyCount,
          outfit: hudRef.current.outfit,
          primaryWeapon: hudRef.current.weaponSlots[0].weaponId,
          secondaryWeapon: hudRef.current.weaponSlots[1].weaponId,
        });
      },
    });
    mpRef.current = mp;
    setOnlineRoom(mp.getSnapshot());
    mp.connect(engine.getLocalNetworkState());

    engine.setOnlineCallbacks({
      onShoot: (weaponId, start, end) => {
        mp.sendShoot(weaponId, start, end);
      },
      onHitRemotePlayer: (targetUid, damage) => {
        mp.sendHitPeer(targetUid, damage);
      },
      onDeployGlooWall: (x, y, z, yaw) => {
        mp.sendGlooDeploy(x, y, z, yaw);
      },
      onThrowGrenade: (origin, vel) => {
        mp.sendGrenadeThrow(origin, vel);
      },
    });

    const syncInterval = window.setInterval(() => {
      mp.sendState(engine.getLocalNetworkState());
    }, 55);

    return () => {
      window.clearInterval(syncInterval);
      mp.dispose();
      mpRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setLookSensitivity(settings.lookSensitivity);
    tacticalAudio.setVolumes(settings.masterVolume, settings.sfxVolume, settings.uiVolume);
  }, [settings]);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota restrictions
    }
  }, []);

  const handleStartMatch = useCallback((config: MatchConfig) => {
    engineRef.current?.startMatch(config);
    engineRef.current?.tryPointerLock();
    mpRef.current?.broadcastMatchStart(config.map, config.difficulty, config.enemyCount);
  }, []);

  const handleReload = useCallback(() => {
    engineRef.current?.requestReload();
  }, []);

  const handleToggleCamera = useCallback(() => {
    engineRef.current?.toggleCameraMode();
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      tacticalAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleLockPointer = useCallback(() => {
    engineRef.current?.tryPointerLock();
  }, []);

  const handleVirtualJoystick = useCallback((x: number, y: number) => {
    engineRef.current?.setVirtualJoystick(x, y);
  }, []);

  const handleTouchFire = useCallback((firing: boolean) => {
    engineRef.current?.setTouchFiring(firing);
  }, []);

  const handleTouchLook = useCallback((dx: number, dy: number) => {
    engineRef.current?.rotateLook(dx, dy);
  }, []);

  const handleSelectOutfit = useCallback((outfit: OutfitId) => {
    engineRef.current?.setOutfit(outfit);
  }, []);

  const handleSelectMap = useCallback((map: MapId) => {
    engineRef.current?.setMap(map);
    mpRef.current?.setRoomMap(map);
  }, []);

  const handleUseMedkit = useCallback(() => {
    engineRef.current?.useMedkit();
  }, []);

  const handleJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  const handleToggleCrouch = useCallback(() => {
    engineRef.current?.toggleCrouch();
  }, []);

  const handleToggleSprint = useCallback(() => {
    engineRef.current?.toggleSprint();
  }, []);

  const handleTriggerDash = useCallback(() => {
    engineRef.current?.triggerDash();
  }, []);

  const handleDeployGlooWall = useCallback(() => {
    engineRef.current?.deployGlooWall();
  }, []);

  const handleThrowGrenade = useCallback(() => {
    engineRef.current?.throwGrenade();
  }, []);

  const handleSetGraphicsQuality = useCallback((quality: GraphicsQuality) => {
    engineRef.current?.setGraphicsQuality(quality);
  }, []);

  const handleTriggerEmote = useCallback((emoteId: EmoteId) => {
    engineRef.current?.triggerEmote(emoteId);
    mpRef.current?.sendEmote(emoteId);
  }, []);

  const handleSetLobbyWeapons = useCallback((primary: WeaponId, secondary: WeaponId) => {
    engineRef.current?.setLobbyWeapons(primary, secondary);
  }, []);

  const handleSwitchWeapon = useCallback((slot?: 0 | 1) => {
    engineRef.current?.switchWeaponSlot(slot);
  }, []);

  const handlePickupWeapon = useCallback(() => {
    engineRef.current?.pickupNearbyWeapon();
  }, []);

  const handleReturnToLobby = useCallback(() => {
    engineRef.current?.returnToLobby();
    mpRef.current?.sendReturnToLobby();
  }, []);

  const handleJoinRoom = useCallback((uid: string) => {
    mpRef.current?.joinRoomByUid(uid);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    mpRef.current?.leaveToOwnRoom();
  }, []);

  const handleSetPlayerName = useCallback((name: string) => {
    mpRef.current?.setName(name);
  }, []);

  const handleSetOnlineMode = useCallback((mode: OnlineMode) => {
    mpRef.current?.setMode(mode);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0f14]">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasContainerRef} className="h-full w-full" />

      {/* Graceful WebGL Context Loss Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0b0f14]/95 p-6 text-center">
          <div className="max-w-sm rounded-xl border border-white/15 bg-[#0f1620] p-6">
            <h2 className="font-display text-xl font-bold text-white">
              Graphics Context Paused
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              WebGL rendering was temporarily interrupted by your browser. Reload to resume the
              battleground.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Reload Arena
            </button>
          </div>
        </div>
      )}

      {/* Semantic HUD Overlay */}
      <TacticalHud
        hud={hud}
        muted={muted}
        settings={settings}
        onlineRoom={onlineRoom}
        onUpdateSettings={handleUpdateSettings}
        onStartMatch={handleStartMatch}
        onReload={handleReload}
        onToggleCamera={handleToggleCamera}
        onToggleMute={handleToggleMute}
        onLockPointer={handleLockPointer}
        onVirtualJoystick={handleVirtualJoystick}
        onTouchFire={handleTouchFire}
        onTouchLook={handleTouchLook}
        onSelectOutfit={handleSelectOutfit}
        onSelectMap={handleSelectMap}
        onUseMedkit={handleUseMedkit}
        onJump={handleJump}
        onToggleCrouch={handleToggleCrouch}
        onToggleSprint={handleToggleSprint}
        onTriggerDash={handleTriggerDash}
        onDeployGlooWall={handleDeployGlooWall}
        onThrowGrenade={handleThrowGrenade}
        onSetGraphicsQuality={handleSetGraphicsQuality}
        onTriggerEmote={handleTriggerEmote}
        onSetLobbyWeapons={handleSetLobbyWeapons}
        onSwitchWeapon={handleSwitchWeapon}
        onPickupWeapon={handlePickupWeapon}
        onReturnToLobby={handleReturnToLobby}
        onJoinRoom={handleJoinRoom}
        onLeaveRoom={handleLeaveRoom}
        onSetPlayerName={handleSetPlayerName}
        onSetOnlineMode={handleSetOnlineMode}
      />
    </main>
  );
}
