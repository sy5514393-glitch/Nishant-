export type GameStatus = 'menu' | 'playing' | 'dead' | 'victory';

export type CameraMode = 'third-person' | 'over-shoulder';

export type Difficulty = 'standard' | 'veteran';

export type MapId = 'realistic' | 'nextera' | 'compound';

export interface MapOption {
  id: MapId;
  name: string;
  subtitle: string;
  accentHex: string;
}

export const MAP_CATALOG: MapOption[] = [
  {
    id: 'realistic',
    name: 'Realistic Valley',
    subtitle: 'Military Outpost · Roads & Forest',
    accentHex: '#22c55e',
  },
  {
    id: 'nextera',
    name: 'Nextera',
    subtitle: 'Futuristic Tech-Island · Energy Core',
    accentHex: '#06b6d4',
  },
  {
    id: 'compound',
    name: 'Compound',
    subtitle: 'Woodland Outpost · Timber & Concrete',
    accentHex: '#f59e0b',
  },
];

export type OutfitId =
  | 'tactical-camo'
  | 'desert-pmc'
  | 'urban-swat'
  | 'ghillie-recon'
  | 'arctic-winter'
  | 'crimson-mercenary';

export interface OutfitOption {
  id: OutfitId;
  name: string;
  gearLabel: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
}

export const OUTFIT_CATALOG: OutfitOption[] = [
  {
    id: 'tactical-camo',
    name: 'Woodland Spec-Ops',
    gearLabel: 'Camo Jacket · FAST Helmet',
    primaryHex: '#3e4f34',
    secondaryHex: '#252b22',
    accentHex: '#d97706',
  },
  {
    id: 'desert-pmc',
    name: 'Desert Contractor',
    gearLabel: 'Tan Shirt · Tactical Cap',
    primaryHex: '#b89f78',
    secondaryHex: '#5c4d3c',
    accentHex: '#38bdf8',
  },
  {
    id: 'urban-swat',
    name: 'Night Strike SWAT',
    gearLabel: 'Ripstop Suit · Riot Visor',
    primaryHex: '#1f242c',
    secondaryHex: '#0f1318',
    accentHex: '#60a5fa',
  },
  {
    id: 'ghillie-recon',
    name: 'Ghillie Recon',
    gearLabel: 'Moss Mantle · Draped Hood',
    primaryHex: '#465836',
    secondaryHex: '#2c3a24',
    accentHex: '#84cc16',
  },
  {
    id: 'arctic-winter',
    name: 'Arctic Alpine',
    gearLabel: 'Insulated Parka · Goggles',
    primaryHex: '#d8dee6',
    secondaryHex: '#475569',
    accentHex: '#0ea5e9',
  },
  {
    id: 'crimson-mercenary',
    name: 'Crimson Jacket',
    gearLabel: 'Leather Bomber · Knit Beanie',
    primaryHex: '#7f2323',
    secondaryHex: '#1e2024',
    accentHex: '#fbbf24',
  },
];

export type WeaponId = 'carbine' | 'smg' | 'shotgun' | 'sniper' | 'pistol';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  category: string;
  damage: number;
  pellets: number;
  spread: number;
  fireRate: number;
  magSize: number;
  startReserve: number;
  reloadTime: number;
  range: number;
  recoil: number;
  accentHex: string;
}

export const WEAPON_CATALOG: WeaponSpec[] = [
  {
    id: 'carbine',
    name: 'M4A1 Carbine',
    shortName: 'M4A1',
    category: 'Assault Rifle',
    damage: 25,
    pellets: 1,
    spread: 0.008,
    fireRate: 0.135,
    magSize: 30,
    startReserve: 90,
    reloadTime: 1.05,
    range: 105,
    recoil: 0.012,
    accentHex: '#f59e0b',
  },
  {
    id: 'smg',
    name: 'Vector-9 SMG',
    shortName: 'Vector-9',
    category: 'SMG',
    damage: 16,
    pellets: 1,
    spread: 0.022,
    fireRate: 0.075,
    magSize: 36,
    startReserve: 108,
    reloadTime: 0.85,
    range: 72,
    recoil: 0.008,
    accentHex: '#38bdf8',
  },
  {
    id: 'shotgun',
    name: 'M870 Tactical',
    shortName: 'M870',
    category: 'Shotgun',
    damage: 15,
    pellets: 6,
    spread: 0.068,
    fireRate: 0.62,
    magSize: 8,
    startReserve: 32,
    reloadTime: 1.25,
    range: 42,
    recoil: 0.032,
    accentHex: '#ef4444',
  },
  {
    id: 'sniper',
    name: 'AWM Marksman',
    shortName: 'AWM',
    category: 'Sniper',
    damage: 78,
    pellets: 1,
    spread: 0.0015,
    fireRate: 0.95,
    magSize: 6,
    startReserve: 24,
    reloadTime: 1.4,
    range: 155,
    recoil: 0.042,
    accentHex: '#a855f7',
  },
  {
    id: 'pistol',
    name: 'USP Tactical',
    shortName: 'USP-45',
    category: 'Sidearm',
    damage: 21,
    pellets: 1,
    spread: 0.012,
    fireRate: 0.19,
    magSize: 15,
    startReserve: 60,
    reloadTime: 0.78,
    range: 78,
    recoil: 0.01,
    accentHex: '#10b981',
  },
];

export const WEAPON_BY_ID: Record<WeaponId, WeaponSpec> = WEAPON_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<WeaponId, WeaponSpec>,
);

export interface WeaponSlotSnapshot {
  weaponId: WeaponId;
  ammo: number;
  magSize: number;
  reserveAmmo: number;
}

