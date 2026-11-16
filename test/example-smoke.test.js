import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverFile = resolve(root, "examples/basic-express/server.js");
const children = [];

function realModeEnvironment(overrides = {}) {
  const env = {
    ...process.env,
    PORT: "0",
    UPDATE_PILOT_DEMO: "0",
    ...overrides,
  };
  for (const name of [
    "GITHUB_REPOSITORY",
    "APP_VERSION",
    "DOCKER_IMAGE",
    "HEALTH_URL",
    "TRAFFIC_ROUTER_MODULE",
    "COMPOSE_FILE",
  ])
    if (!(name in overrides)) delete env[name];
  return env;
}

async function runUntilExit(env) {
  const child = spawn(process.execPath, [serverFile], {
    cwd: dirname(serverFile),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Example server did not exit. Output: ${output}`));
    }, 5_000);
    timeout.unref();
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveExit({ code, output });
    });
  });
}

after(async () => {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolveExit) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolveExit();
          child.once("exit", resolveExit);
          child.kill("SIGTERM");
          const forceKill = setTimeout(() => child.kill("SIGKILL"), 1_500);
          forceKill.unref();
        }),
    ),
  );
});

test(
  "demo Express API returns valid JSON for status, check, rollback, and update",
  {
    timeout: 15_000,
    skip: process.env.CI_SKIP_EXAMPLE === "1",
  },
  async () => {
    const child = spawn(process.execPath, [serverFile], {
      cwd: dirname(serverFile),
      env: {
        ...process.env,
        PORT: "0",
        UPDATE_PILOT_DEMO: "1",
        GITHUB_REPOSITORY: "your-org/your-app",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const port = await new Promise((resolvePort, reject) => {
      let stdout = "";
      const timeout = setTimeout(
        () =>
          reject(new Error(`Example server did not start. stderr: ${stderr}`)),
        10_000,
      );
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const match = stdout.match(/Listening on http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolvePort(Number(match[1]));
        }
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Example server exited (${code}). stdout: ${stdout}; stderr: ${stderr}`,
          ),
        );
      });
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const statusResponse = await fetch(`${baseUrl}/api/status`);
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.running, false);
    assert.equal(status.repo, "your-org/your-app");

    const checkResponse = await fetch(`${baseUrl}/api/check`);
    assert.equal(checkResponse.status, 200);
    const check = await checkResponse.json();
    assert.equal(typeof check.updateAvailable, "boolean");
    assert.equal(check.latestVersion, "1.0.1");

    const rollbackResponse = await fetch(`${baseUrl}/api/rollback`, {
      method: "POST",
    });
    assert.ok([400, 409].includes(rollbackResponse.status));
    assert.equal(typeof (await rollbackResponse.json()).error, "string");

    const updateResponse = await fetch(`${baseUrl}/api/update`, {
      method: "POST",
    });
    assert.equal(updateResponse.status, 200);
    const update = await updateResponse.json();
    assert.equal(update.status, "updated");
    assert.equal(update.from, "1.0.0");
    assert.equal(update.to, "1.0.1");
  },
);

test("real mode refuses missing target and router settings before listening", async () => {
  const missingSettings = await runUntilExit(realModeEnvironment());
  assert.notEqual(missingSettings.code, 0);
  assert.match(missingSettings.output, /GITHUB_REPOSITORY/);
  assert.match(missingSettings.output, /TRAFFIC_ROUTER_MODULE/);
  assert.doesNotMatch(missingSettings.output, /Listening on/);

  const withoutRouter = await runUntilExit(
    realModeEnvironment({
      GITHUB_REPOSITORY: "your-org/your-app",
      APP_VERSION: "1.2.3",
      DOCKER_IMAGE: "ghcr.io/your-org/your-app",
      HEALTH_URL: "http://127.0.0.1:8080/health",
    }),
  );
  assert.notEqual(withoutRouter.code, 0);
  assert.match(withoutRouter.output, /TRAFFIC_ROUTER_MODULE/);
  assert.doesNotMatch(withoutRouter.output, /Listening on/);
});

test("real mode rejects the unsupported Compose setting", async () => {
  const result = await runUntilExit(
    realModeEnvironment({ COMPOSE_FILE: "compose.yml" }),
  );
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Compose deployments are disabled/);
  assert.doesNotMatch(result.output, /Listening on/);
});
