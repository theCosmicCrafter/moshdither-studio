#!/usr/bin/env node
/**
 * MCP server for MoshDither Studio effect verification.
 *
 * Exposes three tools:
 *   - verify_all: Run verification on all effects, returns JSON report
 *   - verify_effect: Run verification on a single effect by ID
 *   - get_status: Show environment status (effect count, categories, binary paths)
 *
 * This server wraps the `mosh-verify` CLI binary, so it requires the Rust
 * binary to be built (`cargo build --bin mosh-verify` in src-tauri/).
 *
 * MCP configuration (add to your MCP client config):
 * {
 *   "mcpServers": {
 *     "mosh-verify": {
 *       "command": "node",
 *       "args": ["path/to/mcp-servers/mosh-verify/index.js"],
 *       "env": {
 *         "MOSH_VERIFY_BIN": "path/to/src-tauri/target/debug/mosh-verify"
 *       }
 *     }
 *   }
 * }
 *
 * If MOSH_VERIFY_BIN is not set, defaults to:
 *   - ../src-tauri/target/release/mosh-verify (if exists)
 *   - ../src-tauri/target/debug/mosh-verify (if exists)
 *   - "mosh-verify" (assumes it's on PATH)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve the mosh-verify binary path. */
function resolveBinary() {
  const envPath = process.env.MOSH_VERIFY_BIN;
  if (envPath && existsSync(envPath)) return envPath;

  const repoRoot = join(__dirname, "..", "..");
  const releasePath = join(repoRoot, "src-tauri", "target", "release", "mosh-verify");
  const debugPath = join(repoRoot, "src-tauri", "target", "debug", "mosh-verify");

  // Windows: add .exe
  const ext = process.platform === "win32" ? ".exe" : "";
  const releaseExe = releasePath + ext;
  const debugExe = debugPath + ext;

  if (existsSync(releaseExe)) return releaseExe;
  if (existsSync(debugExe)) return debugExe;

  // Fall back to PATH
  return "mosh-verify" + ext;
}

const MOSH_VERIFY_BIN = resolveBinary();

/** Run the mosh-verify CLI with given args, return stdout. */
async function runVerify(args) {
  const { stdout, stderr } = await execFileAsync(MOSH_VERIFY_BIN, args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60000,
  });
  return { stdout, stderr };
}

const server = new Server(
  {
    name: "mosh-verify",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "verify_all",
      description:
        "Run verification on all registered MoshDither Studio effects. " +
        "Checks each effect for: no crashes, non-empty output, animation (output differs between time=0 and time=1), " +
        "and mask correctness (inside/outside blending modes preserve correct regions). " +
        "Returns a JSON report with pass/fail per effect. " +
        "Optionally filter by effect ID substring or category.",
      inputSchema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description:
              "Only verify effects whose ID contains this substring (e.g. 'glitch', 'dithering')",
          },
          format: {
            type: "string",
            enum: ["json", "text"],
            description: "Output format. Default: json.",
          },
        },
      },
    },
    {
      name: "verify_effect",
      description:
        "Run verification on a single MoshDither Studio effect by its ID. " +
        "Returns detailed JSON with per-check results (no_crash, non_empty_output, animates, mask_inside_correct, mask_outside_correct).",
      inputSchema: {
        type: "object",
        properties: {
          effect_id: {
            type: "string",
            description:
              "The effect ID to verify (e.g. 'color.invert', 'glitch.databend', 'dithering.bayer')",
          },
        },
        required: ["effect_id"],
      },
    },
    {
      name: "test_all",
      description:
        "Run the full functional test suite covering all MoshDither Studio pipeline functions. " +
        "Tests image I/O (PNG/JPEG encode/decode), effect application (13 representative effects), " +
        "effect stack chaining, mask blending (inside/outside/alpha), animation (14 time-based effects), " +
        "FFmpeg availability, video probe/decode, FFglitch environment, Python bridge, SAM3 model, and file I/O. " +
        "Returns JSON with per-test pass/fail, error messages, and timing. " +
        "Optionally filter results by category.",
      inputSchema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["json", "text"],
            description: "Output format. Default: json.",
          },
          category: {
            type: "string",
            description:
              "Only show results from a specific category (e.g. 'io', 'effect:color', 'mask', 'animation', 'environment', 'video', 'sam3', 'ffglitch', 'registry', 'stack')",
          },
        },
      },
    },
    {
      name: "list_effects",
      description:
        "List all registered MoshDither Studio effects with their IDs, categories, and names. " +
        "Optionally filter by category.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Filter by category (e.g. 'dithering', 'glitch', 'analog', 'color', 'noise', 'pixel_geo', 'datamoshing')",
          },
        },
      },
    },
    {
      name: "get_status",
      description:
        "Show MoshDither Studio environment status: total effect count, breakdown by category, " +
        "Rust version, and build profile. Useful for checking if the verification system is operational.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "verify_all": {
        const cliArgs = ["verify-all", "--format", args?.format || "json"];
        if (args?.filter) {
          cliArgs.push("--filter", args.filter);
        }
        const { stdout } = await runVerify(cliArgs);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "verify_effect": {
        const effectId = args?.effect_id;
        if (!effectId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: effect_id is required",
              },
            ],
            isError: true,
          };
        }
        const { stdout } = await runVerify(["verify-effect", effectId]);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "list_effects": {
        const cliArgs = ["list-effects"];
        if (args?.category) {
          cliArgs.push("--category", args.category);
        }
        const { stdout } = await runVerify(cliArgs);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "test_all": {
        const cliArgs = ["test-all", "--format", args?.format || "json"];
        if (args?.category) {
          cliArgs.push("--category", args.category);
        }
        const { stdout } = await runVerify(cliArgs);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      case "get_status": {
        const { stdout } = await runVerify(["status"]);
        return {
          content: [
            {
              type: "text",
              text: stdout,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errMsg}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`mosh-verify MCP server started (binary: ${MOSH_VERIFY_BIN})`);
