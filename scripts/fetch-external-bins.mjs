#!/usr/bin/env node
/**
 * Re-obtain the FFmpeg / FFglitch sidecars this project cannot build without.
 *
 * src-tauri/bin/ holds 247 MB of binaries that are gitignored and have never
 * been committed, so losing that directory made the project unbuildable with no
 * recorded way back. `verify-external-bins.mjs` says WHAT is missing; this says
 * nothing and simply fetches it.
 *
 *   node scripts/fetch-external-bins.mjs [--force] [--only ffmpeg,ffgac]
 *
 * Everything is pinned by src-tauri/bin/SIDECARS.json -- exact versions, exact
 * URLs, exact SHA-256. Deliberately NOT "latest": gyan.dev's permanent URL now
 * resolves to FFmpeg 9.0.1 while this project is known-good on 8.0, and
 * silently installing a different build is the failure the manifest exists to
 * prevent.
 *
 * SECURITY BOUNDARY. This downloads executables and puts them where the app
 * will run them, so nothing is installed until its hash matches the manifest.
 * A mismatch aborts that binary and leaves whatever was already on disk alone.
 * FFglitch publishes no checksums of its own -- .sha256, SHA256SUMS and .asc
 * are all 404 -- so the manifest's hashes, taken from the binaries this project
 * already runs, are the only trust anchor there is. That is worth stating
 * plainly rather than implying the publisher vouched for these bytes.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");
const binDir = join(projectRoot, "src-tauri", "bin");

const force = process.argv.includes("--force");
const onlyIdx = process.argv.indexOf("--only");
const only =
  onlyIdx !== -1 && process.argv[onlyIdx + 1]
    ? new Set(process.argv[onlyIdx + 1].split(",").map((s) => s.trim()))
    : null;

const say = (m) => console.log(`[fetch-external-bins] ${m}`);
const die = (m) => {
  console.error(`[fetch-external-bins] ${m}`);
  process.exit(1);
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Windows' own bsdtar, by ABSOLUTE path.
 *
 * Not bare "tar": under Git Bash or MSYS that resolves to GNU tar, which cannot
 * read a zip at all ("This does not look like a tar archive"). Windows 10 1803+
 * ships bsdtar at System32	ar.exe, and bsdtar does read zip. Being explicit
 * means the script behaves the same from PowerShell, cmd and Git Bash instead
 * of depending on which shell happened to launch it.
 */
const BSDTAR = join(process.env.SystemRoot || "C:\Windows", "System32", "tar.exe");

/**
 * Extract `member` from a .zip sitting in `workDir`.
 *
 * The whole point of this script is that someone is already stuck, so it must
 * not require 7-Zip or any other install -- which is also why the manifest
 * points at the larger .zip rather than the 3x smaller .7z.
 */
function extractMember(archiveName, member, workDir) {
  if (!existsSync(BSDTAR)) {
    throw new Error(
      `Windows bsdtar not found at ${BSDTAR}. Extract ${member} by hand from the ` +
        `archive URL in SIDECARS.json.`
    );
  }
  // Run IN workDir with RELATIVE names. An absolute Windows path makes tar read
  // "C:\..." as a remote host:path spec and fail with
  // "Cannot connect to C: resolve failed" -- the drive-letter colon, not the
  // archive, is the problem.
  execFileSync(BSDTAR, ["-xf", archiveName, member], {
    cwd: workDir,
    stdio: ["ignore", "ignore", "pipe"],
  });
  return join(workDir, member);
}

async function download(url, destPath, expectedBytes) {
  say(`downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);

  // Size is a cheap sanity check on the transfer, NOT a security control --
  // the SHA-256 below is. Reported so a truncated or redirected-to-HTML
  // download says so here rather than failing confusingly at the hash.
  if (expectedBytes && buf.length !== expectedBytes) {
    say(`  note: got ${buf.length} bytes, manifest expected ${expectedBytes}`);
  }
  return destPath;
}

async function main() {
  if (process.platform !== "win32") {
    die(
      "These sidecars are Windows x86_64 builds (-x86_64-pc-windows-msvc.exe).\n" +
        "  Fetch the equivalent builds for your platform by hand and update\n" +
        "  src-tauri/bin/SIDECARS.json with their hashes."
    );
  }

  const manifestPath = join(binDir, "SIDECARS.json");
  if (!existsSync(manifestPath)) {
    die(`Missing ${manifestPath} — it names the versions and hashes to fetch.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mkdirSync(binDir, { recursive: true });

  // One archive supplies two binaries in both cases, so group the work by
  // archive and download each at most once.
  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [archiveName, archive] of Object.entries(manifest.archives)) {
    const wanted = Object.entries(archive.members).filter(([tool]) => {
      if (only && !only.has(tool)) return false;
      const entry = manifest.binaries[tool];
      if (!entry) return false;
      const dest = join(binDir, entry.file);
      if (!force && existsSync(dest) && sha256(dest) === entry.sha256) {
        say(`${tool} already present and matches the pinned build — skipping`);
        skipped++;
        return false;
      }
      return true;
    });

    if (wanted.length === 0) continue;

    const work = mkdtempSync(join(tmpdir(), "moshdither-sidecars-"));
    try {
      const archivePath = join(work, `${archiveName}.zip`);
      await download(archive.url, archivePath, archive.bytes);

      for (const [tool, member] of wanted) {
        const entry = manifest.binaries[tool];
        try {
          const extracted = extractMember(`${archiveName}.zip`, member, work);
          const actual = sha256(extracted);
          if (actual !== entry.sha256) {
            // Refuse rather than install. This is the security boundary: the
            // file is about to become something the app executes.
            console.error(
              `[fetch-external-bins] ${tool}: SHA-256 MISMATCH — not installing.\n` +
                `  expected ${entry.sha256}  (${entry.version})\n` +
                `  actual   ${actual}\n` +
                `  The publisher may have re-rolled the release, or the download\n` +
                `  was tampered with. Verify by hand before updating SIDECARS.json.`
            );
            failed++;
            continue;
          }
          copyFileSync(extracted, join(binDir, entry.file));
          const mb = (statSync(join(binDir, entry.file)).size / 1048576).toFixed(1);
          say(`installed ${entry.file} (${mb} MB, ${entry.version}) — hash verified`);
          installed++;
        } catch (e) {
          console.error(`[fetch-external-bins] ${tool}: ${e.message}`);
          failed++;
        }
      }
    } catch (e) {
      console.error(`[fetch-external-bins] ${archiveName}: ${e.message}`);
      failed += wanted.length;
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  say(`done — ${installed} installed, ${skipped} already current, ${failed} failed`);
  if (failed > 0) {
    die(
      `${failed} binar${failed === 1 ? "y" : "ies"} could not be installed.\n` +
        `  Licences: FFmpeg builds are GPLv3 and FFglitch is FFmpeg-derived;\n` +
        `  both are redistributed in the installer, so ship their licence text.`
    );
  }
}

main().catch((e) => die(e.stack || e.message));
