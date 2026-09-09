#!/usr/bin/env node
/**
 * Publish the SAM3 add-on: the bridge sidecar and (optionally) the model
 * checkpoint, split into GitHub-sized parts, hashed, and described by a
 * manifest the app downloads at runtime.
 *
 *   node scripts/publish-sam3-addon.mjs --print-hash
 *   node scripts/publish-sam3-addon.mjs                 # stage locally only
 *   node scripts/publish-sam3-addon.mjs --upload        # ... and push to GitHub
 *
 * WHY PARTS. GitHub Releases caps one asset at 2 GB on the free plan, and the
 * sidecar is ~2.9 GB, so it cannot be a single asset. Parts are joined and
 * verified by src-tauri/src/sam3_addon.rs, which checks each part's hash as it
 * downloads AND the assembled whole before installing anything.
 *
 * WHY THE HASH IS ALSO IN THE RUST. The app pins EXPECTED_SIDECAR_SHA256 at
 * compile time and refuses any sidecar that does not match, so this manifest
 * can move bytes around but cannot change WHICH program gets executed. After
 * building a new sidecar you must therefore update that constant and ship an
 * app release -- `--print-hash` gives you the value. This is deliberate: the
 * alternative is a remote file deciding what code runs on a user's machine.
 *
 * LICENCE OBLIGATION. The SAM License §1.b.i requires that a copy of the
 * Agreement accompany any redistribution of the weights. When the checkpoint is
 * published, licenses/SAM-LICENSE.txt is uploaded to the same release, and the
 * app shows it before downloading. Do not remove that step.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

const REPO = "theCosmicCrafter/moshdither-studio";
const TAG = "sam3-addon-v1";
/** Under GitHub's 2 GB asset ceiling with room to spare. */
const PART_BYTES = 1_900_000_000;
const TARGET = "x86_64-pc-windows-msvc";

const SIDECAR = join(projectRoot, "src-tauri", "bin", `sam3-bridge-${TARGET}.exe`);
const CHECKPOINT = join(homedir(), ".moshdither", "models", "sam3", "sam3.pt");
const STAGING = join(projectRoot, "build-archive", "sam3-addon");
const SAM_LICENSE = join(projectRoot, "licenses", "SAM-LICENSE.txt");

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const say = (m) => console.log(`[sam3-addon] ${m}`);
const die = (m) => {
  console.error(`[sam3-addon] ${m}`);
  process.exit(1);
};

function sha256File(path) {
  const h = createHash("sha256");
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(8 * 1024 * 1024);
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return h.digest("hex");
}

/** Split `src` into <=PART_BYTES chunks named `<base>.partN`, hashing each. */
function split(src, base, outDir) {
  const total = statSync(src).size;
  const count = Math.ceil(total / PART_BYTES);
  const parts = [];
  const fd = openSync(src, "r");
  const buf = Buffer.alloc(8 * 1024 * 1024);
  try {
    for (let i = 0; i < count; i++) {
      const name = `${base}.part${i}`;
      const dest = join(outDir, name);
      const out = openSync(dest, "w");
      const h = createHash("sha256");
      let written = 0;
      try {
        while (written < PART_BYTES) {
          const want = Math.min(buf.length, PART_BYTES - written);
          const n = readSync(fd, buf, 0, want, null);
          if (n === 0) break;
          writeSync(out, buf, 0, n);
          h.update(buf.subarray(0, n));
          written += n;
        }
      } finally {
        closeSync(out);
      }
      parts.push({ name, bytes: written, sha256: h.digest("hex") });
      say(`  ${name}  ${(written / 1048576).toFixed(0)} MB`);
    }
  } finally {
    closeSync(fd);
  }
  return { total, parts };
}

const assetUrl = (name) => `https://github.com/${REPO}/releases/download/${TAG}/${name}`;

