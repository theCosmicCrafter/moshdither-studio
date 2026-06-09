import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * Main-process crash reporter for MoshDither Studio.
 *
 * Logs uncaught exceptions and unhandled rejections to
 * ~/.moshdither/logs/crash.log with automatic rotation.
 */

const CRASH_LOG_DIR = path.join(os.homedir(), ".moshdither", "logs");
const CRASH_LOG_PATH = path.join(CRASH_LOG_DIR, "crash.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

function ensureLogDir() {
  if (!fs.existsSync(CRASH_LOG_DIR)) {
    fs.mkdirSync(CRASH_LOG_DIR, { recursive: true });
  }
}

function rotateLogIfNeeded() {
  try {
    const stats = fs.statSync(CRASH_LOG_PATH);
    if (stats.size > MAX_LOG_SIZE) {
      const rotated = `${CRASH_LOG_PATH}.1`;
      if (fs.existsSync(rotated)) {
        fs.unlinkSync(rotated);
      }
      fs.renameSync(CRASH_LOG_PATH, rotated);
    }
  } catch {
    // Log file doesn't exist yet; ignore
  }
}

function writeCrashEntry(type: string, error: Error) {
  ensureLogDir();
  rotateLogIfNeeded();

  const entry = `
[${new Date().toISOString()}] ${type}
Message: ${error.message}
Stack: ${error.stack || "(no stack)"}
--------------------------------------------------
`;

  try {
    fs.appendFileSync(CRASH_LOG_PATH, entry);
  } catch (e) {
    console.error("[CrashReporter] Failed to write crash log:", e);
  }
}

export function installMainCrashReporter() {
  process.on("uncaughtException", (err) => {
    console.error("[CrashReporter] Uncaught exception:", err);
    writeCrashEntry("uncaughtException", err);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error("[CrashReporter] Unhandled rejection:", err);
    writeCrashEntry("unhandledRejection", err);
  });

  console.log("[CrashReporter] Main process logs:", CRASH_LOG_PATH);
}

export function getCrashLogPath(): string {
  return CRASH_LOG_PATH;
}
