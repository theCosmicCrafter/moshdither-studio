import { useState, useCallback, useRef, useEffect } from "react";

export interface Collaborator {
  clientId: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
  activeEffectId?: string | null;
}

export interface CollabState {
  connected: boolean;
  connecting: boolean;
  roomId: string | null;
  clientId: string;
  collaborators: Collaborator[];
  error: string | null;
}

const WS_URL = (port: number) => `ws://127.0.0.1:${port}/collab`;

export function useCollaboration() {
  const [state, setState] = useState<CollabState>({
    connected: false,
    connecting: false,
    roomId: null,
    clientId: "",
    collaborators: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientIdRef = useRef<string>("");

  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ action: "leave" }));
      } catch {
        // Socket may already be closed
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      connected: false,
      connecting: false,
      roomId: null,
      collaborators: [],
      error: null,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const connect = useCallback(
    async (roomId: string, name: string, hostPort?: number) => {
      disconnect();

      setState((prev) => ({ ...prev, connecting: true, error: null }));

      try {
        let port = hostPort;
        if (!port) {
          // Ask main process to start a server if we're hosting
          const result = await window.ipcRenderer.invoke<{ success: boolean; port?: number; error?: string }>(
            "collab:start-server",
          );
          if (!result.success || !result.port) {
            throw new Error(result.error || "Failed to start collaboration server");
          }
          port = result.port;
        }

        const ws = new WebSocket(WS_URL(port));
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const onOpen = () => resolve();
          const onError = () => reject(new Error("WebSocket connection failed"));
          ws.addEventListener("open", onOpen, { once: true });
          ws.addEventListener("error", onError, { once: true });
        });

        const clientId = crypto.randomUUID();
        clientIdRef.current = clientId;

        ws.send(
          JSON.stringify({
            action: "join",
            roomId,
            clientId,
            name: name || "Anonymous",
          }),
        );

        // Wait for joined ack
        const ack = await new Promise<{ clientId: string; color: string }>((resolve, reject) => {
          const handler = (evt: MessageEvent) => {
            try {
              const data = JSON.parse(evt.data);
              if (data.action === "joined") {
                ws.removeEventListener("message", handler);
                resolve({ clientId: data.clientId, color: data.color });
              }
            } catch {
              // ignore malformed
            }
          };
          ws.addEventListener("message", handler);
          setTimeout(() => {
            ws.removeEventListener("message", handler);
            reject(new Error("Join timeout"));
          }, 5000);
        });

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "ping" }));
          }
        }, 15000);

        // Listen for messages
        ws.addEventListener("message", (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.action === "presence") {
              const presences = (data.presences as Collaborator[]).filter(
                (p) => p.clientId !== clientIdRef.current,
              );
              setState((prev) => ({ ...prev, collaborators: presences }));
            }
          } catch {
            // ignore malformed
          }
        });

        setState({
          connected: true,
          connecting: false,
          roomId,
          clientId: ack.clientId,
          collaborators: [],
          error: null,
        });
      } catch (err) {
        disconnect();
        setState((prev) => ({
          ...prev,
          connecting: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [disconnect],
  );

  const hostSession = useCallback(
    async (name: string) => {
      const roomId = await window.ipcRenderer.invoke<string>("collab:generate-room-id");
      await connect(roomId, name);
      return roomId;
    },
    [connect],
  );

  const joinSession = useCallback(
    async (roomId: string, name: string, port: number) => {
      await connect(roomId, name, port);
    },
    [connect],
  );

  const sendOp = useCallback(
    (type: string, payload: unknown) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          action: "op",
          op: {
            id: crypto.randomUUID(),
            type,
            roomId: state.roomId,
            clientId: clientIdRef.current,
            timestamp: Date.now(),
            payload,
          },
        }),
      );
    },
    [state.roomId],
  );

  const updatePresence = useCallback((update: Partial<Collaborator>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ action: "presence", presence: update }));
  }, []);

  return {
    ...state,
    hostSession,
    joinSession,
    disconnect,
    sendOp,
    updatePresence,
  };
}