function main() {
  if (!existsSync(SIDECAR)) {
    die(
      `Sidecar not found at ${SIDECAR}\n` +
        `  Build it first:  npm run build:sam3-sidecar`
    );
  }

  if (has("--print-hash")) {
    // Printed alone so it can be piped straight into an edit of
    // EXPECTED_SIDECAR_SHA256 in src-tauri/src/sam3_addon.rs.
    console.log(sha256File(SIDECAR));
    return;
  }

  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });

  say(`splitting sidecar (${(statSync(SIDECAR).size / 1048576).toFixed(0)} MB)`);
  const side = split(SIDECAR, "sam3-bridge", STAGING);
  const sidecarSha = sha256File(SIDECAR);
  say(`sidecar sha256 ${sidecarSha}`);

  const manifest = {
    schemaVersion: 1,
    _comment: [
      "Locations only. The app pins the sidecar's SHA-256 at compile time and",
      "refuses anything else, so editing the hash here cannot change which",
      "program runs -- it only makes the download fail. Publish a new app",
      "release to change the sidecar.",
    ],
    target: TARGET,
    sidecar: {
      target: TARGET,
      bytes: side.total,
      sha256: sidecarSha,
      parts: side.parts.map((p) => ({
        url: assetUrl(p.name),
        bytes: p.bytes,
        sha256: p.sha256,
      })),
    },
  };

  // The checkpoint is optional. Without it the app still installs the sidecar
  // and the bridge falls back to Hugging Face, which needs the user's own
  // gated access -- the whole point of mirroring is to remove that step.
  let ck = null;
  if (existsSync(CHECKPOINT)) {
    say(`splitting checkpoint (${(statSync(CHECKPOINT).size / 1048576).toFixed(0)} MB)`);
    ck = split(CHECKPOINT, "sam3", STAGING);
    manifest.checkpoint = {
      bytes: ck.total,
      sha256: sha256File(CHECKPOINT),
      parts: ck.parts.map((p) => ({
        url: assetUrl(p.name),
        bytes: p.bytes,
        sha256: p.sha256,
      })),
    };
    if (!existsSync(SAM_LICENSE)) {
      die(
        `Refusing to publish the weights without ${SAM_LICENSE}.\n` +
          `  The SAM License §1.b.i requires a copy of the Agreement to accompany\n` +
          `  any redistribution of the SAM Materials.`
      );
    }
  } else {
    say(`no checkpoint at ${CHECKPOINT} — publishing the sidecar only`);
  }

  const manifestPath = join(STAGING, "sam3-assets.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  say(`wrote ${manifestPath}`);

  if (!has("--upload")) {
    say("staged only. Re-run with --upload to publish, after checking the manifest.");
    say(`Remember: EXPECTED_SIDECAR_SHA256 in src-tauri/src/sam3_addon.rs must be`);
    say(`  ${sidecarSha}`);
    return;
  }

  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
  } catch {
    die("The GitHub CLI (gh) is not installed or not on PATH. See https://cli.github.com");
  }

  const uploads = [manifestPath, ...side.parts.map((p) => join(STAGING, p.name))];
  if (ck) {
    // The Agreement travels with the weights -- SAM License 1.b.i.
    uploads.push(SAM_LICENSE);
    for (const p of ck.parts) uploads.push(join(STAGING, p.name));
  }

  // Create the release if it does not exist; otherwise just add/replace assets.
  try {
    execFileSync("gh", ["release", "view", TAG, "--repo", REPO], { stdio: "ignore" });
    say(`release ${TAG} exists — uploading assets with --clobber`);
  } catch {
    say(`creating release ${TAG}`);
    execFileSync(
      "gh",
      [
        "release", "create", TAG,
        "--repo", REPO,
        "--title", "SAM3 add-on",
        "--notes",
        "Downloadable SAM3 segmentation add-on for MoshDither Studio.\n\n" +
          "These files are fetched by the app on request; they are too large for " +
          "a Windows installer (>2 GiB per file).\n\n" +
          "The model weights are Meta's SAM 3, used under the SAM License, a copy " +
          "of which is included here as SAM-LICENSE.txt and shown in the app " +
          "before download.",
      ],
      { stdio: "inherit" }
    );
  }

  execFileSync("gh", ["release", "upload", TAG, "--repo", REPO, "--clobber", ...uploads], {
    stdio: "inherit",
  });
  say("uploaded.");
  say(`Verify EXPECTED_SIDECAR_SHA256 in src-tauri/src/sam3_addon.rs is ${sidecarSha}`);
}

main();
