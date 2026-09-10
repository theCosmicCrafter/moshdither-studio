/**
 * Generate LUT preview thumbnails for the LUT Library panel.
 *
 * The panel used to list 35 LUTs as plain text buttons, so choosing a look
 * meant applying it and undoing until something fit. These thumbnails let you
 * see what each LUT does before committing to it.
 *
 * The sample is a four-quadrant reference built from three free-use stock
 * photographs plus one synthetic band (see assets/lut-preview-samples/README.md):
 *
 *   portrait  | mountain     skin tone, and neutral whites + blue sky + greens
 *   landscape | grey ramp    saturated greens/warm sunset, and a neutral ramp
 *
 * Photographs alone are not enough -- the grey ramp is what exposes crushed
 * blacks, lifted shadows and colour casts, which is most of what a grade LUT
 * does and which no photograph shows as legibly. Equally, a chart alone was not
 * enough: skin tone is the surface where a bad grade is most obvious, and a
 * synthetic swatch does not stand in for a face.
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

// 512x512 quadrants: portrait | mountain over landscape | grey ramp.
const sampleDir = join(projectRoot, "assets", "lut-preview-samples");
for (const f of ["portrait.jpg", "mountain.jpg", "landscape.jpg"]) {
  if (!existsSync(join(sampleDir, f))) fail(`missing preview sample: ${join(sampleDir, f)}`);
}
// The ramp is drawn with `geq` from an explicit per-pixel expression, not with
// the `gradients` source. `gradients` animates, and rendering a single frame of
// it produced a *different image on every invocation* -- three consecutive runs
// gave three different checksums. That silently varied the ramp's tonal range
// (sometimes nearly blown out) and made thumbnail output non-reproducible,
// which the --check guard in prebuild depends on. `geq` is byte-identical
// across runs.
const ramp = join(tmp, "ramp.png");
run(ffmpeg, [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", "color=c=black:s=256x256",
  "-vf", "geq=r='X*255/(W-1)':g='X*255/(W-1)':b='X*255/(W-1)'",
  "-frames:v", "1", "-pix_fmt", "rgb24", ramp,
]);
run(ffmpeg, [
  "-y", "-v", "error",
  "-i", join(sampleDir, "portrait.jpg"),
  "-i", join(sampleDir, "mountain.jpg"),
  "-i", join(sampleDir, "landscape.jpg"),
  "-i", ramp,
  "-filter_complex",
  "[0:v]scale=256:256[a];[1:v]scale=256:256[b];[2:v]scale=256:256[c];[3:v]scale=256:256[d];" +
    "[a][b]hstack[top];[c][d]hstack[bot];[top][bot]vstack[out]",
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
if (!process.env.LUT_THUMBS_KEEP_TMP) rmSync(tmp, { recursive: true, force: true });
console.log(`[lut-thumbs] wrote ${written} thumbnails to public/lut/thumbs (${(bytes / 1024).toFixed(0)} KB total)`);
