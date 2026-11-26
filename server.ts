import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface PlayerRecord {
  uid: string;
  name: string;
  outfit: string;
  weaponId: string;
  backWeaponId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  isCrouching: boolean;
  isSprinting: boolean;
  health: number;
  alive: boolean;
  activeEmote: string | null;
  kills: number;
  status: string;
}

interface RoomState {
  roomUid: string;
  hostUid: string;
  mode: 'coop' | 'pvp';
  map: string;
  matchActive: boolean;
  clients: Map<WebSocket, PlayerRecord>;
}

const rooms = new Map<string, RoomState>();

function normalizeUid(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 18);
  return cleaned || `AGAM-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getOrCreateRoom(roomUid: string, initialHostUid: string): RoomState {
  let room = rooms.get(roomUid);
  if (!room) {
    room = {
      roomUid,
      hostUid: initialHostUid,
      mode: 'coop',
      map: 'realistic',
      matchActive: false,
      clients: new Map(),
    };
    rooms.set(roomUid, room);
  }
  return room;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room: RoomState): void {
  const players = Array.from(room.clients.values());
  const payload = {
    type: 'room:state',
    roomUid: room.roomUid,
    hostUid: room.hostUid,
    mode: room.mode,
    map: room.map,
    matchActive: room.matchActive,
    players,
  };
  for (const client of room.clients.keys()) {
    sendJson(client, payload);
  }
}

function broadcastToOthers(room: RoomState, sender: WebSocket, payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const client of room.clients.keys()) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

function leaveCurrentRoom(ws: WebSocket, currentRoomUid: string | null): void {
  if (!currentRoomUid) return;
  const room = rooms.get(currentRoomUid);
  if (!room) return;
  const leaving = room.clients.get(ws);
  room.clients.delete(ws);
  if (room.clients.size === 0) {
    rooms.delete(currentRoomUid);
    return;
  }
  if (leaving && room.hostUid === leaving.uid) {
    const nextFirst = room.clients.values().next().value as PlayerRecord | undefined;
    if (nextFirst) {
      room.hostUid = nextFirst.uid;
    }
  }
  broadcastRoomState(room);
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let joinedRoomUid: string | null = null;

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawData)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type ?? '');

      if (type === 'hello') {
        const uid = normalizeUid(msg.uid);
        const targetRoomUid = normalizeUid(msg.roomUid || uid);
        leaveCurrentRoom(ws, joinedRoomUid);

        const room = getOrCreateRoom(targetRoomUid, uid);
        if (targetRoomUid === uid) {
          room.hostUid = uid;
        }
        const player: PlayerRecord = {
          uid,
          name: String(msg.name ?? uid).slice(0, 20),
          outfit: String(msg.outfit ?? 'tactical-camo'),
          weaponId: String(msg.weaponId ?? 'carbine'),
          backWeaponId: String(msg.backWeaponId ?? 'smg'),
          x: Number(msg.x ?? 0),
          y: Number(msg.y ?? 0),
          z: Number(msg.z ?? 6),
          yaw: Number(msg.yaw ?? 0),
          isCrouching: Boolean(msg.isCrouching),
          isSprinting: Boolean(msg.isSprinting),
          health: Number(msg.health ?? 100),
          alive: msg.alive !== false,
          activeEmote: typeof msg.activeEmote === 'string' ? msg.activeEmote : null,
          kills: Number(msg.kills ?? 0),
          status: String(msg.status ?? 'menu'),
        };
        room.clients.set(ws, player);
        joinedRoomUid = targetRoomUid;
        broadcastRoomState(room);
        return;
      }

      if (!joinedRoomUid) return;
      const room = rooms.get(joinedRoomUid);
      if (!room) return;
      const player = room.clients.get(ws);
      if (!player) return;

      if (type === 'room:join') {
        const nextRoomUid = normalizeUid(msg.roomUid);
        if (nextRoomUid === joinedRoomUid) return;
        const snapshot = { ...player };
        leaveCurrentRoom(ws, joinedRoomUid);

        const nextRoom = getOrCreateRoom(nextRoomUid, snapshot.uid);
        if (nextRoomUid === snapshot.uid) {
          nextRoom.hostUid = snapshot.uid;
        }
        nextRoom.clients.set(ws, snapshot);
        joinedRoomUid = nextRoomUid;
        broadcastRoomState(nextRoom);
        return;
      }

      if (type === 'room:mode') {
        if (room.hostUid === player.uid) {
          room.mode = msg.mode === 'pvp' ? 'pvp' : 'coop';
          broadcastRoomState(room);
        }
        return;
      }

      if (type === 'room:map') {
        if (room.hostUid === player.uid && typeof msg.map === 'string') {
          room.map = msg.map;
          broadcastRoomState(room);
        }
        return;
      }

      if (type === 'match:start') {
        room.matchActive = true;
        if (typeof msg.map === 'string') room.map = msg.map;
        broadcastToOthers(room, ws, {
          type: 'match:start',
          map: room.map,
          difficulty: msg.difficulty === 'veteran' ? 'veteran' : 'standard',
          enemyCount: Number(msg.enemyCount ?? 9),
          mode: room.mode,
        });
        broadcastRoomState(room);
        return;
      }

      if (type === 'match:lobby') {
        room.matchActive = false;
        player.status = 'menu';
        player.health = 100;
        player.alive = true;
        broadcastRoomState(room);
        return;
      }

      if (type === 'player:update') {
        if (typeof msg.name === 'string') player.name = msg.name.slice(0, 20);
        if (typeof msg.outfit === 'string') player.outfit = msg.outfit;
        if (typeof msg.weaponId === 'string') player.weaponId = msg.weaponId;
        if (typeof msg.backWeaponId === 'string') player.backWeaponId = msg.backWeaponId;
        if (typeof msg.x === 'number') player.x = msg.x;
        if (typeof msg.y === 'number') player.y = msg.y;
        if (typeof msg.z === 'number') player.z = msg.z;
        if (typeof msg.yaw === 'number') player.yaw = msg.yaw;
        if (typeof msg.isCrouching === 'boolean') player.isCrouching = msg.isCrouching;
        if (typeof msg.isSprinting === 'boolean') player.isSprinting = msg.isSprinting;
        if (typeof msg.health === 'number') player.health = msg.health;
        if (typeof msg.alive === 'boolean') player.alive = msg.alive;
        if (msg.activeEmote === null || typeof msg.activeEmote === 'string') {
          player.activeEmote = msg.activeEmote;
        }
        if (typeof msg.kills === 'number') player.kills = msg.kills;
        if (typeof msg.status === 'string') player.status = msg.status;

        broadcastToOthers(room, ws, {
          type: 'player:delta',
          player,
        });
        return;
      }

      if (type === 'player:shoot') {
        broadcastToOthers(room, ws, {
          type: 'player:shoot',
          uid: player.uid,
          weaponId: String(msg.weaponId ?? player.weaponId),
          start: msg.start,
          end: msg.end,
        });
        return;
      }

      if (type === 'player:hit' && room.mode === 'pvp') {
        const targetUid = String(msg.targetUid ?? '');
        const damage = Math.min(100, Math.max(1, Number(msg.damage ?? 20)));
        for (const [client, target] of room.clients.entries()) {
          if (target.uid === targetUid && target.alive) {
            sendJson(client, {
              type: 'player:damaged',
              damage,
              attackerUid: player.uid,
              attackerName: player.name,
            });
            break;
          }
        }
        return;
      }

      if (type === 'player:emote') {
        player.activeEmote = typeof msg.emoteId === 'string' ? msg.emoteId : null;
        broadcastToOthers(room, ws, {
          type: 'player:emote',
          uid: player.uid,
          name: player.name,
          emoteId: player.activeEmote,
        });
        return;
      }

      if (type === 'gloo:deploy') {
        broadcastToOthers(room, ws, {
          type: 'gloo:deploy',
          uid: player.uid,
          x: Number(msg.x ?? 0),
          y: Number(msg.y ?? 0),
          z: Number(msg.z ?? 0),
          yaw: Number(msg.yaw ?? 0),
        });
        return;
      }

      if (type === 'grenade:throw') {
        broadcastToOthers(room, ws, {
          type: 'grenade:throw',
          uid: player.uid,
          origin: msg.origin,
          vel: msg.vel,
        });
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(ws, joinedRoomUid);
      joinedRoomUid = null;
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Agam Battlegrounds server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
