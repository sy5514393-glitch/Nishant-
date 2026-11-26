import {
  Difficulty,
  EmoteId,
  MapId,
  OnlineMode,
  OnlinePlayerState,
  OnlineRoomSnapshot,
  OutfitId,
  WeaponId,
} from './types';

const UID_STORAGE_KEY = 'agam_player_uid_v1';
const NAME_STORAGE_KEY = 'agam_player_name_v1';

function getOrCreateUid(): string {
  try {
    const existing = localStorage.getItem(UID_STORAGE_KEY);
    if (existing && /^AGAM-[A-Z0-9]{4,8}$/.test(existing)) return existing;
    const code = Math.floor(100000 + Math.random() * 900000);
    const created = `AGAM-${code}`;
    localStorage.setItem(UID_STORAGE_KEY, created);
    return created;
  } catch {
    return `AGAM-${Math.floor(100000 + Math.random() * 900000)}`;
  }
}

function getOrCreateName(uid: string): string {
  try {
    const existing = localStorage.getItem(NAME_STORAGE_KEY);
    if (existing && existing.trim().length > 0) return existing.trim().slice(0, 18);
    return `Soldier-${uid.slice(-4)}`;
  } catch {
    return `Soldier-${uid.slice(-4)}`;
  }
}

export interface MultiplayerEvents {
  onRoomChange: (snapshot: OnlineRoomSnapshot) => void;
  onPeerDelta: (player: OnlinePlayerState) => void;
  onPeerShoot: (payload: {
    uid: string;
    weaponId: WeaponId;
    start: [number, number, number];
    end: [number, number, number];
  }) => void;
  onDamagedByPeer: (payload: {
    damage: number;
    attackerUid: string;
    attackerName: string;
  }) => void;
  onPeerEmote: (payload: { uid: string; name: string; emoteId: EmoteId | null }) => void;
  onPeerGlooDeploy?: (payload: { uid: string; x: number; y: number; z: number; yaw: number }) => void;
  onPeerGrenadeThrow?: (payload: {
    uid: string;
    origin: [number, number, number];
    vel: [number, number, number];
  }) => void;
  onMatchStart: (payload: {
    map: MapId;
    difficulty: Difficulty;
    enemyCount: number;
    mode: OnlineMode;
  }) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private myUid: string;
  private myName: string;
  private roomUid: string;
  private hostUid: string;
  private mode: OnlineMode = 'coop';
  private map: MapId = 'realistic';
  private matchActive = false;
  private connected = false;
  private players: OnlinePlayerState[] = [];
  private events: MultiplayerEvents;
  private latestLocalState: Partial<OnlinePlayerState> = {};

  constructor(events: MultiplayerEvents) {
    this.events = events;
    this.myUid = getOrCreateUid();
    this.myName = getOrCreateName(this.myUid);
    this.roomUid = this.myUid;
    this.hostUid = this.myUid;
  }

  public getSnapshot(): OnlineRoomSnapshot {
    return {
      connected: this.connected,
      myUid: this.myUid,
      myName: this.myName,
      roomUid: this.roomUid,
      hostUid: this.hostUid,
      isHost: this.hostUid === this.myUid,
      mode: this.mode,
      map: this.map,
      matchActive: this.matchActive,
      players: this.players,
    };
  }

