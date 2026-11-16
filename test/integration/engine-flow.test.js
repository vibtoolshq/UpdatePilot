import assert from "node:assert/strict";
import { test } from "node:test";
import { UpdatePilot } from "../../src/core/engine.js";
import { HookBus, HOOKS } from "../../src/core/events.js";
import {
  DockerError,
  HealthCheckError,
  RollbackError,
  UpdateInProgressError,
} from "../../src/utils/errors.js";

function makeEngine({
  available = true,
  healthy = true,
  deployError = null,
  rollbackError = null,
  finalizeError = null,
  checkDelay = 0,
  hooks = {},
} = {}) {
  let checks = 0;
  const github = {
    check: async () => {
      if (checkDelay)
        await new Promise((resolve) => setTimeout(resolve, checkDelay));
      checks += 1;
      const updateAvailable = available && checks === 1;
      return {
        updateAvailable,
        currentVersion: "1.2.3",
        currentVersionRaw: "1.2.3",
        latestVersion: "1.3.0",
        latestVersionRaw: "v1.3.0",
        releaseUrl: null,
        releaseNotes: null,
        publishedAt: null,
        isPrerelease: false,
        fromCache: false,
        rateLimit: null,
      };
    },
  };
  const dockerCalls = { deploy: 0, finalize: 0, rollback: 0 };
  const trafficRouterCalls = [];
  const docker = {
    calls: dockerCalls,
    deploy: async () => {
      dockerCalls.deploy += 1;
      if (deployError) throw deployError;
      return {
        success: true,
        newContainerId: "new-1",
        previousContainerId: "old-1",
      };
    },
    finalize: async () => {
      dockerCalls.finalize += 1;
      if (finalizeError) throw finalizeError;
      return { finalized: true };
    },
    rollback: async () => {
      dockerCalls.rollback += 1;
      if (rollbackError) throw rollbackError;
      return { rolledBack: true, restoredContainerId: "old-1" };
    },
  };
  const trafficRouter = {
    prepare: async () => {
      trafficRouterCalls.push("prepare");
      return {
        healthUrl: "http://candidate.test/health",
        context: { candidate: "new-1" },
      };
    },
    switch: async () => {
      trafficRouterCalls.push("switch");
    },
    rollback: async () => {
      trafficRouterCalls.push("rollback");
    },
  };
  const health = {
    /** @param {{ url?: string }} [options] */
    check: async ({ url } = {}) => {
      if (!healthy)
        throw new HealthCheckError("probe failed", {
          context: { lastStatus: 500 },
        });
      return {
        healthy: true,
        url: url ?? "http://example.test/health",
        status: 200,
        attempts: 1,
        latencyMs: 6,
        checkedAt: new Date().toISOString(),
      };
    },
  };
  const hookBus = new HookBus();
  for (const event of Object.values(HOOKS))
    hookBus.on(event, hooks[event] ?? (() => {}));
  const pilot = new UpdatePilot(
    {
      repo: "org/app",
      currentVersion: "1.2.3",
      docker: { image: "ghcr.io/org/app" },
      health: { url: "http://example.test/health" },
    },
    {
      githubAdapter: github,
      dockerAdapter: docker,
      healthAdapter: health,
      trafficRouter,
      hookBus,
    },
  );
  return { pilot, github, docker, health, hookBus, trafficRouterCalls };
}

test("happy flow fires hooks, records status, then reports up-to-date", async () => {
  const fired = [];
  const hooks = Object.fromEntries(
    Object.values(HOOKS).map((event) => [event, () => fired.push(event)]),
  );
  const { pilot, docker, trafficRouterCalls } = makeEngine({ hooks });
  const result = await pilot.runUpdate();
  assert.equal(result.status, "updated");
  assert.equal(result.from, "1.2.3");
  assert.equal(result.to, "1.3.0");
  assert.deepEqual(pilot.getStatus().lastResult, result);
  assert.deepEqual(fired.slice(0, 6), [
    HOOKS.BEFORE_CHECK,
    HOOKS.AFTER_CHECK,
    HOOKS.BEFORE_DEPLOY,
    HOOKS.AFTER_DEPLOY,
    HOOKS.BEFORE_VERIFY,
    HOOKS.AFTER_VERIFY,
  ]);
  assert.equal((await pilot.runUpdate()).status, "up-to-date");
  assert.deepEqual(trafficRouterCalls, ["prepare", "switch"]);
  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
  assert.equal(docker.calls.rollback, 1);
  assert.deepEqual(trafficRouterCalls, ["prepare", "switch", "rollback"]);
});

test("health failure rolls back without finalizing and emits afterRollback", async () => {
  const fired = [];
  const { pilot, docker, trafficRouterCalls } = makeEngine({
    healthy: false,
    hooks: { [HOOKS.AFTER_ROLLBACK]: () => fired.push("rolled back") },
  });
  const result = await pilot.runUpdate();
  assert.equal(result.status, "rolled-back");
  assert.equal(result.reason, "health-check-failed");
  assert.equal(docker.calls.rollback, 1);
  assert.equal(docker.calls.finalize, 0);
  assert.deepEqual(trafficRouterCalls, ["prepare", "rollback"]);
  assert.deepEqual(fired, ["rolled back"]);
});

test("dry run does not call any Docker operation", async () => {
  const { pilot, docker } = makeEngine();
  const result = await pilot.runUpdate({ dryRun: true });
  assert.equal(result.status, "dry-run");
  assert.deepEqual(docker.calls, { deploy: 0, finalize: 0, rollback: 0 });
});

test("concurrent runs reject the second call quickly", async () => {
  const { pilot } = makeEngine({ checkDelay: 25 });
  const started = performance.now();
  const first = pilot.runUpdate();
  await assert.rejects(pilot.runUpdate(), UpdateInProgressError);
  await first;
  assert.ok(performance.now() - started < 3_000);
});

test("checkOnly checks GitHub without invoking Docker", async () => {
  const { pilot, docker } = makeEngine();
  assert.equal((await pilot.checkOnly()).updateAvailable, true);
  assert.deepEqual(docker.calls, { deploy: 0, finalize: 0, rollback: 0 });
});

test("deploy errors retain DockerError and deploy phase", async () => {
  const { pilot } = makeEngine({ deployError: new DockerError("unavailable") });
  await assert.rejects(
    pilot.runUpdate(),
    (error) => error instanceof DockerError && error.context.phase === "deploy",
  );
});

test("a throwing hook is isolated and does not stop the update", async () => {
  const { pilot } = makeEngine({
    hooks: {
      [HOOKS.BEFORE_DEPLOY]: async () => {
        throw new Error("listener failed");
      },
    },
  });
  assert.equal((await pilot.runUpdate()).status, "updated");
});

test("rollback failure preserves the catastrophic RollbackError", async () => {
  const { pilot } = makeEngine({
    healthy: false,
    rollbackError: new Error("rollback unavailable"),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof RollbackError &&
      error.message.includes("manual intervention"),
  );
});

test("finalize failure is surfaced with its phase", async () => {
  const { pilot } = makeEngine({
    finalizeError: new DockerError("cleanup failed"),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof DockerError && error.context.phase === "finalize",
  );
});
