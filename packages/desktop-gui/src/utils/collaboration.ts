/**
 * Real-time Collaboration Client for MoshDither Studio.
 *
 * Connects to the Electron main-process WebSocket server
 * and syncs effect stack changes with other users in the same room.
 */

import type { Effect } from "../types/effectTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollabOp {
  id: string;
  type: "effect:add" | "effect:remove" | "effect:update" | "effect:reorder" | "cursor:move" | "presence:update";
  roomId: string;
  clientId: string;
  timestamp: number;
  payload: unknown;
}

export interface CollabPresence {
  clientId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  activeEffectId?: string | null;
}

export type CollabState = "disconnected" | "connecting" | "connected" | "error";

// ---------------------------------------------------------------------------
// Event emitter for collaboration events
// ---------------------------------------------------------------------------

type Listener = (data: unknown) => void;
const listeners: Record<string, Listener[]> = {};

function emit(event: string, data: unknown): void {
  (listeners[event] || []).forEach((cb) => { try { cb(data); } catch {} });
}

export function onCollabEvent(event: string, cb: Listener): () => void {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  return () => {
    listeners[event] = listeners[event].filter((l) => l !== cb);
  };
}

// ---------------------------------------------------------------------------
// WebSocket client
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let state: CollabState = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let clientId = "";
let roomId = "";
let serverPort = 0;

export function getCollabState(): CollabState { return state; }
export function getCollabRoomId(): string { return roomId; }
export function getCollabClientId(): string { return clientId; }

export async function connectToRoom(
  targetRoomId: string | null,
  name: string,
  onPort: number,
): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN) {
    await disconnectFromRoom();
  }

  serverPort = onPort;
  roomId = targetRoomId || "";
  clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  state = "connecting";
  emit("state", state);

  try {
    ws = new WebSocket(`ws://127.0.0.1:${serverPort}/collab`);

    ws.onopen = () => {
      ws?.send(JSON.stringify({
        action: "join",
        roomId: roomId || undefined,
        clientId,
        name,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { action: string; [key: string]: unknown };
        handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      state = "disconnected";
      emit("state", state);
      ws = null;
      if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    };

    ws.onerror = () => {
      state = "error";
      emit("state", state);
    };
  } catch {
    state = "error";
    emit("state", state);
  }
}

export async function disconnectFromRoom(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (ws) {
    try {
      ws.send(JSON.stringify({ action: "leave" }));
    } catch {}
    ws.close();
    ws = null;
  }
  state = "disconnected";
  roomId = "";
  emit("state", state);
}

// ---------------------------------------------------------------------------
// Send operations
// ---------------------------------------------------------------------------

export function sendOp(op: Omit<CollabOp, "clientId" | "roomId">): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const fullOp: CollabOp = {
    ...op,
    clientId,
    roomId,
  };
  ws.send(JSON.stringify({ action: "op", op: fullOp }));
}

export function sendPresence(presence: { cursor?: { x: number; y: number }; activeEffectId?: string | null }): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ action: "presence", presence }));
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function handleMessage(msg: { action: string; [key: string]: unknown }): void {
  switch (msg.action) {
    case "joined": {
      state = "connected";
      roomId = String(msg.roomId || "");
      if (msg.clientId) clientId = String(msg.clientId);
      emit("state", state);
      emit("joined", { roomId, clientId, color: msg.color, ops: msg.ops });

      // Start ping loop
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "ping" }));
        }
      }, 15000);
      break;
    }

    case "op": {
      emit("op", msg.op);
      break;
    }

    case "presence": {
      emit("presence", msg.presences);
      break;
    }

    case "pong": {
      // keepalive received
      break;
    }

    case "error": {
      emit("error", msg.error);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Op helpers
// ---------------------------------------------------------------------------

export function createAddOp(effect: Effect): Omit<CollabOp, "clientId" | "roomId"> {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "effect:add",
    timestamp: Date.now(),
    payload: { effect },
  };
}

export function createRemoveOp(effectId: string): Omit<CollabOp, "clientId" | "roomId"> {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "effect:remove",
    timestamp: Date.now(),
    payload: { effectId },
  };
}

export function createUpdateOp(effectId: string, params: Partial<Effect["params"]>): Omit<CollabOp, "clientId" | "roomId"> {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "effect:update",
    timestamp: Date.now(),
    payload: { effectId, params },
  };
}

export function createReorderOp(effectIds: string[]): Omit<CollabOp, "clientId" | "roomId"> {
  return {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    type: "effect:reorder",
    timestamp: Date.now(),
    payload: { effectIds },
  };
}
