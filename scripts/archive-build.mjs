#!/usr/bin/env node
/**
 * Archive the installer produced by the last `tauri build`, keeping only the
 * most recent few.
 *
 * Tauri writes every build to the SAME filename, so a rebuild silently replaces
 * the previous installer and there is no way to roll back to, or even identify,
 * what shipped before. Archiving under the commit SHA makes each build
 * self-identifying: `MoshDither Studio_0.1.0_4bc46f8_x64-setup.exe` says what it
 * contains without anyone comparing file timestamps against `git log` -- an
 * inference that misdirected two debugging sessions.
 *
 *   node scripts/archive-build.mjs [--keep N]
 *
 * Old archives are MOVED to recycling/, never deleted, per the project rule
 * that removals stay recoverable.
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const archiveDir = join(root, "build-archive");

const keepArg = process.argv.indexOf("--keep");
const KEEP = keepArg !== -1 ? Number(process.argv[keepArg + 1]) : 3;
if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.error(`[archive-build] --keep must be a positive integer, got ${KEEP}`);
  process.exit(1);
}

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function isDirty() {
  try {
    return execSync("git status --porcelain", { cwd: root, encoding: "utf8" }).trim() !== "";
  } catch {
    return false;
  }
}

/** Installers from the most recent build, if any. */
function currentInstallers() {
  const out = [];
  for (const [sub, ext] of [
    ["nsis", ".exe"],
    ["msi", ".msi"],
  ]) {
    const dir = join(bundleDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(ext)) out.push(join(dir, f));
    }
  }
  return out;
}

const installers = currentInstallers();
if (installers.length === 0) {
  console.error("[archive-build] No installer found. Run `npm run tauri:build:no-sam3` first.");
  process.exit(1);
}

const sha = gitSha() + (isDirty() ? "-dirty" : "");
mkdirSync(archiveDir, { recursive: true });

for (const src of installers) {
  const base = src.split(/[\\/]/).pop();
  // "MoshDither Studio_0.1.0_x64-setup.exe" -> "..._0.1.0_<sha>_x64-setup.exe"
  const named = base.replace(/_x64/, `_${sha}_x64`);
  const dest = join(archiveDir, named);
  copyFileSync(src, dest);
  console.log(`[archive-build] archived ${named} (${(statSync(dest).size / 1048576).toFixed(0)} MB)`);
}

// Prune: keep the newest KEEP builds, grouped by SHA so an NSIS/MSI pair counts
// as one build rather than two.
const bySha = new Map();
for (const f of readdirSync(archiveDir)) {
  const m = f.match(/_([0-9a-f]{7,}(?:-dirty)?)_x64/);
  if (!m) continue;
  const full = join(archiveDir, f);
  const entry = bySha.get(m[1]) ?? { mtime: 0, files: [] };
  entry.mtime = Math.max(entry.mtime, statSync(full).mtimeMs);
  entry.files.push(full);
  bySha.set(m[1], entry);
}

const ordered = [...bySha.entries()].sort((a, b) => b[1].mtime - a[1].mtime);
const stale = ordered.slice(KEEP);
if (stale.length === 0) {
  console.log(`[archive-build] ${ordered.length} build(s) archived, keeping ${KEEP}. Nothing to prune.`);
} else {
  const stamp = new Date().toISOString().slice(0, 10);
  const bin = join(root, "recycling", `${stamp}_build-archive-pruned`);
  mkdirSync(bin, { recursive: true });
  for (const [pruneSha, entry] of stale) {
    for (const f of entry.files) {
      renameSync(f, join(bin, f.split(/[\\/]/).pop()));
    }
    console.log(`[archive-build] pruned build ${pruneSha} -> recycling/`);
  }
  console.log(`[archive-build] kept the ${KEEP} most recent build(s).`);
}
