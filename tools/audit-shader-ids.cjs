const fs = require("fs");

const converter = fs.readFileSync("src/utils/effectConverter.ts", "utf8");
const shaderIdx = fs.readFileSync("src/engine/shaders/index.ts", "utf8");

// Extract shaderIds from mappings
const mappedShaderIds = [...converter.matchAll(/shaderId:\s*"([^"]+)"/g)].map(m => m[1]);

// Extract all shader file IDs by reading each shader file
const shaderDir = fs.readdirSync("src/engine/shaders").filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "registry.ts");
const actualShaderIds = new Set();
for (const file of shaderDir) {
  const content = fs.readFileSync(`src/engine/shaders/${file}`, "utf8");
  const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
  if (idMatch) actualShaderIds.add(idMatch[1]);
}

console.log("=== Actual shader IDs registered ===");
console.log([...actualShaderIds].sort().join(", "));

console.log("\n=== Mapped shader IDs NOT in actual shader files ===");
const missing = mappedShaderIds.filter(sid => !actualShaderIds.has(sid));
if (missing.length === 0) console.log("  (none - all good!)");
else missing.forEach(s => console.log("  ", s));

console.log("\n=== Shader files with IDs NOT used in any mapping ===");
const unused = [...actualShaderIds].filter(sid => !mappedShaderIds.includes(sid));
if (unused.length === 0) console.log("  (none)");
else unused.forEach(s => console.log("  ", s));
