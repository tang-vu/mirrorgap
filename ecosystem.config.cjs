const { join } = require("node:path");
const { mkdirSync } = require("node:fs");
const { homedir } = require("node:os");
const logs = join(__dirname, "data", "host", "logs");
mkdirSync(logs, { recursive: true });

module.exports = {
  apps: [
    {
      name: "mirrorgap-web",
      cwd: join(__dirname, "apps", "web"),
      script: join(__dirname, "scripts", "host-service.mjs"),
      interpreter: process.execPath,
      node_args: ["--import", "tsx"],
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: "512M",
      kill_timeout: 10000,
      watch: false,
      time: true,
      out_file: join(logs, "web-out.log"),
      error_file: join(logs, "web-error.log"),
      env: { NODE_ENV: "production" },
    },
    {
      name: "mirrorgap-tunnel",
      cwd: __dirname,
      script:
        process.env.CLOUDFLARED_PATH ??
        join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "cloudflared", "cloudflared.exe"),
      interpreter: "none",
      args: ["tunnel", "--config", join(homedir(), ".cloudflared", "mirrorgap.yml"), "run"],
      autorestart: true,
      restart_delay: 5000,
      watch: false,
      time: true,
      out_file: join(logs, "tunnel-out.log"),
      error_file: join(logs, "tunnel-error.log"),
    },
  ],
};
