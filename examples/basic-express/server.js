// SECURITY: This demo binds to loopback but has NO authentication.
// Add authentication and authorization before exposing it beyond localhost.
import express from "express";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ConfigError,
  RollbackError,
  UpdateInProgressError,
  UpdatePilot,
  defineConfig,
  isUpdatePilotError,
} from "../../src/index.js";

const demoMode = process.env.UPDATE_PILOT_DEMO !== "0";

function validateRealModeSettings() {
  if (process.env.COMPOSE_FILE)
    throw new Error(
      "Real mode does not support COMPOSE_FILE; Compose deployments are disabled",
    );
  const required = [
    "GITHUB_REPOSITORY",
    "APP_VERSION",
    "DOCKER_IMAGE",
    "HEALTH_URL",
    "TRAFFIC_ROUTER_MODULE",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length)
    throw new Error(`Real mode requires: ${missing.join(", ")}`);
}

async function loadTrafficRouter() {
  if (demoMode) return undefined;
  const modulePath = process.env.TRAFFIC_ROUTER_MODULE;
  if (!modulePath) throw new Error("TRAFFIC_ROUTER_MODULE is required");
  let loaded;
  try {
    loaded = await import(
      pathToFileURL(resolve(process.cwd(), modulePath)).href
    );
  } catch (error) {
    throw new Error(`Could not load traffic router module: ${modulePath}`, {
      cause: error,
    });
  }
  const trafficRouter = loaded.default ?? loaded.trafficRouter;
  if (
    !trafficRouter ||
    typeof trafficRouter.prepare !== "function" ||
    typeof trafficRouter.switch !== "function" ||
    typeof trafficRouter.rollback !== "function"
  )
    throw new Error(
      "TRAFFIC_ROUTER_MODULE must export a router with prepare(), switch(), and rollback()",
    );
  return trafficRouter;
}

if (!demoMode) validateRealModeSettings();

const currentVersion = process.env.APP_VERSION ?? "1.0.0";
const userConfig = {
  repo: process.env.GITHUB_REPOSITORY ?? "your-org/your-app",
  currentVersion,
  github: { token: process.env.GITHUB_TOKEN },
  docker: {
    image: process.env.DOCKER_IMAGE ?? "ghcr.io/your-org/your-app",
    tag: currentVersion,
    containerName: "update-pilot-demo",
  },
  health: {
    url: process.env.HEALTH_URL ?? "http://127.0.0.1:3000/health",
    retries: 3,
    timeout: 2_000,
    interval: 500,
  },
  rollback: { enabled: true, keepImages: 3 },
  logger: { level: "info" },
};
const config = defineConfig(userConfig);

const demoAdapters = demoMode
  ? {
      githubAdapter: {
        check: async () => ({
          updateAvailable: true,
          currentVersion: config.currentVersion,
          currentVersionRaw: config.currentVersionRaw,
          latestVersion: "1.0.1",
          latestVersionRaw: "v1.0.1",
          releaseUrl: "https://github.com/your-org/your-app/releases",
          releaseNotes: "Demo release notes. No real deployment is performed.",
          publishedAt: new Date().toISOString(),
          isPrerelease: false,
          fromCache: false,
          rateLimit: null,
        }),
      },
      dockerAdapter: {
        deploy: async (tag) => ({
          success: true,
          newContainerId: `demo-${tag}`,
          previousContainerId: "demo-previous",
        }),
        finalize: async () => ({ finalized: true }),
        rollback: async () => ({
          rolledBack: true,
          restoredContainerId: "demo-previous",
        }),
      },
      healthAdapter: {
        check: async () => ({
          healthy: true,
          url: config.health.url,
          status: 200,
          attempts: 1,
          latencyMs: 8,
          checkedAt: new Date().toISOString(),
        }),
      },
    }
  : {};

const trafficRouter = await loadTrafficRouter();
const engine = new UpdatePilot(userConfig, {
  ...demoAdapters,
  ...(trafficRouter ? { trafficRouter } : {}),
});
const app = express();
app.disable("x-powered-by");
app.get("/health", (_request, response) => response.sendStatus(200));

function sendError(response, error) {
  const status =
    error instanceof UpdateInProgressError
      ? 409
      : error instanceof ConfigError
        ? 400
        : error instanceof RollbackError &&
            error.message === "No successful update to roll back"
          ? 400
          : 500;
  response.status(status).json({
    error: error instanceof Error ? error.message : String(error),
    ...(isUpdatePilotError(error)
      ? { code: error.code, context: error.context }
      : {}),
  });
}

app.get("/", async (_request, response, next) => {
  try {
    response.sendFile(
      fileURLToPath(new URL("./public/index.html", import.meta.url)),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/status", (_request, response) => {
  try {
    response.json(engine.getStatus());
  } catch (error) {
    sendError(response, error);
  }
});
app.get("/api/check", async (_request, response) => {
  try {
    response.json(await engine.checkOnly());
  } catch (error) {
    sendError(response, error);
  }
});
app.post("/api/update", async (_request, response) => {
  try {
    response.json(await engine.runUpdate());
  } catch (error) {
    sendError(response, error);
  }
});
app.post("/api/rollback", async (_request, response) => {
  try {
    response.json(await engine.rollback());
  } catch (error) {
    sendError(response, error);
  }
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  const actualHost =
    typeof address === "object" && address ? address.address : "127.0.0.1";
  if (demoMode) {
    console.log(
      "[update-pilot-example] Running in DEMO MODE (fake adapters). Set UPDATE_PILOT_DEMO=0 to use real Docker/GitHub/HTTP.",
    );
  } else {
    console.log(
      "[update-pilot-example] Running against REAL infrastructure. Update endpoint will pull Docker images and restart containers.",
    );
  }
  console.log(
    `[update-pilot-example] Listening on http://${actualHost}:${actualPort}`,
  );
});

export { app, engine };
