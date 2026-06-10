/**
 * Development launcher for Electron app.
 * Removes ELECTRON_RUN_AS_NODE from the environment before spawning Vite,
 * which prevents Electron's internal module loader from being bypassed.
 */
const { spawn } = require("child_process");

// Remove the env var that breaks Electron's require('electron') on Windows
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["vite"];
const command = args[0];
const commandArgs = args.slice(1);

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