  public connect(initialState?: Partial<OnlinePlayerState>): void {
    if (this.disposed) return;
    if (initialState) {
      this.latestLocalState = { ...this.latestLocalState, ...initialState };
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        this.send({
          type: 'hello',
          uid: this.myUid,
          name: this.myName,
          roomUid: this.roomUid,
          ...this.latestLocalState,
        });
        this.events.onRoomChange(this.getSnapshot());
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(msg.type ?? '');

        if (type === 'room:state') {
          this.roomUid = String(msg.roomUid ?? this.myUid);
          this.hostUid = String(msg.hostUid ?? this.myUid);
          this.mode = msg.mode === 'pvp' ? 'pvp' : 'coop';
          if (msg.map === 'realistic' || msg.map === 'nextera' || msg.map === 'compound') {
            this.map = msg.map;
          }
          this.matchActive = Boolean(msg.matchActive);
          this.players = Array.isArray(msg.players) ? (msg.players as OnlinePlayerState[]) : [];
          this.events.onRoomChange(this.getSnapshot());
          return;
        }

        if (type === 'player:delta' && msg.player) {
          const p = msg.player as OnlinePlayerState;
          const idx = this.players.findIndex((item) => item.uid === p.uid);
          if (idx >= 0) {
            this.players[idx] = p;
          } else {
            this.players.push(p);
          }
          this.events.onPeerDelta(p);
          return;
        }

        if (type === 'player:shoot') {
          this.events.onPeerShoot({
            uid: String(msg.uid ?? ''),
            weaponId: (msg.weaponId as WeaponId) || 'carbine',
            start: Array.isArray(msg.start) ? (msg.start as [number, number, number]) : [0, 1, 0],
            end: Array.isArray(msg.end) ? (msg.end as [number, number, number]) : [0, 1, 0],
          });
          return;
        }

        if (type === 'player:damaged') {
          this.events.onDamagedByPeer({
            damage: Number(msg.damage ?? 20),
            attackerUid: String(msg.attackerUid ?? ''),
            attackerName: String(msg.attackerName ?? 'Friend'),
          });
          return;
        }

        if (type === 'player:emote') {
          this.events.onPeerEmote({
            uid: String(msg.uid ?? ''),
            name: String(msg.name ?? 'Friend'),
            emoteId: (msg.emoteId as EmoteId | null) ?? null,
          });
          return;
        }

        if (type === 'gloo:deploy') {
          this.events.onPeerGlooDeploy?.({
            uid: String(msg.uid ?? ''),
            x: Number(msg.x ?? 0),
            y: Number(msg.y ?? 0),
            z: Number(msg.z ?? 0),
            yaw: Number(msg.yaw ?? 0),
          });
          return;
        }

        if (type === 'grenade:throw') {
          this.events.onPeerGrenadeThrow?.({
            uid: String(msg.uid ?? ''),
            origin: Array.isArray(msg.origin) ? (msg.origin as [number, number, number]) : [0, 1.5, 0],
            vel: Array.isArray(msg.vel) ? (msg.vel as [number, number, number]) : [0, 5, 10],
          });
          return;
        }

        if (type === 'match:start') {
          this.events.onMatchStart({
            map:
              msg.map === 'realistic' || msg.map === 'nextera' || msg.map === 'compound'
                ? msg.map
                : 'realistic',
            difficulty: msg.difficulty === 'veteran' ? 'veteran' : 'standard',
            enemyCount: Number(msg.enemyCount ?? 9),
            mode: msg.mode === 'pvp' ? 'pvp' : 'coop',
          });
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.events.onRoomChange(this.getSnapshot());
        if (!this.disposed) {
          this.reconnectTimer = window.setTimeout(() => this.connect(), 2200);
        }
      };
    } catch {
      this.connected = false;
    }
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public setName(name: string): void {
    const trimmed = name.trim().slice(0, 18) || `Soldier-${this.myUid.slice(-4)}`;
    this.myName = trimmed;
    try {
      localStorage.setItem(NAME_STORAGE_KEY, trimmed);
    } catch {
      // Ignore storage errors
    }
    this.send({ type: 'player:update', name: trimmed });
    this.events.onRoomChange(this.getSnapshot());
  }

  public joinRoomByUid(targetUid: string): void {
    const cleaned = targetUid.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleaned) return;
    this.roomUid = cleaned;
    this.send({ type: 'room:join', roomUid: cleaned });
    this.events.onRoomChange(this.getSnapshot());
  }

  public leaveToOwnRoom(): void {
    this.roomUid = this.myUid;
    this.send({ type: 'room:join', roomUid: this.myUid });
    this.events.onRoomChange(this.getSnapshot());
  }

  public setMode(mode: OnlineMode): void {
    this.mode = mode;
    this.send({ type: 'room:mode', mode });
  }

  public setRoomMap(map: MapId): void {
    this.map = map;
    this.send({ type: 'room:map', map });
  }

  public broadcastMatchStart(map: MapId, difficulty: Difficulty, enemyCount: number): void {
    this.send({ type: 'match:start', map, difficulty, enemyCount });
  }

  public sendReturnToLobby(): void {
    this.send({ type: 'match:lobby' });
  }

  public sendState(state: {
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
  }): void {
    this.latestLocalState = state;
    this.send({ type: 'player:update', name: this.myName, ...state });
  }

  public sendShoot(
    weaponId: WeaponId,
    start: [number, number, number],
    end: [number, number, number],
  ): void {
    this.send({ type: 'player:shoot', weaponId, start, end });
  }

  public sendHitPeer(targetUid: string, damage: number): void {
    this.send({ type: 'player:hit', targetUid, damage });
  }

  public sendEmote(emoteId: EmoteId | null): void {
    this.send({ type: 'player:emote', emoteId });
  }

  public sendGlooDeploy(x: number, y: number, z: number, yaw: number): void {
    this.send({ type: 'gloo:deploy', x, y, z, yaw });
  }

  public sendGrenadeThrow(
    origin: [number, number, number],
    vel: [number, number, number],
  ): void {
    this.send({ type: 'grenade:throw', origin, vel });
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }
}