export interface NearbyWeaponDrop {
  dropId: number;
  weaponId: WeaponId;
  ammo: number;
  reserveAmmo: number;
}

export interface MinimapEntity {
  x: number;
  z: number;
  kind: 'enemy' | 'ally' | 'ammo' | 'medkit' | 'weapon';
  firing?: boolean;
}

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  isPlayerKill: boolean;
  isZone: boolean;
  timestamp: number;
}

export type EmoteId = 'wave' | 'dance' | 'salute' | 'victory-cheer' | 'taunt';

export interface EmoteOption {
  id: EmoteId;
  name: string;
  hotkey: string;
  duration: number;
  actionLabel: string;
}

export const EMOTE_CATALOG: EmoteOption[] = [
  { id: 'wave', name: 'Wave', hotkey: '1', duration: 2.6, actionLabel: 'waved' },
  { id: 'dance', name: 'Victory Dance', hotkey: '2', duration: 3.6, actionLabel: 'started dancing' },
  { id: 'salute', name: 'Salute', hotkey: '3', duration: 2.4, actionLabel: 'saluted' },
  { id: 'victory-cheer', name: 'Cheer', hotkey: '4', duration: 2.8, actionLabel: 'cheered' },
  { id: 'taunt', name: 'Battle Ready', hotkey: '5', duration: 2.5, actionLabel: 'signaled ready' },
];

export interface EmoteFeedEntry {
  id: number;
  actor: string;
  text: string;
  isPlayer: boolean;
}

export type GraphicsQuality = 'smooth' | 'hd' | 'ultra';

export type CustomHudItemId =
  | 'joystick'
  | 'fire'
  | 'health'
  | 'reload'
  | 'jump'
  | 'crouch'
  | 'glooWall'
  | 'grenade'
  | 'dash'
  | 'minimap';

export interface HudButtonLayout {
  xPct: number; // 0..100 horizontal percentage
  yPct: number; // 0..100 vertical percentage
  scale: number; // 0.7..1.4
  opacity: number; // 0.45..1
}

export type CustomHudConfig = Record<CustomHudItemId, HudButtonLayout>;

export const DEFAULT_CUSTOM_HUD: CustomHudConfig = {
  joystick: { xPct: 11, yPct: 77, scale: 1, opacity: 0.95 },
  fire: { xPct: 89, yPct: 77, scale: 1.05, opacity: 0.95 },
  health: { xPct: 76, yPct: 81, scale: 1, opacity: 0.95 },
  reload: { xPct: 79, yPct: 62, scale: 0.95, opacity: 0.92 },
  jump: { xPct: 91, yPct: 54, scale: 0.95, opacity: 0.92 },
  crouch: { xPct: 66, yPct: 83, scale: 0.95, opacity: 0.92 },
  glooWall: { xPct: 67, yPct: 66, scale: 0.95, opacity: 0.94 },
  grenade: { xPct: 77, yPct: 45, scale: 0.95, opacity: 0.94 },
  dash: { xPct: 23, yPct: 82, scale: 0.95, opacity: 0.94 },
  minimap: { xPct: 10, yPct: 16, scale: 1, opacity: 0.95 },
};

export interface HudSnapshot {
  status: GameStatus;
  health: number;
  maxHealth: number;
  medkits: number;
  glooWalls: number;
  grenades: number;
  dashCooldown: number;
  isDashing: boolean;
  ammo: number;
  magSize: number;
  reserveAmmo: number;
  weaponSlots: [WeaponSlotSnapshot, WeaponSlotSnapshot];
  activeWeaponSlot: 0 | 1;
  nearbyWeaponDrop: NearbyWeaponDrop | null;
  isReloading: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  graphicsQuality: GraphicsQuality;
  kills: number;
  aliveCount: number;
  totalCombatants: number;
  rank: number;
  survivalSeconds: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  zoneRadius: number;
  maxZoneRadius: number;
  zoneCenterX: number;
  zoneCenterZ: number;
  zoneTimer: number;
  zoneDamagePerSec: number;
  isOutsideZone: boolean;
  distanceToZoneCenter: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  cameraMode: CameraMode;
  pointerLocked: boolean;
  hitMarkerAge: number;
  hitMarkerKill: boolean;
  damageFlashAge: number;
  minimapEntities: MinimapEntity[];
  killFeed: KillFeedEntry[];
  endReason: string;
  outfit: OutfitId;
  map: MapId;
  activeEmote: EmoteId | null;
  emoteFeed: EmoteFeedEntry[];
}

export interface MatchConfig {
  enemyCount: number;
  difficulty: Difficulty;
  outfit: OutfitId;
  map: MapId;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
}

export type OnlineMode = 'coop' | 'pvp';

export interface OnlinePlayerState {
  uid: string;
  name: string;
  outfit: OutfitId;
  weaponId: WeaponId;
  backWeaponId: WeaponId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  isCrouching: boolean;
  isSprinting: boolean;
  health: number;
  alive: boolean;
  activeEmote: EmoteId | null;
  kills: number;
  status: string;
}

export interface OnlineRoomSnapshot {
  connected: boolean;
  myUid: string;
  myName: string;
  roomUid: string;
  hostUid: string;
  isHost: boolean;
  mode: OnlineMode;
  map: MapId;
  matchActive: boolean;
  players: OnlinePlayerState[];
}

export interface GameSettings {
  lookSensitivity: number;
  masterVolume: number;
  sfxVolume: number;
  uiVolume: number;
  showDamageIndicators: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  lookSensitivity: 1.0,
  masterVolume: 0.85,
  sfxVolume: 0.9,
  uiVolume: 0.85,
  showDamageIndicators: true,
};
