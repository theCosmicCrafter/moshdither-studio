/**
 * Generate LUT preview thumbnails for the LUT Library panel.
 *
 * The panel used to list 35 LUTs as plain text buttons, so choosing a look
 * meant applying it and undoing until something fit. These thumbnails let you
 * see what each LUT does before committing to it.
 *
 * The sample is synthetic and generated here rather than shipped as a photo:
 * the repo has no photographic asset that is ours to redistribute, and a
 * reference chart is actually more informative for a colour transform than a
 * photo would be. It carries a hue sweep (shows hue rotation), a neutral grey
 * ramp (shows crushed blacks, lifted shadows and colour casts, which are what
 * a grade LUT mostly does) and saturated primaries plus skin-tone patches.
 *
 * Thumbnails are committed, so no build step depends on FFmpeg or the Rust
 * binary. Re-run this only when LUTs are added or removed.
 *
 * Usage: node scripts/generate-lut-thumbs.mjs [--check]
 *        --check  verify every LUT has a thumbnail; exit 1 if not (no writes)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const lutDir = join(projectRoot, "public", "lut");
const thumbDir = join(lutDir, "thumbs");
const checkOnly = process.argv.includes("--check");

const lutNames = readdirSync(lutDir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .map((f) => f.replace(/\.png$/i, ""))
  .sort();

if (checkOnly) {
  const missing = lutNames.filter((n) => !existsSync(join(thumbDir, `${n}.jpg`)));
  const orphaned = existsSync(thumbDir)
    ? readdirSync(thumbDir)
        .filter((f) => f.endsWith(".jpg"))
        .map((f) => f.replace(/\.jpg$/, ""))
        .filter((n) => !lutNames.includes(n))
    : [];
  if (missing.length || orphaned.length) {
    if (missing.length) console.error(`[lut-thumbs] missing thumbnail: ${missing.join(", ")}`);
    if (orphaned.length) console.error(`[lut-thumbs] thumbnail with no LUT: ${orphaned.join(", ")}`);
    console.error("[lut-thumbs] run: node scripts/generate-lut-thumbs.mjs");
    process.exit(1);
  }
  console.log(`[lut-thumbs] OK - ${lutNames.length} LUTs, ${lutNames.length} thumbnails`);
  process.exit(0);
}

const isWin = process.platform === "win32";
const exe = isWin ? ".exe" : "";
const ffmpeg = [
  join(projectRoot, "src-tauri", "bin", `ffmpeg-x86_64-pc-windows-msvc${exe}`),
  join(projectRoot, "src-tauri", "bin", `ffmpeg${exe}`),
  join(projectRoot, "src-tauri", "target", "release", `ffmpeg${exe}`),
].find(existsSync);
const verify = join(projectRoot, "src-tauri", "target", "release", `mosh-verify${exe}`);

if (!ffmpeg) fail("FFmpeg sidecar not found under src-tauri/bin");
if (!existsSync(verify))
  fail("mosh-verify not built - run: cargo build --release --bin mosh-verify --manifest-path src-tauri/Cargo.toml");

function fail(msg) {
  console.error(`[lut-thumbs] ${msg}`);
  process.exit(1);
}
function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) fail(`${bin} failed (${r.status}):\n${(r.stderr || "").slice(-1500)}`);
  return r;
}

const tmp = join(projectRoot, "outputs", ".lut-thumbs-tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const sample = join(tmp, "sample.png");

// 512x512: hue sweep band, neutral grey ramp, primaries and skin tones.
run(ffmpeg, [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", "gradients=s=512x170:c0=#FF0000:c1=#00FF00:c2=#0000FF:x0=0:y0=0:x1=512:y1=0:nb_colors=3,format=rgb24",
  "-f", "lavfi", "-i", "gradients=s=512x171:c0=black:c1=white:x0=0:y0=0:x1=512:y1=0,format=rgb24",
  "-f", "lavfi", "-i", "gradients=s=512x171:c0=#F1C27D:c1=#8D5524:x0=0:y0=0:x1=512:y1=0,format=rgb24",
  "-filter_complex", "[0:v][1:v][2:v]vstack=inputs=3[out]",
  "-map", "[out]", "-frames:v", "1", sample,
]);

console.log(`[lut-thumbs] rendering ${lutNames.length} LUTs...`);
run(verify, ["render-luts", "--image", sample, "--lut-dir", lutDir, "--output", join(tmp, "full")]);

mkdirSync(thumbDir, { recursive: true });
let written = 0;
let bytes = 0;
for (const name of lutNames) {
  const src = join(tmp, "full", `${name}.png`);
  if (!existsSync(src)) {
    console.warn(`[lut-thumbs] no render for ${name}, skipping`);
    continue;
  }
  const dst = join(thumbDir, `${name}.jpg`);
  run(ffmpeg, ["-y", "-v", "error", "-i", src, "-vf", "scale=120:-1", "-q:v", "6", dst]);
  written++;
  bytes += statSync(dst).size;
}
rmSync(tmp, { recursive: true, force: true });
console.log(`[lut-thumbs] wrote ${written} thumbnails to public/lut/thumbs (${(bytes / 1024).toFixed(0)} KB total)`);
