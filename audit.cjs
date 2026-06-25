const fs = require("fs");

const converter = fs.readFileSync("src/utils/effectConverter.ts", "utf8");
const shaderIdx = fs.readFileSync("src/engine/shaders/index.ts", "utf8");
const registry = fs.readFileSync("src-tauri/src/effects/registry.rs", "utf8");

// Extract mapped Rust effect IDs
const mappedIds = [...converter.matchAll(/"([a-z_.]+)":\s*\{[^}]*shaderId/g)].map(m => m[1]);

// Extract shaderIds from mappings
const mappedShaderIds = [...converter.matchAll(/shaderId:\s*"([^"]+)"/g)].map(m => m[1]);

// Extract registered shaders
const registeredShaders = new Set(
  [...shaderIdx.matchAll(/shaderRegistry\.register\((\w+)Shader\)/g)].map(m => m[1])
);

// Extract Rust registered effect modules
const rustRegs = [...registry.matchAll(/self\.register\(super::([a-z_]+)::([A-Za-z_]+)/g)].map(m => `${m[1]}.${m[2]}`);

console.log("=== Summary ===");
console.log("Mapped Rust effect IDs:", mappedIds.length);
console.log("Mapped shader IDs:", mappedShaderIds.length);
console.log("Registered WebGL shaders:", registeredShaders.size);
console.log("Rust registered effects:", rustRegs.length);

console.log("\n=== Shaders in mapping but NOT registered in WebGL ===");
const unregistered = mappedShaderIds.filter(s => !registeredShaders.has(s));
if (unregistered.length === 0) console.log("  (none)");
else unregistered.forEach(s => console.log("  ", s));

console.log("\n=== Registered shaders NOT used in any mapping ===");
const unused = [...registeredShaders].filter(s => !mappedShaderIds.includes(s));
if (unused.length === 0) console.log("  (none)");
else unused.forEach(s => console.log("  ", s));

// Check for duplicate shaderId usage (multiple Rust effects mapping to same shader)
console.log("\n=== Shader IDs used by multiple Rust effects (shared shaders) ===");
const shaderUsage = {};
for (let i = 0; i < mappedIds.length; i++) {
  const sid = mappedShaderIds[i];
  if (!shaderUsage[sid]) shaderUsage[sid] = [];
  shaderUsage[sid].push(mappedIds[i]);
}
for (const [sid, ids] of Object.entries(shaderUsage)) {
  if (ids.length > 1) console.log(`  ${sid}: ${ids.join(", ")}`);
}

// Check fallback effects
const fallback = fs.readFileSync("src/lib/browserFallback.ts", "utf8");
const fallbackIds = [...fallback.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
console.log("\n=== Fallback (WebGL-only) effect IDs ===");
fallbackIds.forEach(id => console.log("  ", id));

// Check which fallback IDs overlap with Rust mapping
const mappedSet = new Set(mappedIds);
const overlap = fallbackIds.filter(id => mappedSet.has(id));
console.log("\n=== Fallback IDs that ALSO have Rust mapping (good - dual coverage) ===");
overlap.forEach(id => console.log("  ", id));

const fallbackOnly = fallbackIds.filter(id => !mappedSet.has(id));
console.log("\n=== Fallback IDs with NO Rust mapping (WebGL-only, no export) ===");
if (fallbackOnly.length === 0) console.log("  (none)");
else fallbackOnly.forEach(id => console.log("  ", id));
