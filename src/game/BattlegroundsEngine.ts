import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { tacticalAudio } from './audio';
import {
  applyOperatorEmotePose,
  attachOperatorWeapons,
  buildBattlegroundEnvironment,
  createGlooWallModel,
  createGrenadeModel,
  createOperatorModel,
  createPickupModel,
  createWeaponDropModel,
  groundHeightAt,
  ObstacleBox,
  OperatorRig,
  resetOperatorCombatPose,
} from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  CameraMode,
  EMOTE_CATALOG,
  EmoteFeedEntry,
  EmoteId,
  GameStatus,
  GraphicsQuality,
  HudSnapshot,
  KillFeedEntry,
  MapId,
  MatchConfig,
  MinimapEntity,
  NearbyWeaponDrop,
  OUTFIT_CATALOG,
  OnlinePlayerState,
  OutfitId,
  WEAPON_BY_ID,
  WEAPON_CATALOG,
  WeaponId,
} from './types';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

const MAX_ZONE_RADIUS = 72;
const MIN_ZONE_RADIUS = 8;
const ZONE_SHRINK_TIME = 60; // SafeZone.cs shrinkTime = 60f
const ZONE_DAMAGE_PER_SEC = 5; // SafeZone.cs damagePerSecond = 5f
const PLAYER_SPEED = 6; // PlayerController.cs speed = 6f
const RIFLE_DAMAGE = 25; // PlayerController.cs TakeDamage(25)
const RIFLE_RANGE = 100; // PlayerController.cs raycast 100f
const MAG_SIZE = 30; // PlayerController.cs ammo = 30
const ARENA_BOUND = 80;

const BOT_CALLSIGNS = [
  'Viper-04',
  'Kestrel',
  'Nomad-7',
  'Rook',
  'Spectre',
  'Talon-2',
  'Jackal',
  'Banshee',
  'Warden',
  'Cinder',
  'Onyx-9',
  'Falcon',
];

interface EnemyEntity {
  id: number;
  name: string;
  weaponId: WeaponId;
  rig: OperatorRig;
  hitProxy: THREE.Mesh;
  health: number;
  maxHealth: number;
  alive: boolean;
  yaw: number;
  walkPhase: number;
  fireCooldown: number;
  muzzleTimer: number;
  hitFlashTimer: number;
  patrolTarget: THREE.Vector3;
  strafeSign: number;
  strafeTimer: number;
  firingVisualTimer: number;
  emoteId: EmoteId | null;
  emoteTimer: number;
  emoteElapsed: number;
}

interface LobbyBotEntity {
  name: string;
  rig: OperatorRig;
  baseYaw: number;
  emoteId: EmoteId | null;
  emoteDelay: number;
  emoteTimer: number;
  emoteElapsed: number;
  pendingReplyName: string | null;
}

interface TracerEffect {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface SparkEffect {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  isShell?: boolean;
}

interface PickupEntity {
  id: number;
  kind: 'ammo' | 'medkit';
  mesh: THREE.Group;
  active: boolean;
  bobPhase: number;
  baseY: number;
}

interface WeaponSlotState {
  weaponId: WeaponId;
  ammo: number;
  reserveAmmo: number;
}

interface WeaponDropEntity {
  id: number;
  weaponId: WeaponId;
  ammo: number;
  reserveAmmo: number;
  mesh: THREE.Group;
  active: boolean;
  bobPhase: number;
  baseY: number;
}

interface RemotePlayerEntity {
  uid: string;
  state: OnlinePlayerState;
  rig: OperatorRig;
  hitProxy: THREE.Mesh;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  targetYaw: number;
  walkPhase: number;
  emoteElapsed: number;
  muzzleTimer: number;
  hitFlashTimer: number;
}

export interface OnlineCallbacks {
  onShoot?: (
    weaponId: WeaponId,
    start: [number, number, number],
    end: [number, number, number],
  ) => void;
  onHitRemotePlayer?: (targetUid: string, damage: number) => void;
  onDeployGlooWall?: (x: number, y: number, z: number, yaw: number) => void;
  onThrowGrenade?: (origin: [number, number, number], vel: [number, number, number]) => void;
}

interface GlooWallEntity {
  id: number;
  group: THREE.Group;
  colliderMeshes: THREE.Mesh[];
  obstacle: ObstacleBox;
  hp: number;
  maxHp: number;
  life: number;
}

interface ActiveGrenadeEntity {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  isLocal: boolean;
}

interface ExplosionEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class BattlegroundsEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onContextLost?: (lost: boolean) => void;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: ProceduralTextureSet;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private obstacles: ObstacleBox[] = [];
  private raycastBlockers: THREE.Object3D[] = [];
  private worldGroup: THREE.Group | null = null;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private playerRig!: OperatorRig;
  private safeZoneWall!: THREE.Mesh;
  private safeZoneRing!: THREE.Mesh;
  private nextZoneRing!: THREE.Mesh;

  private enemies: EnemyEntity[] = [];
  private lobbyBots: LobbyBotEntity[] = [];
  private remotePlayers = new Map<string, RemotePlayerEntity>();
  private remoteHitProxies: THREE.Object3D[] = [];
  private pvpMode = false;
  private onlineCallbacks: OnlineCallbacks = {};
  private enemyHitProxies: THREE.Object3D[] = [];
  private tracers: TracerEffect[] = [];
  private sparks: SparkEffect[] = [];
  private pickups: PickupEntity[] = [];
  private weaponDrops: WeaponDropEntity[] = [];
  private glooWallEntities: GlooWallEntity[] = [];
  private activeGrenades: ActiveGrenadeEntity[] = [];
  private explosions: ExplosionEffect[] = [];
  private nextGlooId = 1;
  private nextPickupId = 1;
  private nextWeaponDropId = 1;
  private nextKillFeedId = 1;
  private nextEmoteFeedId = 1;

  // Match & player state
  private status: GameStatus = 'menu';
  private matchConfig: MatchConfig = {
    enemyCount: 9,
    difficulty: 'standard',
    outfit: 'tactical-camo',
    map: 'realistic',
    primaryWeapon: 'carbine',
    secondaryWeapon: 'smg',
  };
  private health = 100;
  private maxHealth = 100;
  private medkits = 2;
  private glooWalls = 3;
  private grenades = 3;
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashDir = new THREE.Vector2(0, 1);
  private weaponSlots: [WeaponSlotState, WeaponSlotState] = [
    {
      weaponId: 'carbine',
      ammo: WEAPON_BY_ID.carbine.magSize,
      reserveAmmo: WEAPON_BY_ID.carbine.startReserve,
    },
    {
      weaponId: 'smg',
      ammo: WEAPON_BY_ID.smg.magSize,
      reserveAmmo: WEAPON_BY_ID.smg.startReserve,
    },
  ];
  private activeWeaponSlot: 0 | 1 = 0;
  private nearbyWeaponDrop: NearbyWeaponDrop | null = null;
  private isReloading = false;
  private reloadTimer = 0;
  private kills = 0;
  private damageDealt = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private survivalSeconds = 0;
  private rank = 1;
  private endReason = '';
  private killFeed: KillFeedEntry[] = [];
  private activeEmote: EmoteId | null = null;
  private emoteTimer = 0;
  private emoteElapsed = 0;
  private emoteFeed: EmoteFeedEntry[] = [];

  // Safe zone state
  private zoneRadius = MAX_ZONE_RADIUS;
  private zoneElapsed = 0;
  private zoneCenter = new THREE.Vector2(0, 0);
  private zoneDamageAccum = 0;
  private isOutsideZone = false;

  // Player kinematics & camera
  private playerPos = new THREE.Vector3(0, 0, 12);
  private playerVelY = 0;
  private isGrounded = true;
  private isCrouching = false;
  private isSprinting = false;
  private sprintLocked = false;
  private graphicsQuality: GraphicsQuality = 'hd';
  private lookSensitivity = 1.0;
  private playerYaw = Math.PI;
  private cameraPitch = 0.22;
  private cameraMode: CameraMode = 'third-person';
  private walkPhase = 0;
  private fireCooldown = 0;
  private playerMuzzleTimer = 0;
  private recoilKick = 0;
  private hitMarkerAge = 99;
  private hitMarkerKill = false;
  private damageFlashAge = 99;

  // Input state
  private keys: Record<string, boolean> = {};
  private pointerLocked = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private isTouchFiring = false;
  private isMouseFiring = false;

  // Loop & lifecycle
  private frameId = 0;
  private lastTime = 0;
  private hudSyncAccum = 0;
  private disposed = false;

