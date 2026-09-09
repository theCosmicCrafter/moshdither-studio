#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pythonBackend = join(projectRoot, "packages", "python-backend");

function cleanDir(dir) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === "__pycache__") {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          cleanDir(fullPath);
        }
      } else if (entry.endsWith(".pyc") || entry.endsWith(".pyo")) {
        rmSync(fullPath, { force: true });
      }
    } catch {
      // Ignore transient access errors
    }
  }
}

cleanDir(pythonBackend);
console.log("Purged __pycache__ and bytecode artifacts from packages/python-backend");
