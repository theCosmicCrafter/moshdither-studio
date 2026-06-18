/**
 * Python Backend Client
 * Spawns the Python RPC server and provides typed helpers to call it.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

let _pythonPort: number | null = null;
let _pythonToken: string | null = null;
let _pythonProcess: ReturnType<typeof spawn> | null = null;

const _stdoutListeners: ((data: string) => void)[] = [];

export function addStdoutListener(listener: (data: string) => void) {
  _stdoutListeners.push(listener);
}

const RPC_TIMEOUT = 600_000; // 10 minutes — covers first-run model download + heavy inference

function getProjectRoot(): string {
  // In dev: electron is at packages/desktop-gui/dist-electron
  // In production: resources/app/dist-electron
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.resolve(__dirname, "../../..");
  }
  return path.join(app.getAppPath(), "../..");
}

/**
 * Spawn the Python RPC server and capture its port + token.
 */
export function startPythonBackend(): Promise<{ port: number; token: string }> {
  return new Promise((resolve, reject) => {
    const projectRoot = getProjectRoot();
    const pythonScript = path.join(
      projectRoot,
      "packages/python-backend/main.py",
    );
    // Use venv Python if available (has all deps installed)
    const venvPython = path.join(
      projectRoot,
      "packages/python-backend/venv/Scripts/python.exe",
    );
    const pythonExe =
      process.platform === "win32" && fs.existsSync(venvPython)
        ? venvPython
        : process.platform === "win32"
          ? "python"
          : "python3";

    const env = {
      ...process.env,
      // Let Python use the same token Electron already generated
      MOSHDITHER_RPC_TOKEN: process.env.MOSHDITHER_RPC_TOKEN || "",
    };

    console.log("[PythonBackend] Spawning:", pythonExe, pythonScript);

    // If env token is already set, use it — Python won't print it
    _pythonToken = process.env.MOSHDITHER_RPC_TOKEN || null;

    const proc = spawn(pythonExe, [pythonScript, "0"], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    _pythonProcess = proc;

    let stderr = "";

    proc.stdout!.on("data", (data: Buffer) => {
      const text = data.toString();

      // Notify custom listeners
      for (const listener of _stdoutListeners) {
        try {
          listener(text);
        } catch (err) {
          console.error("[PythonBackend] stdout listener failed:", err);
        }
      }

      // Parse RPC_PORT line (RPC_TOKEN only printed if not set in env)
      const portMatch = text.match(/RPC_PORT:(\d+)/);
      const tokenMatch = text.match(/RPC_TOKEN:([a-f0-9]+)/);
      if (portMatch) {
        _pythonPort = parseInt(portMatch[1], 10);
      }
      if (tokenMatch) {
        _pythonToken = tokenMatch[1];
      }
      if (_pythonPort && _pythonToken) {
        console.log(`[PythonBackend] Ready on port ${_pythonPort}`);
        resolve({ port: _pythonPort, token: _pythonToken });
      }
    });

    proc.stderr!.on("data", (data: Buffer) => {
      stderr += data.toString();
      console.error("[PythonBackend stderr]", data.toString().trim());
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start Python backend: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[PythonBackend] Exited with code ${code}`);
        console.error("[PythonBackend] stderr:", stderr);
      }
    });

    // Timeout if server doesn't start
    const startupTimer = setTimeout(() => {
      if (!_pythonPort) {
        reject(new Error("Python backend failed to start within 30s"));
      }
    }, 30_000);

    // Clear timeout when process stdout closes (success case)
    proc.stdout.on("close", () => {
      clearTimeout(startupTimer);
    });
  });
}

/**
 * Call the Python RPC server with a JSON-RPC envelope.
 */
export async function pythonRpcCall(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!_pythonPort || !_pythonToken) {
    throw new Error("Python backend not started");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT);

  try {
    const res = await fetch(`http://127.0.0.1:${_pythonPort}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RPC-Token": _pythonToken,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: Math.random().toString(36).slice(2),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Python RPC HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      jsonrpc: string;
      result?: unknown;
      error?: { message: string };
      id?: string;
    };

    if (json.error) {
      throw new Error(`Python RPC error: ${json.error.message}`);
    }

    return json.result;
  } catch (err) {
    clearTimeout(timeout);
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[PythonBackend] RPC call to ${method} failed:`,
      errorMsg,
      "Port:",
      _pythonPort,
      "Token length:",
      _pythonToken ? _pythonToken.length : "null",
    );
    throw err;
  }
}

export function stopPythonBackend(): void {
  if (_pythonProcess) {
    _pythonProcess.kill();
    _pythonProcess = null;
    _pythonPort = null;
    _pythonToken = null;
  }
}
