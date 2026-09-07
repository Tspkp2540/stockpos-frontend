"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || "3000";
const projectRoot = path.resolve(__dirname, "..");
const buildDirectory = path.resolve(projectRoot, "build");
const buildIndex = path.resolve(buildDirectory, "index.html");
const serveCli = path.resolve(__dirname, "..", "node_modules", "serve", "build", "main.js");
const viteCli = path.resolve(__dirname, "..", "node_modules", "vite", "bin", "vite.js");

const startServer = () => {
  const server = spawn(process.execPath, [serveCli, "-s", buildDirectory, "-l", port], { stdio: "inherit" });
  server.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
};

if (fs.existsSync(buildIndex)) {
  startServer();
} else {
  console.log("Building the production bundle before starting the server...");
  const build = spawn(process.execPath, [viteCli, "build"], { stdio: "inherit" });
  build.on("exit", (code) => {
    if (code === 0) startServer();
    else process.exitCode = code ?? 1;
  });
}
