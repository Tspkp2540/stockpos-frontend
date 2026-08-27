"use strict";

const { spawn } = require("child_process");
const path = require("path");

const port = process.env.PORT || "3000";
const serveCli = path.resolve(__dirname, "..", "node_modules", "serve", "build", "main.js");
const server = spawn(process.execPath, [serveCli, "-s", "build", "-l", port], { stdio: "inherit" });

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