  // Shared tracer/spark resources
  private sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  private shellGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.055, 6);
  private shellMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.25,
    metalness: 0.9,
  });
  private enemyProxyGeo = new THREE.BoxGeometry(0.95, 1.9, 0.95);
  private enemyProxyMat = new THREE.MeshBasicMaterial({ visible: false });

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onContextLost?: (lost: boolean) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onContextLost = onContextLost;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.initRendererAndScene();
    this.bindEvents();
    this.setupInitialMenuView();
    this.startLoop();
  }

  private initRendererAndScene(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0xb0b8ba);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.FogExp2(0xb0b8ba, 0.0072);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.15, 290);

    // Studio IBL environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // 3-Point Outdoor Lighting Rig (adjusted dynamically per map)
    this.hemiLight = new THREE.HemisphereLight(0xcbe1f7, 0x4c4838, 0.78);
    this.hemiLight.position.set(0, 60, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffe7c2, 2.05);
    this.sunLight.position.set(52, 68, 38);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 190;
    const d = 68;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.52);
    this.rimLight.position.set(-42, 28, -48);
    this.scene.add(this.rimLight);

    // Procedural Textures & Realistic Arena (Nextera default)
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.rebuildMapEnvironment(this.matchConfig.map);

    // Player Rig with initial outfit & 2-gun loadout
    this.playerRig = createOperatorModel(
      true,
      this.textures.contactShadow,
      this.textures,
      this.matchConfig.outfit,
    );
    this.syncPlayerWeaponModels();
    this.scene.add(this.playerRig.root);

    // Safe Zone Cylinder Wall + Ground Ring
    const wallGeo = new THREE.CylinderGeometry(1, 1, 38, 64, 1, true);
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.safeZoneWall = new THREE.Mesh(wallGeo, wallMat);
    this.safeZoneWall.position.y = 19;
    this.scene.add(this.safeZoneWall);

    const ringGeo = new THREE.RingGeometry(0.985, 1.015, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.safeZoneRing = new THREE.Mesh(ringGeo, ringMat);
    this.safeZoneRing.rotation.x = -Math.PI / 2;
    this.safeZoneRing.position.y = 0.14;
    this.scene.add(this.safeZoneRing);

    const nextGeo = new THREE.RingGeometry(0.99, 1.01, 64);
    const nextMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.nextZoneRing = new THREE.Mesh(nextGeo, nextMat);
    this.nextZoneRing.rotation.x = -Math.PI / 2;
    this.nextZoneRing.position.y = 0.13;
    this.scene.add(this.nextZoneRing);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private setupInitialMenuView(): void {
    this.playerPos.set(0, groundHeightAt(0, 6), 6);
    this.playerYaw = 0.25;
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.spawnLobbyBots();
    this.updateZoneVisuals();
    this.spawnInitialPickups();
    this.emitHud();
  }

  private spawnLobbyBots(): void {
    this.clearLobbyBots();
    const spots: Array<{ x: number; z: number; outfit: OutfitId; name: string }> = [
      { x: 2.3, z: 3.9, outfit: 'desert-pmc', name: 'Kestrel' },
      { x: -1.5, z: 2.7, outfit: 'urban-swat', name: 'Viper-04' },
      { x: 3.4, z: 6.4, outfit: 'ghillie-recon', name: 'Nomad-7' },
      { x: 1.4, z: 8.6, outfit: 'crimson-mercenary', name: 'Talon-2' },
    ];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const sy = groundHeightAt(s.x, s.z);
      const rig = createOperatorModel(false, this.textures.contactShadow, this.textures, s.outfit);
      const lobbyGun = WEAPON_CATALOG[(i + 1) % WEAPON_CATALOG.length].id;
      attachOperatorWeapons(rig, lobbyGun, null);
      rig.root.position.set(s.x, sy, s.z);
      const baseYaw = Math.atan2(this.playerPos.x - s.x, this.playerPos.z - s.z);
      rig.root.rotation.y = baseYaw;
      this.scene.add(rig.root);
      this.lobbyBots.push({
        name: s.name,
        rig,
        baseYaw,
        emoteId: null,
        emoteDelay: 0,
        emoteTimer: 0,
        emoteElapsed: 0,
        pendingReplyName: null,
      });
    }
  }

  private clearLobbyBots(): void {
    for (const b of this.lobbyBots) {
      this.scene.remove(b.rig.root);
    }
    this.lobbyBots = [];
  }

  private rebuildMapEnvironment(mapId: MapId): void {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup = null;
    }
    this.raycastBlockers = [];

    const isNextera = mapId === 'nextera';
    const isRealistic = mapId === 'realistic';
    const skyTint = isNextera ? 0x1a334d : isRealistic ? 0xbfd4e6 : 0xb0b8ba;
    this.scene.background = new THREE.Color(skyTint);
    this.scene.fog = new THREE.FogExp2(skyTint, isNextera ? 0.0058 : isRealistic ? 0.0046 : 0.0072);

    this.hemiLight.color.setHex(isNextera ? 0x7dd3fc : isRealistic ? 0xdbeafe : 0xcbe1f7);
    this.hemiLight.groundColor.setHex(isNextera ? 0x1e293b : isRealistic ? 0x4c5838 : 0x4c4838);
    this.hemiLight.intensity = isNextera ? 0.88 : isRealistic ? 0.96 : 0.78;
    this.sunLight.color.setHex(isNextera ? 0xe0f2fe : isRealistic ? 0xfff3d6 : 0xffe7c2);
    this.sunLight.intensity = isNextera ? 1.85 : isRealistic ? 2.2 : 2.05;
    this.rimLight.color.setHex(isNextera ? 0x22d3ee : isRealistic ? 0xa5f3fc : 0x93c5fd);
    this.rimLight.intensity = isNextera ? 0.8 : isRealistic ? 0.55 : 0.52;

    const built = buildBattlegroundEnvironment(
      this.scene,
      this.textures,
      this.raycastBlockers,
      mapId,
    );
    this.worldGroup = built.worldGroup;
    this.obstacles = built.obstacles;
  }

  public setMap(mapId: MapId): void {
    if (this.matchConfig.map === mapId) return;
    this.matchConfig = { ...this.matchConfig, map: mapId };
    this.rebuildMapEnvironment(mapId);
    this.emitHud();
  }

  public setOnlineCallbacks(callbacks: OnlineCallbacks): void {
    this.onlineCallbacks = callbacks;
  }

  public setPvpMode(enabled: boolean): void {
    this.pvpMode = enabled;
    this.emitHud();
  }

  public getLocalNetworkState() {
    const activeSlot = this.weaponSlots[this.activeWeaponSlot];
    const backSlot = this.weaponSlots[this.activeWeaponSlot === 0 ? 1 : 0];
    return {
      outfit: this.matchConfig.outfit,
      weaponId: activeSlot.weaponId,
      backWeaponId: backSlot.weaponId,
      x: this.playerPos.x,
      y: this.playerPos.y,
      z: this.playerPos.z,
      yaw: this.playerYaw,
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      health: Math.ceil(this.health),
      alive: this.status === 'playing' || this.status === 'menu',
      activeEmote: this.activeEmote,
      kills: this.kills,
      status: this.status,
    };
  }

  private upsertRemotePlayer(p: OnlinePlayerState): void {
    let entity = this.remotePlayers.get(p.uid);
    if (!entity) {
      const rig = createOperatorModel(false, this.textures.contactShadow, this.textures, p.outfit);
      attachOperatorWeapons(rig, p.weaponId, p.backWeaponId);
      const startPos = new THREE.Vector3(p.x, p.y, p.z);
      rig.root.position.copy(startPos);
      rig.root.rotation.y = p.yaw;
      this.scene.add(rig.root);

      const hitProxy = new THREE.Mesh(this.enemyProxyGeo, this.enemyProxyMat);
      hitProxy.position.set(p.x, p.y + 0.95, p.z);
      hitProxy.userData.remoteUid = p.uid;
      this.scene.add(hitProxy);
      this.remoteHitProxies.push(hitProxy);

      entity = {
        uid: p.uid,
        state: p,
        rig,
        hitProxy,
        currentPos: startPos.clone(),
        targetPos: startPos.clone(),
        targetYaw: p.yaw,
        walkPhase: 0,
        emoteElapsed: 0,
        muzzleTimer: 0,
        hitFlashTimer: 0,
      };
      this.remotePlayers.set(p.uid, entity);
      return;
    }

    const outfitChanged = entity.state.outfit !== p.outfit;
    const weaponChanged =
      entity.state.weaponId !== p.weaponId || entity.state.backWeaponId !== p.backWeaponId;

    if (outfitChanged) {
      this.scene.remove(entity.rig.root);
      entity.rig = createOperatorModel(false, this.textures.contactShadow, this.textures, p.outfit);
      attachOperatorWeapons(entity.rig, p.weaponId, p.backWeaponId);
      entity.rig.root.position.copy(entity.currentPos);
      entity.rig.root.rotation.y = entity.targetYaw;
      this.scene.add(entity.rig.root);
    } else if (weaponChanged) {
      attachOperatorWeapons(entity.rig, p.weaponId, p.backWeaponId);
    }

    if (entity.state.activeEmote && !p.activeEmote) {
      resetOperatorCombatPose(entity.rig);
    }
    if (!entity.state.activeEmote && p.activeEmote) {
      entity.emoteElapsed = 0;
    }

    entity.state = p;
    entity.targetPos.set(p.x, p.y, p.z);
    entity.targetYaw = p.yaw;
  }

  public syncRemotePlayers(players: OnlinePlayerState[], myUid: string): void {
    const incomingUids = new Set<string>();
    for (const p of players) {
      if (!p.uid || p.uid === myUid) continue;
      incomingUids.add(p.uid);
      this.upsertRemotePlayer(p);
    }

    for (const [uid, entity] of this.remotePlayers.entries()) {
      if (!incomingUids.has(uid)) {
        this.scene.remove(entity.rig.root);
        this.scene.remove(entity.hitProxy);
        const idx = this.remoteHitProxies.indexOf(entity.hitProxy);
        if (idx !== -1) this.remoteHitProxies.splice(idx, 1);
        this.remotePlayers.delete(uid);
      }
    }
    this.emitHud();
  }

  public applyRemoteDelta(p: OnlinePlayerState, myUid: string): void {
    if (!p.uid || p.uid === myUid) return;
    this.upsertRemotePlayer(p);
  }

  public playRemoteShoot(
    uid: string,
    weaponId: WeaponId,
    start: [number, number, number],
    end: [number, number, number],
  ): void {
    const entity = this.remotePlayers.get(uid);
    if (entity) {
      entity.muzzleTimer = 0.06;
      entity.rig.muzzleFlash.visible = true;
    }
    tacticalAudio.playGunshot(true, weaponId);
    _vecA.set(start[0], start[1], start[2]);
    _vecB.set(end[0], end[1], end[2]);
    this.spawnTracer(_vecA, _vecB, this.pvpMode ? 0xf87171 : 0x38bdf8);
  }

  public triggerRemoteEmote(uid: string, name: string, emoteId: EmoteId | null): void {
    const entity = this.remotePlayers.get(uid);
    if (entity) {
      entity.state = { ...entity.state, activeEmote: emoteId };
      entity.emoteElapsed = 0;
      if (!emoteId) {
        resetOperatorCombatPose(entity.rig);
      }
    }
    if (emoteId) {
      const spec = EMOTE_CATALOG.find((e) => e.id === emoteId);
      if (spec) {
        tacticalAudio.playEmote(emoteId);
        this.pushEmoteFeed(name, spec.actionLabel, false);
        this.emitHud();
      }
    }
  }

  private syncPlayerWeaponModels(): void {
    const active = this.weaponSlots[this.activeWeaponSlot].weaponId;
    const back = this.weaponSlots[this.activeWeaponSlot === 0 ? 1 : 0].weaponId;
    attachOperatorWeapons(this.playerRig, active, back);
  }

  public setLobbyWeapons(primary: WeaponId, secondary: WeaponId): void {
    this.matchConfig = { ...this.matchConfig, primaryWeapon: primary, secondaryWeapon: secondary };
    this.weaponSlots = [
      {
        weaponId: primary,
        ammo: WEAPON_BY_ID[primary].magSize,
        reserveAmmo: WEAPON_BY_ID[primary].startReserve,
      },
      {
        weaponId: secondary,
        ammo: WEAPON_BY_ID[secondary].magSize,
        reserveAmmo: WEAPON_BY_ID[secondary].startReserve,
      },
    ];
    this.activeWeaponSlot = 0;
    this.syncPlayerWeaponModels();
    this.emitHud();
  }

  public switchWeaponSlot(slot?: 0 | 1): void {
    if (this.status !== 'playing' && this.status !== 'menu') return;
    const nextSlot: 0 | 1 = slot !== undefined ? slot : this.activeWeaponSlot === 0 ? 1 : 0;
    if (nextSlot === this.activeWeaponSlot) return;

    this.activeWeaponSlot = nextSlot;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0.14;
    this.playerMuzzleTimer = 0;
    this.syncPlayerWeaponModels();
    tacticalAudio.playWeaponSwap();
    this.emitHud();
  }

  public setOutfit(outfitId: OutfitId): void {
    if (this.matchConfig.outfit === outfitId) return;
    this.matchConfig = { ...this.matchConfig, outfit: outfitId };

    // Swap live 3D operator rig with newly chosen outfit
    this.scene.remove(this.playerRig.root);
    this.playerRig = createOperatorModel(
      true,
      this.textures.contactShadow,
      this.textures,
      outfitId,
    );
    this.syncPlayerWeaponModels();
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.root);
    this.emitHud();
  }

  private pushEmoteFeed(actor: string, text: string, isPlayer: boolean): void {
    this.emoteFeed = [
      { id: this.nextEmoteFeedId++, actor, text, isPlayer },
      ...this.emoteFeed,
    ].slice(0, 4);
  }

  public triggerEmote(emoteId: EmoteId): void {
    if (this.status === 'dead' || this.status === 'victory') return;
    const spec = EMOTE_CATALOG.find((e) => e.id === emoteId);
    if (!spec) return;

    this.activeEmote = emoteId;
    this.emoteTimer = spec.duration;
    this.emoteElapsed = 0;
    tacticalAudio.playEmote(emoteId);
    this.pushEmoteFeed('You', spec.actionLabel, true);

    // Nearby AI combatants react in the Lobby or in-match
    if (this.status === 'menu') {
      this.lobbyBots.forEach((bot, idx) => {
        if (idx < 3) {
          const reply: EmoteId =
            emoteId === 'dance'
              ? 'dance'
              : emoteId === 'salute'
                ? 'salute'
                : idx % 2 === 0
                  ? 'wave'
                  : 'victory-cheer';
          bot.emoteId = reply;
          bot.emoteDelay = 0.28 + idx * 0.25;
          bot.emoteTimer = 2.6;
          bot.emoteElapsed = 0;
          bot.pendingReplyName =
            reply === 'dance'
              ? 'joined the dance'
              : reply === 'salute'
                ? 'saluted back'
                : reply === 'victory-cheer'
                  ? 'cheered'
                  : 'waved back';
        }
      });
    } else if (this.status === 'playing') {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(
          e.rig.root.position.x - this.playerPos.x,
          e.rig.root.position.z - this.playerPos.z,
        );
        if (dist < 22) {
          const reply: EmoteId = emoteId === 'dance' ? 'dance' : 'wave';
          e.emoteId = reply;
          e.emoteTimer = 1.9;
          e.emoteElapsed = 0;
          this.pushEmoteFeed(e.name, reply === 'dance' ? 'danced back' : 'waved back', false);
        }
      }
    }

    this.emitHud();
  }

  private cancelPlayerEmote(): void {
    if (!this.activeEmote) return;
    this.activeEmote = null;
    this.emoteTimer = 0;
    this.emoteElapsed = 0;
    resetOperatorCombatPose(this.playerRig);
    this.emitHud();
  }

  public returnToLobby(): void {
    this.releasePointerLock();
    this.clearDynamicEntities();
    this.cancelPlayerEmote();
    this.status = 'menu';
    this.emoteFeed = [];
    this.killFeed = [];
    this.nearbyWeaponDrop = null;
    this.activeWeaponSlot = 0;
    this.weaponSlots = [
      {
        weaponId: this.matchConfig.primaryWeapon,
        ammo: WEAPON_BY_ID[this.matchConfig.primaryWeapon].magSize,
        reserveAmmo: WEAPON_BY_ID[this.matchConfig.primaryWeapon].startReserve,
      },
      {
        weaponId: this.matchConfig.secondaryWeapon,
        ammo: WEAPON_BY_ID[this.matchConfig.secondaryWeapon].magSize,
        reserveAmmo: WEAPON_BY_ID[this.matchConfig.secondaryWeapon].startReserve,
      },
    ];
    this.syncPlayerWeaponModels();
    this.playerPos.set(0, groundHeightAt(0, 6), 6);
    this.playerYaw = 0.25;
    this.playerRig.root.visible = true;
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;
    resetOperatorCombatPose(this.playerRig);
    this.spawnLobbyBots();
    this.spawnInitialPickups();
    this.emitHud();
  }

  public startMatch(config?: MatchConfig): void {
    if (config) {
      if (config.map !== this.matchConfig.map) {
        this.setMap(config.map);
      }
      if (config.outfit !== this.matchConfig.outfit) {
        this.setOutfit(config.outfit);
      }
      this.matchConfig = config;
    }

    this.clearLobbyBots();
    this.clearDynamicEntities();
    this.cancelPlayerEmote();

    // Reset player stats & 2-Gun Loadout + Tactical Utilities
    this.status = 'playing';
    this.health = 100;
    this.maxHealth = 100;
    this.medkits = 2;
    this.glooWalls = 3;
    this.grenades = 3;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.weaponSlots = [
      {
        weaponId: this.matchConfig.primaryWeapon,
        ammo: WEAPON_BY_ID[this.matchConfig.primaryWeapon].magSize,
        reserveAmmo: WEAPON_BY_ID[this.matchConfig.primaryWeapon].startReserve,
      },
      {
        weaponId: this.matchConfig.secondaryWeapon,
        ammo: WEAPON_BY_ID[this.matchConfig.secondaryWeapon].magSize,
        reserveAmmo: WEAPON_BY_ID[this.matchConfig.secondaryWeapon].startReserve,
      },
    ];
    this.activeWeaponSlot = 0;
    this.nearbyWeaponDrop = null;
    this.syncPlayerWeaponModels();
    this.isReloading = false;
    this.reloadTimer = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.survivalSeconds = 0;
    this.rank = 1;
    this.endReason = '';
    this.killFeed = [];
    this.emoteFeed = [];
    this.recoilKick = 0;

    // Spawn player at south compound overlook
    this.playerPos.set(0, groundHeightAt(0, 24), 24);
    this.playerVelY = 0;
    this.isGrounded = true;
    this.isCrouching = false;
    this.isSprinting = false;
    this.sprintLocked = false;
    this.playerYaw = Math.PI;
    this.cameraPitch = 0.2;
    this.playerRig.root.visible = true;
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;

    // Reset SafeZone (SafeZone.cs)
    this.zoneRadius = MAX_ZONE_RADIUS;
    this.zoneElapsed = 0;
    this.zoneCenter.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    this.zoneDamageAccum = 0;
    this.isOutsideZone = false;
    this.updateZoneVisuals();

    this.spawnEnemies(this.matchConfig.enemyCount);
    this.spawnInitialPickups();
    this.emitHud();
  }

  private clearDynamicEntities(): void {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.rig.root);
      this.scene.remove(enemy.hitProxy);
    }
    this.enemies = [];
    this.enemyHitProxies = [];

    for (const pickup of this.pickups) {
      this.scene.remove(pickup.mesh);
    }
    this.pickups = [];

    for (const drop of this.weaponDrops) {
      this.scene.remove(drop.mesh);
    }
    this.weaponDrops = [];

    for (const gloo of this.glooWallEntities) {
      this.removeGlooWallEntity(gloo);
    }
    this.glooWallEntities = [];

    for (const g of this.activeGrenades) {
      this.scene.remove(g.mesh);
    }
    this.activeGrenades = [];

    for (const ex of this.explosions) {
      this.scene.remove(ex.mesh);
      ex.mesh.geometry.dispose();
      (ex.mesh.material as THREE.Material).dispose();
    }
    this.explosions = [];

    for (const tracer of this.tracers) {
      this.scene.remove(tracer.line);
      tracer.line.geometry.dispose();
    }
    this.tracers = [];

    for (const spark of this.sparks) {
      this.scene.remove(spark.mesh);
    }
    this.sparks = [];
  }

  private spawnEnemies(count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 24 + Math.random() * 38;
      const ex = Math.cos(angle) * dist;
      const ez = Math.sin(angle) * dist;
      const resolved = this.resolveObstacles(ex, ez, 0.7);
      const ey = groundHeightAt(resolved.x, resolved.z);

      // Give each bot a realistic outfit & distinct gun from catalog
      const botOutfit = OUTFIT_CATALOG[(i + 1) % OUTFIT_CATALOG.length].id;
      const botWeapon = WEAPON_CATALOG[(i + 1) % WEAPON_CATALOG.length].id;
      const rig = createOperatorModel(false, this.textures.contactShadow, this.textures, botOutfit);
      attachOperatorWeapons(rig, botWeapon, null);
      rig.root.position.set(resolved.x, ey, resolved.z);
      this.scene.add(rig.root);

      const hitProxy = new THREE.Mesh(this.enemyProxyGeo, this.enemyProxyMat);
      hitProxy.position.set(resolved.x, ey + 0.95, resolved.z);
      hitProxy.userData.enemyId = i + 1;
      this.scene.add(hitProxy);
      this.enemyHitProxies.push(hitProxy);

      this.enemies.push({
        id: i + 1,
        name: BOT_CALLSIGNS[i % BOT_CALLSIGNS.length],
        weaponId: botWeapon,
        rig,
        hitProxy,
        health: 100,
        maxHealth: 100,
        alive: true,
        yaw: Math.random() * Math.PI * 2,
        walkPhase: Math.random() * Math.PI * 2,
        fireCooldown: 0.8 + Math.random() * 1.4,
        muzzleTimer: 0,
        hitFlashTimer: 0,
        patrolTarget: new THREE.Vector3(
          (Math.random() - 0.5) * 45,
          0,
          (Math.random() - 0.5) * 45,
        ),
        strafeSign: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 1.5 + Math.random() * 2,
        firingVisualTimer: 0,
        emoteId: null,
        emoteTimer: 0,
        emoteElapsed: 0,
      });
    }
  }

  private spawnInitialPickups(): void {
    const spots: Array<{ x: number; z: number; kind: 'ammo' | 'medkit' }> = [
      { x: 0, z: 0, kind: 'ammo' },
      { x: -10, z: -8, kind: 'medkit' },
      { x: 11, z: 10, kind: 'ammo' },
      { x: -20, z: 14, kind: 'medkit' },
      { x: 22, z: -12, kind: 'ammo' },
      { x: -30, z: -20, kind: 'ammo' },
      { x: 30, z: 24, kind: 'medkit' },
      { x: 4, z: -28, kind: 'medkit' },
      { x: -6, z: 32, kind: 'ammo' },
    ];
    for (const s of spots) {
      this.spawnPickup(s.x, s.z, s.kind);
    }
  }

  private spawnPickup(x: number, z: number, kind: 'ammo' | 'medkit'): void {
    const baseY = groundHeightAt(x, z);
    const mesh = createPickupModel(kind);
    mesh.position.set(x, baseY, z);
    this.scene.add(mesh);
    this.pickups.push({
      id: this.nextPickupId++,
      kind,
      mesh,
      active: true,
      bobPhase: Math.random() * Math.PI * 2,
      baseY,
    });
  }

  private spawnWeaponDrop(
    x: number,
    z: number,
    weaponId: WeaponId,
    ammo: number,
    reserveAmmo: number,
  ): void {
    const baseY = groundHeightAt(x, z);
    const mesh = createWeaponDropModel(weaponId);
    mesh.position.set(x, baseY, z);
    this.scene.add(mesh);
    this.weaponDrops.push({
      id: this.nextWeaponDropId++,
      weaponId,
      ammo,
      reserveAmmo,
      mesh,
      active: true,
      bobPhase: Math.random() * Math.PI * 2,
      baseY,
    });
  }

  public pickupNearbyWeapon(): void {
    if (this.status !== 'playing') return;
    let closest: WeaponDropEntity | null = null;
    let closestDistSq = 3.2 * 3.2;

    for (const drop of this.weaponDrops) {
      if (!drop.active) continue;
      const dSq =
        (drop.mesh.position.x - this.playerPos.x) ** 2 +
        (drop.mesh.position.z - this.playerPos.z) ** 2;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closest = drop;
      }
    }
    if (!closest) return;

    const currentSlot = this.weaponSlots[this.activeWeaponSlot];
    const droppedPrevWeapon = currentSlot.weaponId;
    const droppedPrevAmmo = currentSlot.ammo;
    const droppedPrevReserve = currentSlot.reserveAmmo;

    this.weaponSlots[this.activeWeaponSlot] = {
      weaponId: closest.weaponId,
      ammo: closest.ammo,
      reserveAmmo: closest.reserveAmmo,
    };

    closest.active = false;
    this.scene.remove(closest.mesh);

    // Drop previous gun at player feet if player wants to swap back
    const offsetX = this.playerPos.x + Math.cos(this.playerYaw) * 0.85;
    const offsetZ = this.playerPos.z - Math.sin(this.playerYaw) * 0.85;
    this.spawnWeaponDrop(offsetX, offsetZ, droppedPrevWeapon, droppedPrevAmmo, droppedPrevReserve);

    this.isReloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0.14;
    this.syncPlayerWeaponModels();
    tacticalAudio.playPickup();
    this.pushEmoteFeed('You', `equipped ${WEAPON_BY_ID[closest.weaponId].name}`, true);
    this.nearbyWeaponDrop = null;
    this.emitHud();
  }

  public toggleCameraMode(): void {
    this.cameraMode = this.cameraMode === 'third-person' ? 'over-shoulder' : 'third-person';
    this.emitHud();
  }

  public requestReload(): void {
    if (this.status !== 'playing' || this.isReloading) return;
    const activeSlot = this.weaponSlots[this.activeWeaponSlot];
    const spec = WEAPON_BY_ID[activeSlot.weaponId];
    if (activeSlot.ammo >= spec.magSize || activeSlot.reserveAmmo <= 0) return;
    this.isReloading = true;
    this.reloadTimer = spec.reloadTime;
    tacticalAudio.playReload();
    this.emitHud();
  }

  public useMedkit(): void {
    if (this.status !== 'playing') return;
    if (this.medkits <= 0 || this.health >= this.maxHealth) return;
    this.medkits--;
    this.health = Math.min(this.maxHealth, this.health + 40);
    tacticalAudio.playPickup();
    this.emitHud();
  }

  public triggerJump(): void {
    if (this.status !== 'playing') return;
    if (this.isCrouching) {
      this.isCrouching = false;
      this.emitHud();
    }
    if (this.isGrounded) {
      this.playerVelY = 5.9;
      this.isGrounded = false;
    }
  }

  public toggleCrouch(): void {
    if (this.status !== 'playing') return;
    this.isCrouching = !this.isCrouching;
    if (this.isCrouching) {
      this.sprintLocked = false;
    }
    this.emitHud();
  }

  public toggleSprint(): void {
    if (this.status !== 'playing') return;
    this.sprintLocked = !this.sprintLocked;
    if (this.sprintLocked) {
      this.isCrouching = false;
    }
    this.emitHud();
  }

  public triggerDash(): void {
    if (this.status !== 'playing') return;
    if (this.dashCooldown > 0 || this.dashTimer > 0) return;

    const moveRight =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
      this.virtualMoveX;
    const moveForward =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
      this.virtualMoveY;
    const len = Math.hypot(moveRight, moveForward);
    if (len > 0.08) {
      this.dashDir.set(moveRight / len, moveForward / len);
    } else {
      this.dashDir.set(0, 1);
    }
    this.isCrouching = false;
    this.dashTimer = 0.24;
    this.dashCooldown = 2.0;
    tacticalAudio.playDash();
    this.emitHud();
  }

  public deployGlooWall(): void {
    if (this.status !== 'playing') return;
    if (this.glooWalls <= 0) return;

    this.glooWalls--;
    const gx = this.playerPos.x + Math.sin(this.playerYaw) * 2.45;
    const gz = this.playerPos.z + Math.cos(this.playerYaw) * 2.45;
    const gy = groundHeightAt(gx, gz);
    this.spawnGlooWallAt(gx, gy, gz, this.playerYaw);
    tacticalAudio.playGlooWallDeploy();
    this.onlineCallbacks.onDeployGlooWall?.(gx, gy, gz, this.playerYaw);
    this.pushEmoteFeed('You', 'deployed Gloo Wall', true);
    this.emitHud();
  }

  public spawnGlooWallAt(x: number, y: number, z: number, yaw: number): void {
    const id = this.nextGlooId++;
    const { group, colliderMeshes } = createGlooWallModel();
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);

    for (const m of colliderMeshes) {
      m.userData.glooId = id;
      this.raycastBlockers.push(m);
    }

    const halfW = 1.65;
    const halfD = 0.45;
    const absCos = Math.abs(Math.cos(yaw));
    const absSin = Math.abs(Math.sin(yaw));
    const extX = halfW * absCos + halfD * absSin;
    const extZ = halfW * absSin + halfD * absCos;
    const obstacle: ObstacleBox = {
      minX: x - extX,
      maxX: x + extX,
      minZ: z - extZ,
      maxZ: z + extZ,
      height: 2.3,
    };
    this.obstacles.push(obstacle);

    this.glooWallEntities.push({
      id,
      group,
      colliderMeshes,
      obstacle,
      hp: 220,
      maxHp: 220,
      life: 20,
    });
  }

  private removeGlooWallEntity(gloo: GlooWallEntity): void {
    this.scene.remove(gloo.group);
    const obsIdx = this.obstacles.indexOf(gloo.obstacle);
    if (obsIdx !== -1) this.obstacles.splice(obsIdx, 1);
    for (const m of gloo.colliderMeshes) {
      const rayIdx = this.raycastBlockers.indexOf(m);
      if (rayIdx !== -1) this.raycastBlockers.splice(rayIdx, 1);
      m.geometry.dispose();
    }
  }

  private damageGlooWall(glooId: number, amount: number): void {
    const idx = this.glooWallEntities.findIndex((g) => g.id === glooId);
    if (idx === -1) return;
    const gloo = this.glooWallEntities[idx];
    gloo.hp -= amount;
    if (gloo.hp <= 0) {
      this.spawnSparks(gloo.group.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 10);
      this.removeGlooWallEntity(gloo);
      this.glooWallEntities.splice(idx, 1);
    }
  }

  public throwGrenade(): void {
    if (this.status !== 'playing') return;
    if (this.grenades <= 0) return;

    this.grenades--;
    if (this.activeEmote) this.cancelPlayerEmote();

    this.camera.getWorldDirection(_rayDir);
    const ox = this.playerPos.x + Math.sin(this.playerYaw) * 0.55;
    const oy = this.playerPos.y + 1.55;
    const oz = this.playerPos.z + Math.cos(this.playerYaw) * 0.55;
    const throwSpeed = 16.5;
    const vx = _rayDir.x * throwSpeed;
    const vy = Math.max(4.5, _rayDir.y * throwSpeed + 5.6);
    const vz = _rayDir.z * throwSpeed;

    this.spawnGrenadeProjectile([ox, oy, oz], [vx, vy, vz], true);
    tacticalAudio.playGrenadeThrow();
    this.onlineCallbacks.onThrowGrenade?.([ox, oy, oz], [vx, vy, vz]);
    this.pushEmoteFeed('You', 'threw Frag Grenade', true);
    this.emitHud();
  }

  public spawnGrenadeProjectile(
    origin: [number, number, number],
    vel: [number, number, number],
    isLocal: boolean,
  ): void {
    const mesh = createGrenadeModel();
    mesh.position.set(origin[0], origin[1], origin[2]);
    this.scene.add(mesh);
    this.activeGrenades.push({
      mesh,
      pos: new THREE.Vector3(origin[0], origin[1], origin[2]),
      vel: new THREE.Vector3(vel[0], vel[1], vel[2]),
      fuse: 1.75,
      isLocal,
    });
  }

  private updateGrenades(dt: number): void {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;

      const nextX = g.pos.x + g.vel.x * dt;
      const nextZ = g.pos.z + g.vel.z * dt;
      const resolved = this.resolveObstacles(nextX, nextZ, 0.2);
      if (Math.abs(resolved.x - nextX) > 0.02) g.vel.x *= -0.45;
      if (Math.abs(resolved.z - nextZ) > 0.02) g.vel.z *= -0.45;
      g.pos.x = resolved.x;
      g.pos.z = resolved.z;
      g.pos.y += g.vel.y * dt;

      const floorY = groundHeightAt(g.pos.x, g.pos.z) + 0.14;
      if (g.pos.y <= floorY) {
        g.pos.y = floorY;
        if (Math.abs(g.vel.y) > 1.2) {
          g.vel.y = -g.vel.y * 0.42;
          g.vel.x *= 0.72;
          g.vel.z *= 0.72;
        } else {
          g.vel.set(g.vel.x * 0.85, 0, g.vel.z * 0.85);
        }
      }

      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += 9 * dt;
      g.mesh.rotation.z += 7 * dt;

      if (g.fuse <= 0) {
        this.detonateGrenade(g);
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
      }
    }
  }

  private detonateGrenade(g: ActiveGrenadeEntity): void {
    tacticalAudio.playExplosion();
    this.spawnSparks(g.pos, 14);

    const blastMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.72,
      }),
    );
    blastMesh.position.copy(g.pos);
    this.scene.add(blastMesh);
    this.explosions.push({ mesh: blastMesh, life: 0.34, maxLife: 0.34 });

    const blastRadius = 7.8;

    // Damage self if standing very close
    const playerDist = g.pos.distanceTo(this.playerPos);
    if (playerDist < blastRadius) {
      const selfDmg = Math.round(55 * (1 - playerDist / blastRadius));
      if (selfDmg > 0) this.takeDamage(selfDmg, 'enemy');
    }

    if (!g.isLocal) return;

    let anyHit = false;
    let anyKill = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dist = g.pos.distanceTo(e.rig.root.position);
      if (dist < blastRadius) {
        const dmg = Math.round(98 * (1 - dist / blastRadius));
        if (dmg > 0) {
          anyHit = true;
          this.damageDealt += dmg;
          e.health -= dmg;
          e.hitFlashTimer = 0.18;
          e.rig.armorMaterial.emissive.setHex(0xffffff);
          e.rig.armorMaterial.emissiveIntensity = 0.75;
          if (e.health <= 0) {
            anyKill = true;
            this.eliminateEnemy(e, 'You (Grenade)', true, false);
          }
        }
      }
    }

    for (let i = this.glooWallEntities.length - 1; i >= 0; i--) {
      const gloo = this.glooWallEntities[i];
      const dist = g.pos.distanceTo(gloo.group.position);
      if (dist < blastRadius) {
        this.damageGlooWall(gloo.id, 140);
      }
    }

    if (this.pvpMode) {
      for (const peer of this.remotePlayers.values()) {
        if (!peer.state.alive) continue;
        const dist = g.pos.distanceTo(peer.currentPos);
        if (dist < blastRadius) {
          const dmg = Math.round(85 * (1 - dist / blastRadius));
          if (dmg > 0) {
            anyHit = true;
            this.damageDealt += dmg;
            this.onlineCallbacks.onHitRemotePlayer?.(peer.uid, dmg);
          }
        }
      }
    }

    if (anyHit) {
      this.hitMarkerAge = 0;
      this.hitMarkerKill = anyKill;
      tacticalAudio.playHitMarker(anyKill);
      this.emitHud();
    }
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.graphicsQuality = quality;
    const dpr = window.devicePixelRatio || 1;
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
    } else if (quality === 'smooth') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMappingExposure = 1.0;
    } else if (quality === 'hd') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.75));
      this.renderer.shadowMap.enabled = true;
      this.renderer.toneMappingExposure = 1.06;
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.toneMappingExposure = 1.12;
    }
    this.emitHud();
  }

  public setVirtualJoystick(x: number, y: number): void {
    this.virtualMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setTouchFiring(firing: boolean): void {
    this.isTouchFiring = firing;
    if (firing && this.fireCooldown <= 0) {
      this.shoot();
    }
  }

  public setLookSensitivity(sensitivity: number): void {
    this.lookSensitivity = THREE.MathUtils.clamp(sensitivity, 0.35, 2.5);
  }

  public rotateLook(deltaX: number, deltaY: number): void {
    this.playerYaw -= deltaX * 0.0032 * this.lookSensitivity;
    this.cameraPitch = THREE.MathUtils.clamp(
      this.cameraPitch + deltaY * 0.0024 * this.lookSensitivity,
      -0.22,
      0.72,
    );
  }

  public shoot(): void {
    if (this.status !== 'playing') return;
    if (this.activeEmote) this.cancelPlayerEmote();
    if (this.isReloading) return;
    if (this.fireCooldown > 0) return;

    const activeSlot = this.weaponSlots[this.activeWeaponSlot];
    const spec = WEAPON_BY_ID[activeSlot.weaponId];

    if (activeSlot.ammo <= 0) {
      this.fireCooldown = 0.25;
      tacticalAudio.playDryFire();
      if (activeSlot.reserveAmmo > 0) {
        this.requestReload();
      }
      return;
    }

    activeSlot.ammo--;
    this.shotsFired++;
    this.fireCooldown = spec.fireRate;
    this.playerMuzzleTimer = 0.055;
    this.recoilKick = spec.id === 'shotgun' || spec.id === 'sniper' ? 0.14 : 0.085;
    this.playerRig.muzzleFlash.visible = true;
    tacticalAudio.playGunshot(false, spec.id);

    // Subtle realistic recoil pitch kick
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - spec.recoil, -0.22, 0.72);

    // Eject brass shell casing to the right
    this.spawnShellCasing();

    // Raycast pellets from camera center aim direction up to weapon range
    this.camera.getWorldPosition(_rayOrigin);
    this.camera.getWorldDirection(_rayDir);
    this.playerRig.muzzlePoint.getWorldPosition(_vecA);

    let anyHit = false;
    let anyKill = false;
    const hitTargets = new Map<EnemyEntity, number>();
    const remoteHitTargets = new Map<string, number>();
    const primaryTracerEnd = _vecB.copy(_rayOrigin).addScaledVector(_rayDir, spec.range).clone();

    for (let p = 0; p < spec.pellets; p++) {
      const pelletDir = _vecC.copy(_rayDir);
      if (spec.spread > 0) {
        pelletDir.x += (Math.random() - 0.5) * spec.spread * 2;
        pelletDir.y += (Math.random() - 0.5) * spec.spread * 2;
        pelletDir.z += (Math.random() - 0.5) * spec.spread * 2;
        pelletDir.normalize();
      }

      _raycaster.set(_rayOrigin, pelletDir);
      _raycaster.near = 1.2;
      _raycaster.far = spec.range;

      const worldHits = _raycaster.intersectObjects(this.raycastBlockers, false);
      const enemyHits = _raycaster.intersectObjects(this.enemyHitProxies, false);
      const remoteHits =
        this.pvpMode && this.remoteHitProxies.length > 0
          ? _raycaster.intersectObjects(this.remoteHitProxies, false)
          : [];

      const closestWorldDist = worldHits.length > 0 ? worldHits[0].distance : spec.range;
      const closestEnemyHit = enemyHits.length > 0 ? enemyHits[0] : null;
      const closestRemoteHit = remoteHits.length > 0 ? remoteHits[0] : null;

      const hitRemoteFirst =
        closestRemoteHit &&
        closestRemoteHit.distance <= closestWorldDist &&
        (!closestEnemyHit || closestRemoteHit.distance < closestEnemyHit.distance);

      if (hitRemoteFirst && closestRemoteHit) {
        const remoteUid = String(closestRemoteHit.object.userData.remoteUid ?? '');
        this.spawnTracer(_vecA, closestRemoteHit.point, 0xfbbf24);
        this.spawnSparks(closestRemoteHit.point, spec.pellets > 1 ? 3 : 5);
        if (p === 0) primaryTracerEnd.copy(closestRemoteHit.point);

        const peer = this.remotePlayers.get(remoteUid);
        if (peer && peer.state.alive) {
          anyHit = true;
          remoteHitTargets.set(remoteUid, (remoteHitTargets.get(remoteUid) ?? 0) + spec.damage);
          peer.hitFlashTimer = 0.14;
          peer.rig.armorMaterial.emissive.setHex(0xffffff);
          peer.rig.armorMaterial.emissiveIntensity = 0.7;
        }
      } else if (closestEnemyHit && closestEnemyHit.distance <= closestWorldDist) {
        const enemyId = closestEnemyHit.object.userData.enemyId as number;
        const targetEnemy = this.enemies.find((e) => e.id === enemyId && e.alive);
        this.spawnTracer(_vecA, closestEnemyHit.point, 0xfbbf24);
        this.spawnSparks(closestEnemyHit.point, spec.pellets > 1 ? 3 : 5);
        if (p === 0) primaryTracerEnd.copy(closestEnemyHit.point);

        if (targetEnemy) {
          anyHit = true;
          hitTargets.set(targetEnemy, (hitTargets.get(targetEnemy) ?? 0) + spec.damage);
        }
      } else {
        const endPoint =
          worldHits.length > 0
            ? worldHits[0].point
            : _vecB.copy(_rayOrigin).addScaledVector(pelletDir, spec.range);
        this.spawnTracer(_vecA, endPoint, spec.id === 'sniper' ? 0x38bdf8 : 0xfef08a);
        if (p === 0) primaryTracerEnd.copy(endPoint);
        if (worldHits.length > 0) {
          this.spawnSparks(worldHits[0].point, spec.pellets > 1 ? 2 : 4);
          const glooId = worldHits[0].object.userData.glooId as number | undefined;
          if (glooId) {
            this.damageGlooWall(glooId, spec.damage);
          }
        }
      }
    }

    this.onlineCallbacks.onShoot?.(
      spec.id,
      [_vecA.x, _vecA.y, _vecA.z],
      [primaryTracerEnd.x, primaryTracerEnd.y, primaryTracerEnd.z],
    );

    if (anyHit) {
      this.shotsHit++;
      hitTargets.forEach((dmg, targetEnemy) => {
        this.damageDealt += dmg;
        targetEnemy.health -= dmg;
        targetEnemy.hitFlashTimer = 0.14;
        targetEnemy.rig.armorMaterial.emissive.setHex(0xffffff);
        targetEnemy.rig.armorMaterial.emissiveIntensity = 0.7;

        if (targetEnemy.health <= 0) {
          anyKill = true;
          this.eliminateEnemy(targetEnemy, 'You', true, false);
        }
      });

      remoteHitTargets.forEach((dmg, remoteUid) => {
        this.damageDealt += dmg;
        this.onlineCallbacks.onHitRemotePlayer?.(remoteUid, dmg);
      });

      this.hitMarkerAge = 0;
      this.hitMarkerKill = anyKill;
      tacticalAudio.playHitMarker(anyKill);
    }

    if (activeSlot.ammo === 0 && activeSlot.reserveAmmo > 0) {
      this.requestReload();
    } else {
      this.emitHud();
    }
  }

  private spawnShellCasing(): void {
    const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);
    shell.position.set(
      this.playerPos.x - cosY * 0.25 + sinY * 0.3,
      this.playerPos.y + 1.28,
      this.playerPos.z + sinY * 0.25 + cosY * 0.3,
    );
    shell.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(shell);
    this.sparks.push({
      mesh: shell,
      vel: new THREE.Vector3(
        -cosY * (2.2 + Math.random()) + (Math.random() - 0.5) * 0.6,
        2.6 + Math.random() * 1.2,
        sinY * (2.2 + Math.random()) + (Math.random() - 0.5) * 0.6,
      ),
      life: 0.45,
      isShell: true,
    });
  }

  private eliminateEnemy(
    enemy: EnemyEntity,
    killerName: string,
    isPlayerKill: boolean,
    isZone: boolean,
  ): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.health = 0;
    enemy.rig.root.visible = false;
    enemy.hitProxy.visible = false;
    const idx = this.enemyHitProxies.indexOf(enemy.hitProxy);
    if (idx !== -1) this.enemyHitProxies.splice(idx, 1);

    if (isPlayerKill) {
      this.kills++;
      this.glooWalls = Math.min(5, this.glooWalls + 1);
      this.grenades = Math.min(5, this.grenades + 1);
    }

    const ex = enemy.rig.root.position.x;
    const ez = enemy.rig.root.position.z;
    const droppedSpec = WEAPON_BY_ID[enemy.weaponId];
    // Drop the eliminated combatant's gun on the battlefield so player can take it
    this.spawnWeaponDrop(
      ex + 0.55,
      ez + 0.35,
      enemy.weaponId,
      droppedSpec.magSize,
      Math.round(droppedSpec.magSize * 1.5),
    );

    this.spawnPickup(
      ex - 0.55,
      ez - 0.35,
      Math.random() > 0.4 ? 'medkit' : 'ammo',
    );

    this.pushKillFeed(killerName, enemy.name, isPlayerKill, isZone);

    const remainingEnemies = this.enemies.filter((e) => e.alive).length;
    if (remainingEnemies === 0 && this.status === 'playing') {
      this.status = 'victory';
      this.rank = 1;
      this.endReason = 'All hostile combatants eliminated';
      this.releasePointerLock();
    }
    this.emitHud();
  }

  private pushKillFeed(
    killer: string,
    victim: string,
    isPlayerKill: boolean,
    isZone: boolean,
  ): void {
    this.killFeed = [
      {
        id: this.nextKillFeedId++,
        killer,
        victim,
        isPlayerKill,
        isZone,
        timestamp: performance.now(),
      },
      ...this.killFeed,
    ].slice(0, 4);
  }

  public takeDamage(amount: number, source: 'enemy' | 'zone'): void {
    if (this.status !== 'playing') return;
    this.health = Math.max(0, this.health - amount);
    if (source === 'enemy') {
      this.damageFlashAge = 0;
      tacticalAudio.playDamageTaken();
    }

    if (this.health <= 0) {
      this.die(source === 'zone' ? 'Eliminated by Safe Zone radiation' : 'Eliminated in combat');
    }
  }

  private die(reason: string): void {
    if (this.status !== 'playing') return;
    const activeSlot = this.weaponSlots[this.activeWeaponSlot];
    this.spawnWeaponDrop(
      this.playerPos.x,
      this.playerPos.z,
      activeSlot.weaponId,
      activeSlot.ammo,
      activeSlot.reserveAmmo,
    );
    const aliveEnemies = this.enemies.filter((e) => e.alive).length;
    this.rank = aliveEnemies + 1;
    this.status = 'dead';
    this.endReason = reason;
    this.releasePointerLock();
    this.emitHud();
  }

  private releasePointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public tryPointerLock(): void {
    if (this.status !== 'playing') return;
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try {
        const res = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Fallback drag/move look remains active
      }
    }
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08, maxLife: 0.08 });
  }

  private spawnSparks(pos: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          2 + Math.random() * 5,
          (Math.random() - 0.5) * 8,
        ),
        life: 0.24 + Math.random() * 0.14,
      });
    }
  }

  private resolveObstacles(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = THREE.MathUtils.clamp(x, -ARENA_BOUND, ARENA_BOUND);
    let rz = THREE.MathUtils.clamp(z, -ARENA_BOUND, ARENA_BOUND);

    for (const obs of this.obstacles) {
      const closestX = THREE.MathUtils.clamp(rx, obs.minX, obs.maxX);
      const closestZ = THREE.MathUtils.clamp(rz, obs.minZ, obs.maxZ);
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          const penLeft = Math.abs(rx - obs.minX);
          const penRight = Math.abs(obs.maxX - rx);
          const penTop = Math.abs(rz - obs.minZ);
          const penBottom = Math.abs(obs.maxZ - rz);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) rx = obs.minX - radius;
          else if (minPen === penRight) rx = obs.maxX + radius;
          else if (minPen === penTop) rz = obs.minZ - radius;
          else rz = obs.maxZ + radius;
        }
      }
    }
    return { x: rx, z: rz };
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    _vecC.copy(to).sub(from);
    const dist = _vecC.length();
    if (dist < 0.1) return true;
    _vecC.divideScalar(dist);
    _raycaster.set(from, _vecC);
    _raycaster.near = 0.2;
    _raycaster.far = dist - 0.2;
    const hits = _raycaster.intersectObjects(this.raycastBlockers, false);
    return hits.length === 0;
  }

  private updateZoneVisuals(): void {
    this.safeZoneWall.position.set(this.zoneCenter.x, 19, this.zoneCenter.y);
    this.safeZoneWall.scale.set(this.zoneRadius, 1, this.zoneRadius);

    this.safeZoneRing.position.set(this.zoneCenter.x, 0.14, this.zoneCenter.y);
    this.safeZoneRing.scale.set(this.zoneRadius, this.zoneRadius, 1);

    this.nextZoneRing.position.set(this.zoneCenter.x, 0.13, this.zoneCenter.y);
    this.nextZoneRing.scale.set(MIN_ZONE_RADIUS, MIN_ZONE_RADIUS, 1);
  }

  private update(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (t.line.material as THREE.LineBasicMaterial).opacity = t.life / t.maxLife;
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      } else {
        s.vel.y -= 16 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.isShell) {
          s.mesh.rotation.x += 14 * dt;
          s.mesh.rotation.z += 11 * dt;
        } else {
          s.mesh.scale.setScalar(Math.max(0.1, s.life * 3.5));
        }
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= dt;
      if (ex.life <= 0) {
        this.scene.remove(ex.mesh);
        ex.mesh.geometry.dispose();
        (ex.mesh.material as THREE.Material).dispose();
        this.explosions.splice(i, 1);
      } else {
        const progress = 1 - ex.life / ex.maxLife;
        ex.mesh.scale.setScalar(0.8 + progress * 6.4);
        (ex.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.72 * (1 - progress));
      }
    }

    for (let i = this.glooWallEntities.length - 1; i >= 0; i--) {
      const g = this.glooWallEntities[i];
      g.life -= dt;
      if (g.life <= 0 || g.hp <= 0) {
        this.removeGlooWallEntity(g);
        this.glooWallEntities.splice(i, 1);
      }
    }

    this.updateGrenades(dt);

    // Menu / Lobby preview orbit — places operator & lobby squad on right half while Wardrobe sits on left
    if (this.status === 'menu') {
      const orbitAngle = performance.now() * 0.0003;
      this.playerRig.root.rotation.y = 0.35 + Math.sin(orbitAngle) * 0.45;

      if (this.activeEmote) {
        this.emoteTimer -= dt;
        this.emoteElapsed += dt;
        applyOperatorEmotePose(this.playerRig, this.activeEmote, this.emoteElapsed);
        if (this.emoteTimer <= 0) {
          this.cancelPlayerEmote();
        }
      } else {
        this.playerRig.bodyGroup.position.y = Math.sin(performance.now() * 0.0028) * 0.014;
      }

      // Animate Lobby AI Combatants & their emote replies
      for (let i = 0; i < this.lobbyBots.length; i++) {
        const bot = this.lobbyBots[i];
        if (bot.emoteId) {
          if (bot.emoteDelay > 0) {
            bot.emoteDelay -= dt;
            if (bot.emoteDelay <= 0 && bot.pendingReplyName) {
              this.pushEmoteFeed(bot.name, bot.pendingReplyName, false);
              bot.pendingReplyName = null;
              this.emitHud();
            }
          } else {
            bot.emoteTimer -= dt;
            bot.emoteElapsed += dt;
            applyOperatorEmotePose(bot.rig, bot.emoteId, bot.emoteElapsed);
            if (bot.emoteTimer <= 0) {
              bot.emoteId = null;
              resetOperatorCombatPose(bot.rig);
            }
          }
        } else {
          bot.rig.bodyGroup.position.y = Math.sin(performance.now() * 0.0026 + i) * 0.012;
          bot.rig.root.rotation.y = bot.baseYaw + Math.sin(performance.now() * 0.0008 + i) * 0.14;
        }
      }

      this.updateRemotePlayers(dt, true);

      this.camera.position.set(
        this.playerPos.x - 1.55,
        this.playerPos.y + 1.62,
        this.playerPos.z + 3.9,
      );
      this.camera.lookAt(this.playerPos.x - 0.75, this.playerPos.y + 1.05, this.playerPos.z - 0.3);
      return;
    }

    if (this.status !== 'playing') {
      const orbitAngle = performance.now() * 0.00022;
      this.camera.position.set(
        this.playerPos.x + Math.sin(orbitAngle) * 11,
        this.playerPos.y + 5.8,
        this.playerPos.z + Math.cos(orbitAngle) * 11,
      );
      this.camera.lookAt(this.playerPos.x, this.playerPos.y + 1.2, this.playerPos.z);
      return;
    }

    this.survivalSeconds += dt;
    this.hitMarkerAge += dt;
    this.damageFlashAge += dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.playerMuzzleTimer > 0) {
      this.playerMuzzleTimer -= dt;
      if (this.playerMuzzleTimer <= 0) {
        this.playerRig.muzzleFlash.visible = false;
      }
    }

    // Recover gun recoil smoothly
    this.recoilKick = THREE.MathUtils.damp(this.recoilKick, 0, 18, dt);
    this.playerRig.gunGroup.position.z = 0.32 - this.recoilKick;

    // Reload timer
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const activeSlot = this.weaponSlots[this.activeWeaponSlot];
        const spec = WEAPON_BY_ID[activeSlot.weaponId];
        const needed = spec.magSize - activeSlot.ammo;
        const transfer = Math.min(needed, activeSlot.reserveAmmo);
        activeSlot.ammo += transfer;
        activeSlot.reserveAmmo -= transfer;
        this.isReloading = false;
        this.emitHud();
      }
    }

    if ((this.isMouseFiring || this.isTouchFiring) && this.fireCooldown <= 0) {
      this.shoot();
    }

    if (this.keys['KeyQ']) this.playerYaw += 2.1 * dt;
    if (this.keys['KeyE']) this.playerYaw -= 2.1 * dt;

    let moveRight =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0) +
      this.virtualMoveX;
    let moveForward =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0) +
      this.virtualMoveY;

    const len = Math.hypot(moveRight, moveForward);
    if (len > 1) {
      moveRight /= len;
      moveForward /= len;
    }

    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);

    const joystickMag = Math.hypot(this.virtualMoveX, this.virtualMoveY);
    const wantsSprint =
      ((this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.sprintLocked) && len > 0.1) ||
      joystickMag > 0.85;
    if (wantsSprint && this.isCrouching) {
      this.isCrouching = false;
    }
    this.isSprinting = wantsSprint || this.dashTimer > 0;
    const speed =
      this.dashTimer > 0
        ? PLAYER_SPEED * 2.55
        : this.isCrouching
          ? PLAYER_SPEED * 0.62
          : this.isSprinting
            ? PLAYER_SPEED * 1.44
            : PLAYER_SPEED;

    const crouchOffset = this.isCrouching ? -0.26 : 0;

    if (len > 0.05 || this.dashTimer > 0) {
      if (this.activeEmote) {
        this.cancelPlayerEmote();
      }
      const sinY = Math.sin(this.playerYaw);
      const cosY = Math.cos(this.playerYaw);
      const effRight = this.dashTimer > 0 && len <= 0.05 ? this.dashDir.x : moveRight;
      const effForward = this.dashTimer > 0 && len <= 0.05 ? this.dashDir.y : moveForward;
      const vx = (sinY * effForward - cosY * effRight) * speed;
      const vz = (cosY * effForward + sinY * effRight) * speed;

      const resolved = this.resolveObstacles(
        this.playerPos.x + vx * dt,
        this.playerPos.z + vz * dt,
        0.58,
      );
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;

      this.walkPhase += dt * (this.isSprinting ? 14.5 : this.isCrouching ? 7.8 : 10.5) * Math.min(1, Math.max(0.45, len));
      const strideAmp = (this.isSprinting ? 0.66 : this.isCrouching ? 0.35 : 0.52) * Math.min(1, len);
      const swing = Math.sin(this.walkPhase) * strideAmp;
      this.playerRig.leftLeg.rotation.x = swing;
      this.playerRig.rightLeg.rotation.x = -swing;
      this.playerRig.leftArm.rotation.x = -0.82 - swing * 0.22;
      this.playerRig.rightArm.rotation.x = -0.95 + swing * 0.18;
      this.playerRig.bodyGroup.position.y = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.position.y,
        crouchOffset + Math.abs(Math.sin(this.walkPhase)) * (this.isSprinting ? 0.06 : 0.042),
        14,
        dt,
      );
      this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.rotation.x,
        (this.isSprinting ? 0.13 : this.isCrouching ? 0.18 : 0.04) * Math.max(0, moveForward) -
          0.04 * Math.max(0, -moveForward),
        12,
        dt,
      );
      // Realistic horizontal strafe banking
      this.playerRig.bodyGroup.rotation.z = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.rotation.z,
        -moveRight * (this.isSprinting ? 0.11 : 0.075),
        12,
        dt,
      );
    } else if (this.activeEmote) {
      this.emoteTimer -= dt;
      this.emoteElapsed += dt;
      applyOperatorEmotePose(this.playerRig, this.activeEmote, this.emoteElapsed);
      if (this.emoteTimer <= 0) {
        this.cancelPlayerEmote();
      }
    } else {
      this.playerRig.leftLeg.rotation.x = THREE.MathUtils.damp(
        this.playerRig.leftLeg.rotation.x,
        this.isCrouching ? -0.45 : 0,
        12,
        dt,
      );
      this.playerRig.rightLeg.rotation.x = THREE.MathUtils.damp(
        this.playerRig.rightLeg.rotation.x,
        this.isCrouching ? 0.35 : 0,
        12,
        dt,
      );
      this.playerRig.leftArm.rotation.x = THREE.MathUtils.damp(this.playerRig.leftArm.rotation.x, -0.82, 12, dt);
      this.playerRig.rightArm.rotation.x = THREE.MathUtils.damp(this.playerRig.rightArm.rotation.x, -0.95, 12, dt);
      this.playerRig.bodyGroup.position.y = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.position.y,
        crouchOffset + Math.sin(performance.now() * 0.003) * 0.012,
        12,
        dt,
      );
      this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.rotation.x,
        this.isCrouching ? 0.16 : 0,
        10,
        dt,
      );
      this.playerRig.bodyGroup.rotation.z = THREE.MathUtils.damp(this.playerRig.bodyGroup.rotation.z, 0, 10, dt);
    }

    // Jump & terrain gravity
    const groundY = groundHeightAt(this.playerPos.x, this.playerPos.z);
    if (!this.isGrounded || this.playerPos.y > groundY) {
      this.playerVelY -= 16.5 * dt;
      this.playerPos.y += this.playerVelY * dt;
      if (this.playerPos.y <= groundY) {
        this.playerPos.y = groundY;
        this.playerVelY = 0;
        this.isGrounded = true;
      } else {
        this.playerRig.leftLeg.rotation.x = -0.35;
        this.playerRig.rightLeg.rotation.x = 0.28;
      }
    } else {
      this.playerPos.y = groundY;
    }

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.y = this.playerYaw;

    // SafeZone shrinking & damage
    this.zoneElapsed = Math.min(ZONE_SHRINK_TIME, this.zoneElapsed + dt);
    const tZone = this.zoneElapsed / ZONE_SHRINK_TIME;
    this.zoneRadius = THREE.MathUtils.lerp(MAX_ZONE_RADIUS, MIN_ZONE_RADIUS, tZone);
    this.updateZoneVisuals();

    const playerDistFromZone = Math.hypot(
      this.playerPos.x - this.zoneCenter.x,
      this.playerPos.z - this.zoneCenter.y,
    );
    this.isOutsideZone = playerDistFromZone > this.zoneRadius;
    if (this.isOutsideZone) {
      this.zoneDamageAccum += ZONE_DAMAGE_PER_SEC * dt;
      if (this.zoneDamageAccum >= 1) {
        const dmg = Math.floor(this.zoneDamageAccum);
        this.zoneDamageAccum -= dmg;
        this.takeDamage(dmg, 'zone');
      }
    } else {
      this.zoneDamageAccum = 0;
    }

    // Pickups bobbing & collection
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.bobPhase += dt * 2.5;
      p.mesh.position.y = p.baseY + 0.08 + Math.sin(p.bobPhase) * 0.07;
      p.mesh.rotation.y += dt * 1.4;

      const distSq =
        (p.mesh.position.x - this.playerPos.x) ** 2 +
        (p.mesh.position.z - this.playerPos.z) ** 2;
      if (distSq < 1.8 * 1.8) {
        if (p.kind === 'medkit') {
          if (this.health < 75) {
            this.health = Math.min(this.maxHealth, this.health + 35);
            p.active = false;
            p.mesh.visible = false;
            tacticalAudio.playPickup();
            this.emitHud();
          } else if (this.medkits < 5) {
            this.medkits++;
            p.active = false;
            p.mesh.visible = false;
            tacticalAudio.playPickup();
            this.emitHud();
          }
        } else if (p.kind === 'ammo') {
          const activeSlot = this.weaponSlots[this.activeWeaponSlot];
          const otherSlot = this.weaponSlots[this.activeWeaponSlot === 0 ? 1 : 0];
          activeSlot.reserveAmmo += Math.max(15, WEAPON_BY_ID[activeSlot.weaponId].magSize);
          otherSlot.reserveAmmo += Math.max(10, Math.ceil(WEAPON_BY_ID[otherSlot.weaponId].magSize * 0.5));
          p.active = false;
          p.mesh.visible = false;
          tacticalAudio.playPickup();
          this.emitHud();
        }
      }
    }

    // Dropped weapon bobbing, auto-scavenge matching ammo, and proximity prompt
    let nextNearby: NearbyWeaponDrop | null = null;
    let nearestDropDistSq = 3.2 * 3.2;
    for (const drop of this.weaponDrops) {
      if (!drop.active) continue;
      drop.bobPhase += dt * 2.4;
      drop.mesh.position.y = drop.baseY + Math.sin(drop.bobPhase) * 0.05;
      drop.mesh.children.forEach((child, idx) => {
        if (idx === 2) child.rotation.y += dt * 1.5;
      });

      const dSq =
        (drop.mesh.position.x - this.playerPos.x) ** 2 +
        (drop.mesh.position.z - this.playerPos.z) ** 2;

      // Auto-scavenge spare ammo if player walks over a matching gun
      const matchingSlot = this.weaponSlots.find((s) => s.weaponId === drop.weaponId);
      if (matchingSlot && dSq < 1.75 * 1.75) {
        matchingSlot.reserveAmmo += drop.ammo + drop.reserveAmmo;
        drop.active = false;
        this.scene.remove(drop.mesh);
        tacticalAudio.playPickup();
        this.emitHud();
        continue;
      }

      if (dSq < nearestDropDistSq) {
        nearestDropDistSq = dSq;
        nextNearby = {
          dropId: drop.id,
          weaponId: drop.weaponId,
          ammo: drop.ammo,
          reserveAmmo: drop.reserveAmmo,
        };
      }
    }

    if (nextNearby?.dropId !== this.nearbyWeaponDrop?.dropId) {
      this.nearbyWeaponDrop = nextNearby;
      this.emitHud();
    }

    this.updateEnemies(dt);
    this.updateRemotePlayers(dt, false);

    // Smooth Damped Third-Person / Over-Shoulder Camera
    const isShoulder = this.cameraMode === 'over-shoulder';
    const camDist = isShoulder ? 2.55 : 4.85;
    const camHeight = isShoulder ? 1.82 : 2.48;
    const shoulderOffset = isShoulder ? 0.72 : 0.48;

    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);

    _camDesired.set(
      this.playerPos.x - sinY * camDist - cosY * shoulderOffset,
      this.playerPos.y + camHeight + Math.sin(this.cameraPitch) * 2.2,
      this.playerPos.z - cosY * camDist + sinY * shoulderOffset,
    );

    const camGround = groundHeightAt(_camDesired.x, _camDesired.z) + 0.75;
    _camDesired.y = Math.max(camGround, _camDesired.y);

    _camTarget.set(
      this.playerPos.x + sinY * 12 - cosY * shoulderOffset * 0.5,
      this.playerPos.y + 1.42 - Math.sin(this.cameraPitch) * 6.5,
      this.playerPos.z + cosY * 12 + sinY * shoulderOffset * 0.5,
    );

    const dampFactor = 1 - Math.exp(-16 * dt);
    this.camera.position.lerp(_camDesired, dampFactor);
    this.camera.lookAt(_camTarget);
    const targetFov = isShoulder ? 50 : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }

    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.066) {
      this.hudSyncAccum = 0;
      this.emitHud();
    }
  }

  private updateEnemies(dt: number): void {
    const isVeteran = this.matchConfig.difficulty === 'veteran';
    const botSpeed = isVeteran ? 4.4 : 3.5;
    const botSightRange = isVeteran ? 46 : 36;
    const botFireInterval = isVeteran ? 0.75 : 1.15;
    const botAccuracy = isVeteran ? 0.44 : 0.28;

    for (const e of this.enemies) {
      if (!e.alive) continue;

      if (e.emoteId) {
        e.emoteTimer -= dt;
        e.emoteElapsed += dt;
        applyOperatorEmotePose(e.rig, e.emoteId, e.emoteElapsed);
        if (e.emoteTimer <= 0) {
          e.emoteId = null;
          resetOperatorCombatPose(e.rig);
        }
        e.rig.root.rotation.y = Math.atan2(
          this.playerPos.x - e.rig.root.position.x,
          this.playerPos.z - e.rig.root.position.z,
        );
        continue;
      }

      if (e.muzzleTimer > 0) {
        e.muzzleTimer -= dt;
        if (e.muzzleTimer <= 0) e.rig.muzzleFlash.visible = false;
      }
      if (e.firingVisualTimer > 0) {
        e.firingVisualTimer -= dt;
      }
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          e.rig.armorMaterial.emissive.setHex(0x000000);
          e.rig.armorMaterial.emissiveIntensity = 0;
        }
      }

      if (e.rig.hpBarGroup && e.rig.hpBarFill) {
        if (e.health < e.maxHealth) {
          e.rig.hpBarGroup.visible = true;
          e.rig.hpBarGroup.lookAt(this.camera.position);
          const ratio = Math.max(0, e.health / e.maxHealth);
          e.rig.hpBarFill.scale.x = Math.max(0.01, ratio);
          e.rig.hpBarFill.position.x = -(1 - ratio) * 0.42;
        } else {
          e.rig.hpBarGroup.visible = false;
        }
      }

      const ex = e.rig.root.position.x;
      const ez = e.rig.root.position.z;

      const distZone = Math.hypot(ex - this.zoneCenter.x, ez - this.zoneCenter.y);
      const outsideZone = distZone > this.zoneRadius - 1.5;
      if (distZone > this.zoneRadius) {
        e.health -= ZONE_DAMAGE_PER_SEC * dt * 0.85;
        if (e.health <= 0) {
          this.eliminateEnemy(e, 'Safe Zone', false, true);
          continue;
        }
      }

      const distToPlayer = Math.hypot(this.playerPos.x - ex, this.playerPos.z - ez);
      let seesPlayer = false;
      if (distToPlayer < botSightRange) {
        _vecA.set(ex, groundHeightAt(ex, ez) + 1.45, ez);
        _vecB.set(this.playerPos.x, this.playerPos.y + 1.35, this.playerPos.z);
        seesPlayer = this.hasLineOfSight(_vecA, _vecB);
      }

      e.fireCooldown -= dt;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeSign *= -1;
        e.strafeTimer = 1.4 + Math.random() * 1.8;
      }

      let moveX = 0;
      let moveZ = 0;

      if (outsideZone) {
        const toCenterX = this.zoneCenter.x - ex;
        const toCenterZ = this.zoneCenter.y - ez;
        const cLen = Math.hypot(toCenterX, toCenterZ) || 1;
        moveX = toCenterX / cLen;
        moveZ = toCenterZ / cLen;
        e.yaw = Math.atan2(moveX, moveZ);
      } else if (seesPlayer) {
        const dx = this.playerPos.x - ex;
        const dz = this.playerPos.z - ez;
        e.yaw = Math.atan2(dx, dz);
        const dLen = Math.hypot(dx, dz) || 1;
        const strafeX = (-dz / dLen) * e.strafeSign;
        const strafeZ = (dx / dLen) * e.strafeSign;
        const approach = distToPlayer > 18 ? 0.55 : distToPlayer < 9 ? -0.45 : 0;
        moveX = strafeX * 0.8 + (dx / dLen) * approach;
        moveZ = strafeZ * 0.8 + (dz / dLen) * approach;

        if (e.fireCooldown <= 0) {
          const enemySpec = WEAPON_BY_ID[e.weaponId];
          e.fireCooldown =
            Math.max(0.32, botFireInterval * (enemySpec.id === 'smg' ? 0.68 : enemySpec.id === 'sniper' ? 1.45 : 1.0)) +
            Math.random() * 0.45;
          e.muzzleTimer = 0.06;
          e.firingVisualTimer = 1.1;
          e.rig.muzzleFlash.visible = true;
          tacticalAudio.playGunshot(true, e.weaponId);

          e.rig.muzzlePoint.getWorldPosition(_vecA);
          const hitPlayer = Math.random() < botAccuracy * Math.max(0.35, 1 - distToPlayer / 55);
          if (hitPlayer) {
            _vecB.set(this.playerPos.x, this.playerPos.y + 1.25, this.playerPos.z);
            this.spawnTracer(_vecA, _vecB, 0xf87171);
            this.takeDamage(isVeteran ? 12 : 9, 'enemy');
          } else {
            _vecB.set(
              this.playerPos.x + (Math.random() - 0.5) * 3.8,
              this.playerPos.y + 1.1 + Math.random() * 0.8,
              this.playerPos.z + (Math.random() - 0.5) * 3.8,
            );
            this.spawnTracer(_vecA, _vecB, 0xf87171);
          }
        }
      } else {
        const toPatrolX = e.patrolTarget.x - ex;
        const toPatrolZ = e.patrolTarget.z - ez;
        const pDist = Math.hypot(toPatrolX, toPatrolZ);
        if (pDist < 2.5) {
          const r = Math.random() * Math.max(6, this.zoneRadius - 6);
          const a = Math.random() * Math.PI * 2;
          e.patrolTarget.set(
            this.zoneCenter.x + Math.cos(a) * r,
            0,
            this.zoneCenter.y + Math.sin(a) * r,
          );
        } else {
          moveX = toPatrolX / pDist;
          moveZ = toPatrolZ / pDist;
          e.yaw = Math.atan2(moveX, moveZ);
        }
      }

      const mLen = Math.hypot(moveX, moveZ);
      if (mLen > 0.05) {
        const nx = ex + (moveX / mLen) * botSpeed * dt;
        const nz = ez + (moveZ / mLen) * botSpeed * dt;
        const res = this.resolveObstacles(nx, nz, 0.55);
        const ny = groundHeightAt(res.x, res.z);
        e.rig.root.position.set(res.x, ny, res.z);
        e.hitProxy.position.set(res.x, ny + 0.95, res.z);
        e.walkPhase += dt * 9;
        const swing = Math.sin(e.walkPhase) * 0.48;
        e.rig.leftLeg.rotation.x = swing;
        e.rig.rightLeg.rotation.x = -swing;
      }
      e.rig.root.rotation.y = e.yaw;
    }
  }

  private updateRemotePlayers(dt: number, inMenu: boolean): void {
    let slotIdx = 0;
    for (const peer of this.remotePlayers.values()) {
      slotIdx++;
      const visible = peer.state.alive || inMenu;
      peer.rig.root.visible = visible;
      peer.hitProxy.visible = !inMenu && peer.state.alive;
      if (!visible) continue;

      if (peer.muzzleTimer > 0) {
        peer.muzzleTimer -= dt;
        if (peer.muzzleTimer <= 0) peer.rig.muzzleFlash.visible = false;
      }
      if (peer.hitFlashTimer > 0) {
        peer.hitFlashTimer -= dt;
        if (peer.hitFlashTimer <= 0) {
          peer.rig.armorMaterial.emissive.setHex(0x000000);
          peer.rig.armorMaterial.emissiveIntensity = 0;
        }
      }

      if (inMenu && peer.state.status === 'menu') {
        const lx = this.playerPos.x + 1.85 + (slotIdx - 1) * 1.45;
        const lz = this.playerPos.z - 0.8 + (slotIdx % 2) * 1.2;
        const ly = groundHeightAt(lx, lz);
        peer.currentPos.set(lx, ly, lz);
        peer.rig.root.position.copy(peer.currentPos);
        peer.rig.root.rotation.y = Math.atan2(this.playerPos.x - lx, this.playerPos.z - lz);
      } else {
        const prevX = peer.currentPos.x;
        const prevZ = peer.currentPos.z;
        const factor = 1 - Math.exp(-14 * dt);
        peer.currentPos.lerp(peer.targetPos, factor);
        peer.rig.root.position.copy(peer.currentPos);
        peer.hitProxy.position.set(peer.currentPos.x, peer.currentPos.y + 0.95, peer.currentPos.z);

        // Shortest-angle yaw damping
        let diff = peer.targetYaw - peer.rig.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        peer.rig.root.rotation.y += diff * factor;

        const movedDist = Math.hypot(peer.currentPos.x - prevX, peer.currentPos.z - prevZ);
        if (movedDist > 0.008) {
          peer.walkPhase += dt * (peer.state.isSprinting ? 14 : 10);
          const swing = Math.sin(peer.walkPhase) * 0.52;
          peer.rig.leftLeg.rotation.x = swing;
          peer.rig.rightLeg.rotation.x = -swing;
        } else {
          peer.rig.leftLeg.rotation.x = THREE.MathUtils.damp(peer.rig.leftLeg.rotation.x, 0, 10, dt);
          peer.rig.rightLeg.rotation.x = THREE.MathUtils.damp(peer.rig.rightLeg.rotation.x, 0, 10, dt);
        }
      }

      if (peer.state.activeEmote) {
        peer.emoteElapsed += dt;
        applyOperatorEmotePose(peer.rig, peer.state.activeEmote, peer.emoteElapsed);
      } else {
        const crouchY = peer.state.isCrouching ? -0.25 : 0;
        peer.rig.bodyGroup.position.y = THREE.MathUtils.damp(
          peer.rig.bodyGroup.position.y,
          crouchY + Math.sin(performance.now() * 0.003 + slotIdx) * 0.012,
          12,
          dt,
        );
      }

      if (peer.rig.hpBarGroup && peer.rig.hpBarFill) {
        if (!inMenu && this.pvpMode && peer.state.health < 100) {
          peer.rig.hpBarGroup.visible = true;
          peer.rig.hpBarGroup.lookAt(this.camera.position);
          const ratio = Math.max(0, peer.state.health / 100);
          peer.rig.hpBarFill.scale.x = Math.max(0.01, ratio);
          peer.rig.hpBarFill.position.x = -(1 - ratio) * 0.42;
        } else {
          peer.rig.hpBarGroup.visible = false;
        }
      }
    }
  }

  private emitHud(): void {
    const aliveEnemies = this.enemies.filter((e) => e.alive);
    const minimapEntities: MinimapEntity[] = [];

    for (const e of aliveEnemies) {
      const dist = Math.hypot(
        e.rig.root.position.x - this.playerPos.x,
        e.rig.root.position.z - this.playerPos.z,
      );
      if (e.firingVisualTimer > 0 || dist < 24) {
        minimapEntities.push({
          x: e.rig.root.position.x,
          z: e.rig.root.position.z,
          kind: 'enemy',
          firing: e.firingVisualTimer > 0,
        });
      }
    }

    for (const p of this.pickups) {
      if (!p.active) continue;
      minimapEntities.push({
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        kind: p.kind,
      });
    }

    for (const drop of this.weaponDrops) {
      if (!drop.active) continue;
      minimapEntities.push({
        x: drop.mesh.position.x,
        z: drop.mesh.position.z,
        kind: 'weapon',
      });
    }

    for (const peer of this.remotePlayers.values()) {
      if (!peer.state.alive) continue;
      minimapEntities.push({
        x: peer.currentPos.x,
        z: peer.currentPos.z,
        kind: this.pvpMode ? 'enemy' : 'ally',
        firing: peer.muzzleTimer > 0,
      });
    }

    const activeSlot = this.weaponSlots[this.activeWeaponSlot];
    const activeSpec = WEAPON_BY_ID[activeSlot.weaponId];

    this.onHudUpdate({
      status: this.status,
      health: Math.ceil(this.health),
      maxHealth: this.maxHealth,
      medkits: this.medkits,
      glooWalls: this.glooWalls,
      grenades: this.grenades,
      dashCooldown: this.dashCooldown,
      isDashing: this.dashTimer > 0,
      ammo: activeSlot.ammo,
      magSize: activeSpec.magSize,
      reserveAmmo: activeSlot.reserveAmmo,
      weaponSlots: [
        {
          weaponId: this.weaponSlots[0].weaponId,
          ammo: this.weaponSlots[0].ammo,
          magSize: WEAPON_BY_ID[this.weaponSlots[0].weaponId].magSize,
          reserveAmmo: this.weaponSlots[0].reserveAmmo,
        },
        {
          weaponId: this.weaponSlots[1].weaponId,
          ammo: this.weaponSlots[1].ammo,
          magSize: WEAPON_BY_ID[this.weaponSlots[1].weaponId].magSize,
          reserveAmmo: this.weaponSlots[1].reserveAmmo,
        },
      ],
      activeWeaponSlot: this.activeWeaponSlot,
      nearbyWeaponDrop: this.nearbyWeaponDrop,
      isReloading: this.isReloading,
      isCrouching: this.isCrouching,
      isSprinting: this.isSprinting,
      graphicsQuality: this.graphicsQuality,
      kills: this.kills,
      aliveCount: aliveEnemies.length + (this.health > 0 ? 1 : 0),
      totalCombatants: this.matchConfig.enemyCount + 1,
      rank: this.rank,
      survivalSeconds: this.survivalSeconds,
      damageDealt: this.damageDealt,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      zoneRadius: this.zoneRadius,
      maxZoneRadius: MAX_ZONE_RADIUS,
      zoneCenterX: this.zoneCenter.x,
      zoneCenterZ: this.zoneCenter.y,
      zoneTimer: Math.max(0, Math.ceil(ZONE_SHRINK_TIME - this.zoneElapsed)),
      zoneDamagePerSec: ZONE_DAMAGE_PER_SEC,
      isOutsideZone: this.isOutsideZone,
      distanceToZoneCenter: Math.hypot(
        this.playerPos.x - this.zoneCenter.x,
        this.playerPos.z - this.zoneCenter.y,
      ),
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.playerYaw,
      cameraMode: this.cameraMode,
      pointerLocked: this.pointerLocked,
      hitMarkerAge: this.hitMarkerAge,
      hitMarkerKill: this.hitMarkerKill,
      damageFlashAge: this.damageFlashAge,
      minimapEntities,
      killFeed: this.killFeed,
      endReason: this.endReason,
      outfit: this.matchConfig.outfit,
      map: this.matchConfig.map,
      activeEmote: this.activeEmote,
      emoteFeed: this.emoteFeed,
    });
  }

  private startLoop(): void {
    this.lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;

      this.update(dt);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private handleResize = () => {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    this.keys[e.code] = true;

    // Emote hotkeys 1-5 work in both Lobby and Active Play
    if (this.status === 'menu' || this.status === 'playing') {
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
      if (idx !== -1 && EMOTE_CATALOG[idx]) {
        this.triggerEmote(EMOTE_CATALOG[idx].id);
        return;
      }
    }

    if (this.status !== 'playing') return;

    if (e.code === 'KeyR') {
      this.requestReload();
    } else if (e.code === 'KeyH') {
      this.useMedkit();
    } else if (e.code === 'KeyB') {
      this.deployGlooWall();
    } else if (e.code === 'KeyG') {
      this.throwGrenade();
    } else if (e.code === 'KeyU') {
      this.triggerDash();
    } else if (e.code === 'KeyX') {
      this.switchWeaponSlot();
    } else if (e.code === 'KeyZ') {
      this.pickupNearbyWeapon();
    } else if (e.code === 'KeyC') {
      this.toggleCrouch();
    } else if (e.code === 'KeyJ') {
      this.triggerJump();
    } else if (e.code === 'KeyV') {
      this.toggleCameraMode();
    } else if (e.code === 'Space' || e.code === 'KeyF') {
      e.preventDefault();
      this.shoot();
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.status !== 'playing') return;
    if (Math.abs(e.deltaY) > 6) {
      this.switchWeaponSlot();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.status !== 'playing') return;
    if (e.button === 0) {
      this.tryPointerLock();
      this.isMouseFiring = true;
      this.shoot();
    } else if (e.button === 2) {
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isMouseFiring = false;
    }
    if (e.button === 2) {
      this.isDraggingLook = false;
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.status !== 'playing') return;
    if (this.pointerLocked) {
      this.rotateLook(e.movementX, e.movementY);
    } else if (this.isDraggingLook || e.buttons === 2) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.rotateLook(dx * 1.4, dy * 1.4);
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost?.(true);
  };

  private handleContextRestored = () => {
    this.onContextLost?.(false);
  };

  private bindEvents(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    canvas.removeEventListener('contextmenu', this.handleContextMenu);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    window.removeEventListener('wheel', this.handleWheel);

    this.releasePointerLock();
    this.clearDynamicEntities();
    for (const peer of this.remotePlayers.values()) {
      this.scene.remove(peer.rig.root);
      this.scene.remove(peer.hitProxy);
    }
    this.remotePlayers.clear();
    this.remoteHitProxies = [];
    this.textures.dispose();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
    this.enemyProxyGeo.dispose();
    this.enemyProxyMat.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
