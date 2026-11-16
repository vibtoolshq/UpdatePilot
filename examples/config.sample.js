import { defineConfig } from "../src/index.js";

export default defineConfig({
  repo: "yourorg/your-app",
  currentVersion: process.env.APP_VERSION ?? "1.0.0",

  github: {
    token: process.env.GITHUB_TOKEN, // Optional, but recommended for private repositories and higher limits.
    includePrerelease: false,
    cacheFile: ".update-cache.json",
    cacheTTL: 300_000, // 5 minutes.
  },

  docker: {
    image: "ghcr.io/yourorg/your-app",
    tag: "latest",
    // composeFile: "./docker-compose.yml", // Uncomment to use Compose mode.
    containerName: "your-app",
    socketPath: "/var/run/docker.sock",
  },

  health: {
    url: "http://localhost:3000/health",
    retries: 5,
    timeout: 5_000,
    interval: 2_000,
    expectStatus: 200,
  },

  rollback: {
    enabled: true,
    keepImages: 3,
  },

  hooks: {
    beforeDeploy: ({ from, to }) => {
      console.log(`[update] Deploying ${from} -> ${to}`);
    },
    afterRollback: ({ version }) => {
      console.warn(`[update] Rolled back to ${version}`);
    },
  },

  logger: { level: "info", pretty: true },
});
