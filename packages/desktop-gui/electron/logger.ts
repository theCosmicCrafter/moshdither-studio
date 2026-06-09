import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * Structured Logger for MoshDither Studio — Main Process
 *
 * Features:
 * - Session-scoped log files with timestamp + PID + nonce
 * - Automatic rotation (30-day retention, max 200 files)
 * - JSONL structured event log (runs.jsonl)
 * - PII redaction before any disk write
 * - Console interception (log/info/warn/error all captured)
 * - Renderer log forwarding via IPC
 */

const LOGS_DIR = path.join(os.homedir(), ".moshdither", "logs");
const RETENTION_DAYS = 30;
const MAX_LOG_FILES = 200;

let sessionLogPath = "";
let runsPath = "";
let latestPath = "";
let logStream: fs.WriteStream | null = null;
let sessionId = "";

// ---------------------------------------------------------------------------
// PII Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: {
  name: string;
  regex: RegExp;
  replacement: string;
}[] = [
  {
    name: "bearer_token",
    regex: /Bearer\s+[^\s"']+/gi,
    replacement: "Bearer [REDACTED]",
  },
  {
    name: "api_key_env",
    regex: /MOSHDITHER_RPC_KEY\s*=\s*[^\s]+/gi,
    replacement: "MOSHDITHER_RPC_KEY=[REDACTED]",
  },
  { name: "sk_key", regex: /sk-[A-Za-z0-9]+/g, replacement: "sk_[REDACTED]" },
  {
    name: "api_key_json",
    regex: /("apiKey"\s*:\s*")[^"]+("\s*)/gi,
    replacement: "$1[REDACTED]$2",
  },
  {
    name: "jwt",
    regex: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    replacement: "[JWT_REDACTED]",
  },
  {
    name: "connection_string",
    regex: /[A-Za-z]+:\/\/[^:]+:[^@]+@/g,
    replacement: "[CONN_REDACTED]",
  },
];

function sanitizeText(text: string): string {
  let out = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern.regex, pattern.replacement);
  }
  // Scrub Windows home directory paths that contain the username
  out = out.replace(/C:\\Users\\[^\\]+/gi, "C:\\Users\\[USER]");
  out = out.replace(/\/home\/[^/]+/g, "/home/[USER]");
  return out;
}

// ---------------------------------------------------------------------------
// File Management
// ---------------------------------------------------------------------------

function ensureLogDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function generateSessionId(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 10);
  return `${stamp}-${process.pid}-${rand}`;
}

function rotateOldLogs() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOGS_DIR);
    const logCandidates: { full: string; mtimeMs: number }[] = [];

    for (const f of files) {
      const full = path.join(LOGS_DIR, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        if (st.mtimeMs < cutoff) {
          fs.unlinkSync(full);
          continue;
        }
        if (f.startsWith("main-") && f.endsWith(".log")) {
          logCandidates.push({ full, mtimeMs: st.mtimeMs });
        }
      } catch {
        // ignore stat errors on individual files
      }
    }

    if (logCandidates.length > MAX_LOG_FILES) {
      logCandidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
      const toDelete = logCandidates.slice(
        0,
        logCandidates.length - MAX_LOG_FILES,
      );
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.full);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore rotation errors
  }
}

// ---------------------------------------------------------------------------
// Write Helpers
// ---------------------------------------------------------------------------

function writeLine(level: string, parts: unknown[]) {
  try {
    const ts = new Date().toISOString();
    const msg = parts
      .map((p) => {
        if (p instanceof Error) return p.stack || p.message;
        if (typeof p === "string") return p;
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      })
      .join(" ");

    const line = `[${ts}] [${level}] [${sessionId}] ${sanitizeText(msg)}\n`;
    logStream?.write(line);
  } catch {
    // ignore write errors
  }
}

function appendRunEvent(evt: Record<string, unknown>) {
  try {
    fs.appendFileSync(runsPath, `${JSON.stringify(evt)}\n`, "utf8");
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Console Interception
// ---------------------------------------------------------------------------

const origConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

function interceptConsole() {
  console.log = (...args: unknown[]) => {
    writeLine("LOG", args);
    origConsole.log(...args);
  };
  console.info = (...args: unknown[]) => {
    writeLine("INFO", args);
    origConsole.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    writeLine("WARN", args);
    origConsole.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    writeLine("ERROR", args);
    origConsole.error(...args);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function installLogger() {
  ensureLogDir();
  rotateOldLogs();

  sessionId = generateSessionId();
  sessionLogPath = path.join(LOGS_DIR, `main-${sessionId}.log`);
  runsPath = path.join(LOGS_DIR, "runs.jsonl");
  latestPath = path.join(LOGS_DIR, "latest.txt");

  try {
    fs.writeFileSync(latestPath, `${sessionLogPath}\n`, "utf8");
  } catch {
    // ignore
  }

  logStream = fs.createWriteStream(sessionLogPath, { flags: "a" });

  // Write startup event to runs.jsonl
  appendRunEvent({
    type: "start",
    ts: new Date().toISOString(),
    sessionId,
    pid: process.pid,
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  });

  interceptConsole();

  // Crash marker — write a marker file on uncaught exception so next launch
  // can detect a crash and offer recovery.
  const crashMarkerPath = path.join(LOGS_DIR, "crash-marker.json");

  process.on("uncaughtException", (err) => {
    writeLine("FATAL", ["Uncaught exception:", err]);
    try {
      fs.writeFileSync(
        crashMarkerPath,
        JSON.stringify({
          ts: new Date().toISOString(),
          sessionId,
          pid: process.pid,
          type: "uncaughtException",
          message: err.message,
        }),
        "utf8",
      );
    } catch {
      // ignore
    }
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    writeLine("ERROR", ["Unhandled rejection:", err]);
  });

  console.log("[Logger] Session logs:", sessionLogPath);
}

export function writeRendererLog(
  level: string,
  message: string,
  details?: unknown,
) {
  writeLine(level, [`[Renderer] ${message}`, details]);
}

export function getLogPaths() {
  return { sessionLogPath, runsPath, latestPath, logsDir: LOGS_DIR };
}

export function checkCrashMarker(): {
  crashed: boolean;
  info?: Record<string, unknown>;
} {
  const crashMarkerPath = path.join(LOGS_DIR, "crash-marker.json");
  try {
    if (fs.existsSync(crashMarkerPath)) {
      const raw = fs.readFileSync(crashMarkerPath, "utf8");
      const info = JSON.parse(raw) as Record<string, unknown>;
      fs.unlinkSync(crashMarkerPath);
      return { crashed: true, info };
    }
  } catch {
    // ignore
  }
  return { crashed: false };
}
