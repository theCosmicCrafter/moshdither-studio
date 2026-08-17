#!/usr/bin/env node
/**
 * Subsets the Material Symbols Outlined icon font to only the glyphs used by
 * the application, then writes a self-hosted CSS file into public/fonts.
 *
 * The subset is generated from Google Fonts using the `icon_names` parameter.
 * The resulting font files are downloaded and served locally so the desktop
 * app works offline.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
const publicFontsDir = join(projectRoot, "public", "fonts");
const iconsManifestPath = join(publicFontsDir, "material-symbols-outlined.icons.json");
const cssPath = join(publicFontsDir, "material-symbols-outlined.css");
const mainTsxPath = join(projectRoot, "src", "main.tsx");
const indexHtmlPath = join(projectRoot, "index.html");

// Fallback icons that are hard to extract from arbitrary JSX/TS expressions.
const EXTRA_ICONS = new Set([
  "arrow_right_alt",
  "arrow_left_alt",
  "arrow_downward",
  "arrow_upward",
  "skip_previous",
  "skip_next",
  "chevron_left",
  "chevron_right",
  "play_arrow",
  "pause",
  "repeat",
  "speed",
  "timer",
  "undo",
  "redo",
  "delete_sweep",
  "zoom_out",
  "zoom_in",
  "keyboard",
  "light_mode",
  "dark_mode",
  "toggle_on",
  "toggle_off",
  "check_box",
  "check_box_outline_blank",
  "expand_more",
  "expand_less",
  "opacity",
  "dock_to_right",
  "close",
  "drag_indicator",
  "image",
  "folder_open",
  // "movie_export" was pinned here, but no such glyph exists in Material
  // Symbols (checked against all 4226 names in Google's icon metadata). The
  // Fonts API silently ignores unknown names rather than erroring, so the
  // subset was requested and built without it and the two call sites rendered
  // the raw ligature text "movie_export" instead of an icon. Those now use
  // "movie", which parallels the "image" glyph on the sibling Save Image item
  // and is picked up from source automatically.
  "bug_report",
  "delete",
  "visibility",
  "visibility_off",
  "lock",
  "tune",
  "palette",
  "diamond",
  "layers",
  "add_circle",
  "search",
  "auto_awesome",
  "check_circle",
  "center_focus_strong",
  "file_upload",
  "fullscreen",
  "aspect_ratio",
  "more_vert",
  "hard_drive",
  "monitor",
  "edit",
  "ink_eraser",
  "crop_square",
  "circle",
  "hexagon",
  "flip",
  "grain",
  "videocam",
  "grid_on",
  "broken_image",
  "texture",
  "brush",
  "auto_fix_high",
  "masks",
  "grid_3x3",
  "cloud_sync",
  "view_timeline",
  "verified",
  "bookmark",
  "cut",
  "file_export",
  "graphic_eq",

  // Window controls (used in WindowControls.tsx; ternary expressions can be missed by regex extraction)
  "minimize",
  "maximize",
  "filter_none",
  "fullscreen_exit",
  "unfold_more",
  // Neither "magnet" nor "audio" is a real Material Symbols name, so the Fonts
  // API quietly built the subset without them and their call sites rendered the
  // ligature text ("MAGNET" in the window toolbar). Replaced in source by
  // border_outer (edge snapping) and graphic_eq (audio binding, matching the
  // Audio Reactive panel's own icon).
  "border_outer"
]);

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      yield* walk(path);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      yield path;
    }
  }
}

function extractIconNames(source) {
  const found = new Set();

  // Panel / category / manual tool registries with `icon: "..."` or `icon="..."`.
  const iconProp = /icon\s*:\s*"([^"]+)"|icon\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = iconProp.exec(source))) {
    const name = m[1] || m[2];
    if (name) found.add(name);
  }

  // Extract text or conditional string literals inside elements whose className
  // contains `material-symbols-outlined`.
  const elementRe =
    /<(?:span|button|i|em|b|strong|div|small)\b[^>]*?className\s*=\s*(?:\{`?|`?{["'][^}]*?material-symbols-outlined[^}]*?`?["']}?|"[^"]*?material-symbols-outlined[^"]*?"|{[^}]*?`[^`]*?material-symbols-outlined[^`]*?`[^}]*?})[^>]*?>([\s\S]*?)<\/\1>/g;
  const classNameClassRe = /className\s*=\s*(?:\{[^}]*?\}|"[^"]*"|`[^`]*`)/;

  // Scan every element whose className contains the symbol class and take its
  // text / conditional children as icon names.
  //
  // The attribute region is walked character by character rather than matched
  // with `[^>]*`, because that stops at the FIRST `>` in the tag -- and an
  // `onClick={() => ...}` prop contains one. Every element with an arrow
  // function in its props was therefore cut short before its className was
  // seen, and its icon silently dropped out of the subset. Since a missing
  // glyph renders as the ligature's literal text, that shipped buttons reading
  // "save", "download", "upload" and "bolt" instead of icons.
  //
  // Brace depth is enough to fix it: in JSX an arrow function is always inside
  // `{...}`, so the tag's real `>` is the first one at depth zero outside a
  // string.
  const openRe = /<(span|button|i|em|b|strong|div|small)\b/g;
  while ((m = openRe.exec(source))) {
    const tag = m[1];
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let i = m.index + m[0].length; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote && source[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const attrs = source.slice(m.index, end);
    if (!attrs.includes("material-symbols-outlined")) continue;
    if (source[end - 1] === "/") continue; // self-closing, no children
    const close = source.indexOf(`</${tag}>`, end);
    if (close < 0) continue;
    const content = source.slice(end + 1, close);

    // Static text like `>image<`
    const staticText = content.trim();
    if (/^[a-z0-9_]+$/.test(staticText)) {
      found.add(staticText);
    }
    // Any double-quoted string inside the children (ternary / variable)
    const stringLitRe = /"([a-z0-9_]+)"/g;
    let sm;
    while ((sm = stringLitRe.exec(content))) {
      found.add(sm[1]);
    }
  }

  // Catch `icon: "value"` in object literals that may span multiple lines.
  const iconKeyRe = /icon\s*:\s*['"]([a-z0-9_]+)['"]/g;
  while ((m = iconKeyRe.exec(source))) {
    found.add(m[1]);
  }

  return found;
}

function isCssUpToDate(iconSet) {
  if (!existsSync(cssPath) || !existsSync(iconsManifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(iconsManifestPath, "utf8"));
    const current = [...iconSet].sort().join(",");
    return manifest.icons === current;
  } catch {
    return false;
  }
}

async function fetchGoogleFontsCss(iconNames) {
  const sorted = [...iconNames].sort().join(",");
  const url =
    `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined` +
    `:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200` +
    `&icon_names=${sorted}&display=block`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Fonts returned ${res.status}: ${res.statusText}`);
  return res.text();
}

async function downloadFont(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download font (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buffer);
  return buffer.length;
}

function rewriteCssUrls(css, baseUrl) {
  const fontUrls = [];
  const rewritten = css.replace(
    /src:\s*url\(([^)]+)\)\s*format\('truetype'\)/g,
    (match, urlRaw) => {
      const url = urlRaw.replace(/^['"]|['"]$/g, "");
      const filename = `material-symbols-outlined-${fontUrls.length}.ttf`;
      fontUrls.push({ url, filename });
      return `src: url("${filename}") format("truetype")`;
    }
  );
  return { css: rewritten, fontUrls };
}

async function main() {
  mkdirSync(publicFontsDir, { recursive: true });

  const sourceFiles = [];
  const srcDir = join(projectRoot, "src");
  for await (const path of walk(srcDir)) {
    sourceFiles.push(path);
  }

  const found = new Set([...EXTRA_ICONS]);
  for (const path of sourceFiles) {
    const source = readFileSync(path, "utf8");
    const names = extractIconNames(source);
    for (const n of names) found.add(n);
  }

  if (isCssUpToDate(found)) {
    console.log(`[subset-material-symbols] Up-to-date for ${found.size} icons`);
    return;
  }

  // --check verifies the committed subset matches the icons referenced in
  // source, without hitting the network. Adding or renaming a glyph without
  // re-subsetting is invisible at build time -- the ligature simply fails to
  // form and the raw name is painted into the UI -- and that has now happened
  // twice, so `prebuild` runs this and fails loudly instead.
  if (process.argv.includes("--check")) {
    let manifest = { icons: "" };
    try {
      manifest = JSON.parse(readFileSync(iconsManifestPath, "utf8"));
    } catch {
      /* treated as empty below */
    }
    const have = new Set((manifest.icons || "").split(",").filter(Boolean));
    const missing = [...found].filter((n) => !have.has(n)).sort();
    const extra = [...have].filter((n) => !found.has(n)).sort();
    console.error("[subset-material-symbols] Icon subset is stale.");
    if (missing.length) {
      console.error(`  Referenced in source but not in the font: ${missing.join(", ")}`);
      console.error("  These render as their literal ligature name in the UI.");
    }
    if (extra.length) console.error(`  In the font but unreferenced: ${extra.join(", ")}`);
    console.error("  Run `npm run subset:icons` and commit public/fonts/.");
    process.exit(1);
  }

  console.log(`[subset-material-symbols] Generating subset for ${found.size} icons...`);

  const googleCss = await fetchGoogleFontsCss(found);
  const { css, fontUrls } = rewriteCssUrls(googleCss);

  let totalBytes = 0;
  for (const { url, filename } of fontUrls) {
    const dest = join(publicFontsDir, filename);
    const bytes = await downloadFont(url, dest);
    totalBytes += bytes;
    console.log(
      `[subset-material-symbols] Downloaded ${filename} (${(bytes / 1024).toFixed(1)} KB)`
    );
  }

  writeFileSync(cssPath, css);
  writeFileSync(
    iconsManifestPath,
    JSON.stringify(
      { icons: [...found].sort().join(","), generatedAt: new Date().toISOString() },
      null,
      2
    )
  );

  // Replace the npm package import with a self-hosted stylesheet link.
  let mainTsx = readFileSync(mainTsxPath, "utf8");
  mainTsx = mainTsx.replace(/import\s+["']material-symbols\/outlined\.css["'];?\n?/, "");
  writeFileSync(mainTsxPath, mainTsx);

  let indexHtml = readFileSync(indexHtmlPath, "utf8");
  const linkTag = `<link rel="stylesheet" href="/fonts/material-symbols-outlined.css" />`;
  if (!indexHtml.includes(linkTag)) {
    indexHtml = indexHtml.replace(/(<link rel="icon"[^>]+>)/, `$1\n    ${linkTag}`);
    writeFileSync(indexHtmlPath, indexHtml);
  }

  console.log(`[subset-material-symbols] Wrote ${cssPath}`);
  console.log(`[subset-material-symbols] Total font payload: ${(totalBytes / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error(`[subset-material-symbols] ${e.message}`);
  process.exit(1);
});
