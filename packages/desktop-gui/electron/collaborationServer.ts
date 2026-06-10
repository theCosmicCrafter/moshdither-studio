/**
 * Real-time Collaboration Server for MoshDither Studio.
 *
 * WebSocket-based room server using the `ws` library.
 * Handles: room join/leave, operation broadcast, presence heartbeat,
 * and simple LWW CRDT for effect stack synchronization.
 */

import { WebSocketServer, WebSocket } from "ws";
import * as http from "node:http";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Op {
  id: string;
  type:
    | "effect:add"
    | "effect:remove"
    | "effect:update"
    | "effect:reorder"
    | "cursor:move"
    | "presence:update";
  roomId: string;
  clientId: string;
  timestamp: number;
  payload: unknown;
}

export interface PresenceInfo {
  clientId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  activeEffectId?: string | null;
  lastSeen: number;
}

interface Room {
  id: string;
  clients: Map<WebSocket, PresenceInfo>;
  ops: Op[]; // operation log for late joiners
  createdAt: number;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const rooms = new Map<string, Room>();
const PRESENCE_TIMEOUT_MS = 30000; // 30s
const MAX_OPS_PER_ROOM = 500;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let wss: WebSocketServer | null = null;
let presenceInterval: NodeJS.Timeout | null = null;

function getPort(addr: string | import("net").AddressInfo | null): number {
  return typeof addr === "object" && addr !== null ? addr.port : 0;
}

export function startCollaborationServer(port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    if (wss) {
      resolve(getPort(wss.address()));
      return;
    }

    const server = http.createServer();
    wss = new WebSocketServer({ server, path: "/collab" });

    wss.on("connection", (ws) => {
      let currentRoom: Room | null = null;

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            action: string;
            [key: string]: unknown;
          };
          handleClientMessage(ws, msg, currentRoom, (room) => {
            currentRoom = room;
          });
        } catch {
          ws.send(JSON.stringify({ error: "Invalid JSON" }));
        }
      });

      ws.on("close", () => {
        if (currentRoom) {
          removeClientFromRoom(ws, currentRoom);
        }
      });

      ws.on("error", () => {
        if (currentRoom) {
          removeClientFromRoom(ws, currentRoom);
        }
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : 0;
      console.log(
        `[Collab] Server listening on ws://127.0.0.1:${actualPort}/collab`,
      );
      resolve(actualPort);
    });

    server.on("error", (err) => reject(err));

    // Presence cleanup interval
    presenceInterval = setInterval(() => {
      const now = Date.now();
      for (const room of rooms.values()) {
        for (const [client, info] of room.clients.entries()) {
          if (now - info.lastSeen > PRESENCE_TIMEOUT_MS) {
            room.clients.delete(client);
            broadcastPresence(room);
            try {
              client.terminate();
            } catch {}
          }
        }
        if (room.clients.size === 0) {
          rooms.delete(room.id);
        }
      }
    }, 10000);
  });
}

export function stopCollaborationServer(): void {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  if (wss) {
    wss.close();
    wss = null;
    rooms.clear();
  }
}

export function getCollaborationPort(): number {
  return getPort(wss?.address() ?? null);
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function handleClientMessage(
  ws: WebSocket,
  msg: { action: string; [key: string]: unknown },
  currentRoom: Room | null,
  setRoom: (room: Room | null) => void,
): void {
  switch (msg.action) {
    case "join": {
      const roomId = String(msg.roomId || generateRoomId());
      const clientId = String(msg.clientId || randomUUID());
      const name = String(msg.name || "Anonymous");
      const color = String(msg.color || generateColor(clientId));

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          id: roomId,
          clients: new Map(),
          ops: [],
          createdAt: Date.now(),
        };
        rooms.set(roomId, room);
      }

      const presence: PresenceInfo = {
        clientId,
        name,
        color,
        lastSeen: Date.now(),
      };
      room.clients.set(ws, presence);
      setRoom(room);

      // Send ack + room state
      ws.send(
        JSON.stringify({
          action: "joined",
          roomId,
          clientId,
          color,
          ops: room.ops,
        }),
      );

      // Broadcast presence update to others
      broadcastPresence(room);
      break;
    }

    case "leave": {
      if (currentRoom) {
        removeClientFromRoom(ws, currentRoom);
        setRoom(null);
      }
      break;
    }

    case "op": {
      if (!currentRoom) {
        ws.send(JSON.stringify({ error: "Not in a room" }));
        return;
      }
      const op = msg.op as Op;
      if (!op) return;

      // Store op for late joiners
      currentRoom.ops.push(op);
      if (currentRoom.ops.length > MAX_OPS_PER_ROOM) {
        currentRoom.ops = currentRoom.ops.slice(-MAX_OPS_PER_ROOM);
      }

      // Broadcast to all other clients in room
      broadcastToRoom(currentRoom, ws, { action: "op", op });

      // Update sender's lastSeen
      const info = currentRoom.clients.get(ws);
      if (info) info.lastSeen = Date.now();
      break;
    }

    case "presence": {
      if (!currentRoom) return;
      const info = currentRoom.clients.get(ws);
      if (!info) return;
      const update = msg.presence as Partial<PresenceInfo>;
      if (update.cursor) info.cursor = update.cursor;
      if (update.activeEffectId !== undefined)
        info.activeEffectId = update.activeEffectId;
      info.lastSeen = Date.now();
      broadcastPresence(currentRoom);
      break;
    }

    case "ping": {
      ws.send(JSON.stringify({ action: "pong" }));
      if (currentRoom) {
        const info = currentRoom.clients.get(ws);
        if (info) info.lastSeen = Date.now();
      }
      break;
    }

    default:
      ws.send(JSON.stringify({ error: `Unknown action: ${msg.action}` }));
  }
}

function removeClientFromRoom(ws: WebSocket, room: Room): void {
  room.clients.delete(ws);
  broadcastPresence(room);
  if (room.clients.size === 0) {
    rooms.delete(room.id);
  }
}

function broadcastToRoom(
  room: Room,
  exclude: WebSocket,
  message: unknown,
): void {
  const json = JSON.stringify(message);
  for (const client of room.clients.keys()) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

function broadcastPresence(room: Room): void {
  const presences = Array.from(room.clients.values()).map((info) => ({
    clientId: info.clientId,
    name: info.name,
    color: info.color,
    cursor: info.cursor,
    activeEffectId: info.activeEffectId,
  }));
  const json = JSON.stringify({ action: "presence", presences });
  for (const client of room.clients.keys()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateColor(seed: string): string {
  // Deterministic color from seed string
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 60%)`;
}

export function getRoomInfo(
  roomId: string,
): { clientCount: number; createdAt: number } | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  return { clientCount: room.clients.size, createdAt: room.createdAt };
}
