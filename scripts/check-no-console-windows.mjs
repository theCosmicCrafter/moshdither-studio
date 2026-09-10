#!/usr/bin/env node
/**
 * Fail the build if anything can pop a console window at the user.
 *
 * This app is a GUI, and every external tool it runs -- ffmpeg, ffprobe, ffgac,
 * ffedit, mosh-cli, the SAM3 bridge -- is a CONSOLE-subsystem executable. On
 * Windows, starting one from a GUI process makes Windows allocate a console,
 * so a black command-prompt window flashes up and, for a long export, SITS
 * there in front of the user.
 *
 * It has been missed twice, in two different languages:
 *
 *   1. All 27 Rust spawn sites used bare `Command::new` with no
 *      CREATE_NO_WINDOW. Fixed by routing them through `crate::proc::command`.
 *   2. Fixing the Rust side was not enough: `mosh_cli.py` and
 *      `DatamoshLib/FFG_effects/basic_modes.py` spawn ffmpeg/ffgac THEMSELVES,
 *      and Python's subprocess creates a console for every child unless told
 *      otherwise. The window came back for datamosh exports.
 *
 * Both layers are checked here, because "I fixed the obvious one" is exactly
 * how this reached the user the second time.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // sam3_repo is Meta's vendored checkout -- not ours to edit, and its
      // subprocess use is inside training code the app never runs.
      // `target` and `build` hold Tauri's COPIES of these same files as build
      // output. Scanning those reports each real problem three times and, worse,
      // keeps reporting a fixed one until the next build refreshes the copy.
      if (
        name === "sam3_repo" ||
        name === "node_modules" ||
        name === "__pycache__" ||
        name === "target" ||
        name === "build"
      )
        continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

// ── Rust ────────────────────────────────────────────────────────────────────
// `Command::new` is allowed only in proc.rs (which defines the wrapper) and in
// the CLI verifier's own tests, which run in a terminal that already exists.
const RUST_ALLOWED = ["src-tauri/src/proc.rs", "src-tauri/src/effects/functional_tests.rs"];
for (const file of walk(join(root, "src-tauri", "src")).filter((f) => f.endsWith(".rs"))) {
  const rel = relative(root, file).split(sep).join("/");
  if (RUST_ALLOWED.includes(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // Matches the fully-qualified `std::process::Command::new(` as well as the
    // bare form. An earlier version excluded anything preceded by a colon,
    // which let the qualified spelling -- just as capable of popping a window --
    // straight through. The wrapper is `crate::proc::command` (lowercase), so
    // any `Command::new` outside the allowed files is the thing being banned.
    if (/\bCommand::new\s*\(/.test(line) && !line.trim().startsWith("//")) {
      problems.push(
        `${rel}:${i + 1}  bare Command::new -- use crate::proc::command so no console window appears`
      );
    }
  });
}

// ── Python ──────────────────────────────────────────────────────────────────
// Every spawn must pass the CREATE_NO_WINDOW kwargs bundle.
const PY_ROOTS = [join(root, "packages", "python-backend"), join(root, "src-tauri")];
for (const base of PY_ROOTS) {
  let files;
  try {
    files = walk(base).filter((f) => f.endsWith(".py"));
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(root, file).split(sep).join("/");
    // Strip docstrings and comments first. basic_modes.py DOCUMENTS the
    // `subprocess.call(..., shell=True)` it replaced, and matching prose would
    // fail the build over a comment that exists to explain the fix.
    const src = readFileSync(file, "utf8")
      .replace(/"""[\s\S]*?"""/g, "")
      .replace(/'''[\s\S]*?'''/g, "")
      .replace(/^[ \t]*#.*$/gm, "");
    // Join continuation lines so a call split across lines is seen whole.
    const flat = src.replace(/\(\s*\n/g, "(").replace(/,\s*\n\s*/g, ", ");
    const calls = flat.match(/subprocess\.(run|Popen|call|check_output|check_call)\s*\([^)]*\)/g);
    if (!calls) continue;
    for (const call of calls) {
      if (!call.includes("_NO_WINDOW") && !call.includes("creationflags")) {
        problems.push(
          `${rel}  ${call.slice(0, 70).replace(/\s+/g, " ")}...  -- add **_NO_WINDOW so no console window appears`
        );
      }
    }
  }
}

if (problems.length) {
  console.error("[check-no-console-windows] spawns that can flash a console at the user:\n");
  for (const p of problems) console.error("  " + p);
  console.error(
    "\n  A GUI app must not pop command prompts. See src-tauri/src/proc.rs for the\n" +
      "  Rust wrapper and the _NO_WINDOW bundle in mosh_cli.py for the Python one.\n"
  );
  process.exit(1);
}
console.log("[check-no-console-windows] no unguarded process spawns");
