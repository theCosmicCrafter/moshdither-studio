/**
 * Proxy media generator for MoshDither Studio.
 *
 * Creates lower-resolution preview files for 4K+ footage
 * to ensure smooth real-time playback during editing.
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const PROXY_DIR = path.join(os.homedir(), ".moshdither", "proxies");

function getProxyPath(originalPath: string): string {
  const hash = Buffer.from(originalPath).toString("base64url").slice(0, 32);
  const ext = path.extname(originalPath);
  return path.join(PROXY_DIR, `${hash}_proxy${ext}`);
}

/**
 * Check if a proxy exists for the given source file.
 */
export function hasProxy(originalPath: string): boolean {
  const proxyPath = getProxyPath(originalPath);
  return fs.existsSync(proxyPath);
}

/**
 * Get the proxy path for a source file (may not exist yet).
 */
export function getProxyFor(originalPath: string): string {
  return getProxyPath(originalPath);
}

/**
 * Generate a 720p proxy for a video file using ffmpeg.
 * Returns the proxy file path.
 */
export async function generateProxy(
  ffmpegPath: string,
  originalPath: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const proxyPath = getProxyPath(originalPath);
  if (fs.existsSync(proxyPath)) {
    return proxyPath;
  }

  if (!fs.existsSync(PROXY_DIR)) {
    fs.mkdirSync(PROXY_DIR, { recursive: true });
  }

  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const args = [
      "-i", originalPath,
      "-vf", "scale=-2:720",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "28",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      proxyPath,
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      // Parse progress from ffmpeg stderr (e.g., "frame=  120 fps=30...")
      const frameMatch = stderr.match(/frame=\s*(\d+)/);
      if (frameMatch && onProgress) {
        // Rough estimate: we don't know total frames, so just report 0-99%
        onProgress(Math.min(99, parseInt(frameMatch[1], 10) / 10));
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve(proxyPath);
      } else {
        reject(new Error(`ffmpeg proxy generation failed (code ${code}): ${stderr.slice(-200)}`));
      }
    });
  });
}

/**
 * Clean up old proxies (older than 30 days).
 */
export function cleanupProxies(maxAgeDays = 30): void {
  if (!fs.existsSync(PROXY_DIR)) return;
  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const file of fs.readdirSync(PROXY_DIR)) {
    const filePath = path.join(PROXY_DIR, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtime.getTime() > maxAge) {
      fs.unlinkSync(filePath);
    }
  }
}
