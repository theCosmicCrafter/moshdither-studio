/**
 * Main-process frame cache for MoshDither Studio.
 *
 * Handles all disk I/O for the frame cache so the renderer
 * never needs Node fs/path/os/crypto modules.
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";

const CACHE_DIR = path.join(os.homedir(), ".moshdither", "cache");
const MAX_CACHE_SIZE_MB = 1024; // 1GB cap

function hashKey(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function getCachePath(key: string): string {
  const h = hashKey(key);
  return path.join(CACHE_DIR, `${h}.png`);
}

function getMetaPath(key: string): string {
  const h = hashKey(key);
  return path.join(CACHE_DIR, `${h}.json`);
}

interface CacheEntry {
  key: string;
  createdAt: number;
  lastAccessed: number;
  sizeBytes: number;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readMeta(key: string): CacheEntry | null {
  const metaPath = getMetaPath(key);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as CacheEntry;
  } catch {
    return null;
  }
}

function writeMeta(entry: CacheEntry): void {
  ensureCacheDir();
  fs.writeFileSync(getMetaPath(entry.key), JSON.stringify(entry), "utf-8");
}

export function getCachedFrame(key: string): string | null {
  const cachePath = getCachePath(key);
  if (!fs.existsSync(cachePath)) return null;

  const meta = readMeta(key);
  if (meta) {
    meta.lastAccessed = Date.now();
    writeMeta(meta);
  }

  return `media://${cachePath.replace(/\\/g, "/")}`;
}

export function setCachedFrame(key: string, data: Buffer): void {
  ensureCacheDir();
  const cachePath = getCachePath(key);
  fs.writeFileSync(cachePath, data);

  const entry: CacheEntry = {
    key,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    sizeBytes: data.length,
  };
  writeMeta(entry);

  enforceSizeLimit();
}

function enforceSizeLimit(): void {
  const entries: CacheEntry[] = [];
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (file.endsWith(".json")) {
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(CACHE_DIR, file), "utf-8"),
        ) as CacheEntry;
        entries.push(meta);
      } catch {
        // Ignore corrupt meta files
      }
    }
  }

  const totalSize = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  const maxBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;

  if (totalSize <= maxBytes) return;

  entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
  let toEvict = totalSize - maxBytes;

  for (const entry of entries) {
    if (toEvict <= 0) break;
    const cachePath = getCachePath(entry.key);
    const metaPath = getMetaPath(entry.key);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    toEvict -= entry.sizeBytes;
  }
}

export function clearFrameCache(): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    fs.unlinkSync(path.join(CACHE_DIR, file));
  }
}

export function getCacheStats(): { entries: number; sizeMB: number } {
  if (!fs.existsSync(CACHE_DIR)) return { entries: 0, sizeMB: 0 };
  let totalSize = 0;
  let count = 0;
  for (const file of fs.readdirSync(CACHE_DIR)) {
    if (file.endsWith(".png")) {
      count++;
      totalSize += fs.statSync(path.join(CACHE_DIR, file)).size;
    }
  }
  return { entries: count, sizeMB: Math.round(totalSize / (1024 * 1024)) };
}
