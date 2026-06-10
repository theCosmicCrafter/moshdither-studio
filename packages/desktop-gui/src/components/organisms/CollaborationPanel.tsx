import * as React from "react";
import {
  connectToRoom,
  disconnectFromRoom,
  getCollabState,
  getCollabRoomId,
  onCollabEvent,
  sendPresence,
  type CollabPresence,
  type CollabState,
} from "../../utils/collaboration";
import { useStudio } from "../../context/StudioContext";
import { Users, Link2, LogOut, Radio, Circle } from "lucide-react";

export const CollaborationPanel: React.FC = () => {
  const { selectedEffectId } = useStudio();
  const [state, setState] = React.useState(getCollabState());
  const [roomId, setRoomId] = React.useState("");
  const [name, setName] = React.useState(() => {
    try { return localStorage.getItem("moshdither:collabName") || "User"; } catch { return "User"; }
  });
  const [presences, setPresences] = React.useState<CollabPresence[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    const unsubState = onCollabEvent("state", (s) => {
      setState(s as CollabState);
      if (s === "error") setError("Connection failed");
      if (s === "connected") setError(null);
    });
    const unsubPresence = onCollabEvent("presence", (p) => {
      setPresences((p as CollabPresence[]) || []);
    });
    const unsubJoined = onCollabEvent("joined", (data) => {
      const d = data as { roomId?: string };
      if (d.roomId) setRoomId(d.roomId);
    });
    const unsubErr = onCollabEvent("error", (e) => {
      setError(String(e));
    });

    return () => {
      unsubState();
      unsubPresence();
      unsubJoined();
      unsubErr();
    };
  }, []);

  // Send presence updates when selected effect changes
  React.useEffect(() => {
    if (state === "connected") {
      sendPresence({ activeEffectId: selectedEffectId });
    }
  }, [selectedEffectId, state]);

  const handleConnect = async () => {
    setError(null);
    try {
      const port = await window.ipcRenderer?.invoke<number>("collab:get-port");
      if (!port || port === 0) {
        const startResult = await window.ipcRenderer?.invoke<{ success: boolean; port: number }>("collab:start-server");
        if (!startResult?.success || !startResult.port) {
          setError("Failed to start collaboration server");
          return;
        }
        await connectToRoom(roomId || null, name, startResult.port);
      } else {
        await connectToRoom(roomId || null, name, port);
      }
      localStorage.setItem("moshdither:collabName", name);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDisconnect = async () => {
    await disconnectFromRoom();
    setPresences([]);
  };

  const handleGenerateRoom = async () => {
    const id = await window.ipcRenderer?.invoke<string>("collab:generate-room-id");
    if (id) setRoomId(id);
  };

  const connected = state === "connected";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* Presence bubbles */}
      {connected && presences.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          {presences.map((p) => (
            <div
              key={p.clientId}
              title={`${p.name}${p.activeEffectId ? ` - editing ${p.activeEffectId}` : ""}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: p.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#000",
                border: "2px solid rgba(255,255,255,0.2)",
                cursor: "default",
              }}
            >
              {p.name.slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: connected ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${connected ? "rgba(48,209,88,0.3)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 8,
          color: connected ? "#30d158" : "var(--text-primary, #e8e8ed)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {connected ? <Radio size={14} /> : <Users size={14} />}
        {connected ? `Room ${getCollabRoomId()}` : "Collaborate"}
        {connected && presences.length > 0 && (
          <span style={{ fontSize: 11, opacity: 0.7 }}>({presences.length + 1})</span>
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            width: 280,
            background: "var(--surface-elevated, #14141a)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            borderRadius: 10,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} />
            Real-time Collaboration
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#ff453a", padding: "6px 8px", background: "rgba(255,69,58,0.1)", borderRadius: 6 }}>
              {error}
            </div>
          )}

          {!connected ? (
            <>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary, #a0a0b0)", display: "block", marginBottom: 4 }}>
                  Your Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    color: "var(--text-primary, #e8e8ed)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary, #a0a0b0)", display: "block", marginBottom: 4 }}>
                  Room ID (optional)
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Generate or enter room ID"
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      color: "var(--text-primary, #e8e8ed)",
                      fontSize: 13,
                      textTransform: "uppercase",
                    }}
                  />
                  <button
                    onClick={handleGenerateRoom}
                    title="Generate new room"
                    style={{
                      padding: "6px 8px",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      color: "var(--text-secondary, #a0a0b0)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Link2 size={14} />
                  </button>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={state === "connecting"}
                style={{
                  padding: "8px",
                  background: "rgba(10,132,255,0.15)",
                  border: "1px solid rgba(10,132,255,0.3)",
                  borderRadius: 6,
                  color: "var(--accent-primary, #0a84ff)",
                  cursor: state === "connecting" ? "wait" : "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                {state === "connecting" ? "Connecting..." : roomId ? "Join Room" : "Create Room"}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <Circle size={10} style={{ color: "#30d158" }} />
                <span>Connected to room <strong>{roomId}</strong></span>
              </div>

              {presences.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary, #a0a0b0)" }}>In this room:</div>
                  {presences.map((p) => (
                    <div key={p.clientId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: p.color,
                          fontSize: 8,
                          fontWeight: 700,
                          color: "#000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12 }}>{p.name}</span>
                      {p.activeEffectId && (
                        <span style={{ fontSize: 10, color: "var(--text-secondary, #a0a0b0)", marginLeft: "auto" }}>
                          editing {p.activeEffectId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleDisconnect}
                style={{
                  padding: "8px",
                  background: "rgba(255,69,58,0.1)",
                  border: "1px solid rgba(255,69,58,0.2)",
                  borderRadius: 6,
                  color: "#ff453a",
                  cursor: "pointer",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <LogOut size={14} />
                Leave Room
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
