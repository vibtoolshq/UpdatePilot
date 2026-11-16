import assert from "node:assert/strict";
import { test } from "node:test";
import { UpdatePilot } from "../src/core/engine.js";
import {
  ConfigError,
  DockerError,
  GitHubError,
  HealthCheckError,
  RollbackError,
  UpdateInProgressError,
  UpdatePilotError,
} from "../src/utils/errors.js";
import { HookBus, HOOKS } from "../src/utils/events.js";

function makeFakeGitHub({
  updateAvailable = true,
  latestVersion = "1.3.0",
  check = null,
} = {}) {
  return {
    check:
      check ??
      (async () => ({
        updateAvailable,
        currentVersion: "1.2.3",
        currentVersionRaw: "1.2.3",
        latestVersion,
        latestVersionRaw: `v${latestVersion}`,
        releaseUrl: "https://github.com/x/y/releases/tag/v1.3.0",
        releaseNotes: "notes",
        publishedAt: new Date().toISOString(),
        isPrerelease: false,
        fromCache: false,
        rateLimit: null,
      })),
  };
}

function makeFakeDocker({
  deployFails = false,
  rollbackFails = false,
  finalizeFails = false,
  previousContainerId = "prev-id",
} = {}) {
  const calls = { deploy: 0, rollback: 0, finalize: 0 };
  const deployedTags = [];
  return {
    calls,
    deployedTags,
    deploy: async (tag) => {
      calls.deploy += 1;
      deployedTags.push(tag);
      if (deployFails) throw new DockerError("deploy failed");
      return {
        success: true,
        newContainerId: "new-id",
        previousContainerId,
      };
    },
    finalize: async () => {
      calls.finalize += 1;
      if (finalizeFails) throw new DockerError("finalize failed");
      return { finalized: true };
    },
    restorePrevious: async () => ({ restoredContainerId: "prev-id" }),
    rollback: async () => {
      calls.rollback += 1;
      if (rollbackFails) throw new DockerError("rollback failed");
      return { rolledBack: true, restoredContainerId: "prev-id" };
    },
  };
}

/** @param {{ healthy?: boolean }} [options] */
function makeFakeHealth({ healthy = true } = {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    /** @param {{ url?: string }} [options] */
    check: async ({ url } = {}) => {
      calls += 1;
      if (!healthy) {
        const error = new HealthCheckError("health failed");
        error.context = {
          url: url ?? "http://x/health",
          attempts: 5,
          lastStatus: 500,
        };
        throw error;
      }
      return {
        healthy: true,
        url: url ?? "http://x/health",
        status: 200,
        attempts: 1,
        latencyMs: 42,
        checkedAt: new Date().toISOString(),
      };
    },
  };
}

function makeFakeTrafficRouter(
  events = [],
  {
    prepareError = null,
    switchError = null,
    rollbackError = null,
    candidateHealthUrl = "http://candidate.test/health",
  } = {},
) {
  return {
    prepare: async () => {
      events.push("prepare");
      if (prepareError) throw prepareError;
      return {
        healthUrl: candidateHealthUrl,
        context: { route: "candidate" },
      };
    },
    switch: async () => {
      events.push("switch");
      if (switchError) throw switchError;
    },
    rollback: async () => {
      events.push("router-rollback");
      if (rollbackError) throw rollbackError;
    },
  };
}

/** @param {{ github?: any, docker?: any, health?: any, trafficRouter?: any, hooks?: Record<string, Function>, config?: any }} [options] */
function makePilot(options = {}) {
  const {
    github = makeFakeGitHub(),
    docker = makeFakeDocker(),
    health = makeFakeHealth(),
    trafficRouter = makeFakeTrafficRouter(),
    hooks,
    config = {},
  } = options;
  const userConfig = {
    repo: "org/app",
    currentVersion: "1.2.3",
    docker: { image: "ghcr.io/org/app" },
    health: { url: "http://x/health" },
    hooks,
    ...config,
  };
  return {
    pilot: new UpdatePilot(userConfig, {
      githubAdapter: github,
      dockerAdapter: docker,
      healthAdapter: health,
      trafficRouter,
    }),
    github,
    docker,
    health,
    trafficRouter,
  };
}

function observingBus(events) {
  const bus = new HookBus();
  for (const event of Object.values(HOOKS))
    bus.on(event, () => {
      events.push(event);
    });
  return bus;
}

test("runUpdate returns updated on the happy path", async () => {
  const { pilot } = makePilot();
  assert.equal((await pilot.runUpdate()).status, "updated");
});

test("success result includes version, container, latency, and duration", async () => {
  const { pilot } = makePilot();
  const result = await pilot.runUpdate();
  if (result.status !== "updated") throw new Error("Expected updated result");
  const updated =
    /** @type {{ from: string, to: string | null, newContainerId: string | null, healthLatencyMs: number, durationMs: number }} */ (
      result
    );
  assert.deepEqual(
    [updated.from, updated.to, updated.newContainerId, updated.healthLatencyMs],
    ["1.2.3", "1.3.0", "new-id", 42],
  );
  assert.ok(updated.durationMs >= 0);
});

test("candidate health passes before the router switches traffic", async () => {
  const events = [];
  const health = {
    ...makeFakeHealth(),
    /** @param {{ url?: string }} [options] */
    check: async ({ url } = {}) => {
      events.push(`health:${url}`);
      return makeFakeHealth().check({ url });
    },
  };
  const { pilot } = makePilot({
    health,
    trafficRouter: makeFakeTrafficRouter(events),
  });

  assert.equal((await pilot.runUpdate()).status, "updated");
  assert.deepEqual(events, [
    "prepare",
    "health:http://candidate.test/health",
    "switch",
  ]);
});

test("deployments fail closed when no traffic router is provided", async () => {
  const pilot = new UpdatePilot(
    {
      repo: "org/app",
      currentVersion: "1.2.3",
      docker: { image: "ghcr.io/org/app" },
      health: { url: "http://x/health" },
    },
    { githubAdapter: makeFakeGitHub(), healthAdapter: makeFakeHealth() },
  );

  await assert.rejects(pilot.runUpdate(), ConfigError);
});

test("custom Docker adapter can provide its owned candidate health URL", async () => {
  const docker = makeFakeDocker();
  docker.deploy = async () => ({
    success: true,
    newContainerId: "new-id",
    previousContainerId: "prev-id",
    healthUrl: "http://adapter-candidate.test/health",
  });
  let healthUrl;
  const health = {
    check: async (options) => {
      healthUrl = options.url;
      return makeFakeHealth().check(options);
    },
  };
  const pilot = new UpdatePilot(
    {
      repo: "org/app",
      currentVersion: "1.2.3",
      docker: { image: "ghcr.io/org/app" },
      health: { url: "http://x/health" },
    },
    {
      githubAdapter: makeFakeGitHub(),
      dockerAdapter: docker,
      healthAdapter: health,
    },
  );

  assert.equal((await pilot.runUpdate()).status, "updated");
  assert.equal(healthUrl, "http://adapter-candidate.test/health");
});

test("injected router receives the configured live URL instead of adapter health override", async () => {
  const docker = makeFakeDocker();
  docker.deploy = async () => ({
    success: true,
    newContainerId: "new-id",
    previousContainerId: "prev-id",
    healthUrl: "http://adapter-candidate.test/health",
  });
  /** @type {Array<{ healthUrl: string }>} */
  const receivedDeployments = [];
  const pilot = new UpdatePilot(
    {
      repo: "org/app",
      currentVersion: "1.2.3",
      docker: { image: "ghcr.io/org/app" },
      health: { url: "http://x/health" },
    },
    {
      githubAdapter: makeFakeGitHub(),
      dockerAdapter: docker,
      healthAdapter: makeFakeHealth(),
      trafficRouter: {
        prepare: async (deployment) => {
          receivedDeployments.push(deployment);
          return { healthUrl: "http://candidate.test/health" };
        },
        switch: async () => {},
        rollback: async () => {},
      },
    },
  );

  assert.equal((await pilot.runUpdate()).status, "updated");
  assert.equal(receivedDeployments.length, 1);
  assert.equal(receivedDeployments[0].healthUrl, "http://x/health");
});

test("health failure restores routing before rolling back Docker", async () => {
  const events = [];
  const docker = makeFakeDocker();
  const dockerRollback = docker.rollback;
  docker.rollback = async () => {
    events.push("docker-rollback");
    return dockerRollback();
  };
  const { pilot } = makePilot({
    docker,
    health: makeFakeHealth({ healthy: false }),
    trafficRouter: makeFakeTrafficRouter(events),
  });

  assert.equal((await pilot.runUpdate()).status, "rolled-back");
  assert.deepEqual(events, ["prepare", "router-rollback", "docker-rollback"]);
});

test("router switch failure restores both route and candidate", async () => {
  const events = [];
  const docker = makeFakeDocker();
  const dockerRollback = docker.rollback;
  docker.rollback = async () => {
    events.push("docker-rollback");
    return dockerRollback();
  };
  const { pilot } = makePilot({
    docker,
    trafficRouter: makeFakeTrafficRouter(events, {
      switchError: new Error("router unavailable"),
    }),
  });

  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof UpdatePilotError && error.context.phase === "switch",
  );
  assert.deepEqual(events, [
    "prepare",
    "switch",
    "router-rollback",
    "docker-rollback",
  ]);
  assert.equal(docker.calls.finalize, 0);
});

test("switch rollback receives the same opaque context after partial route change", async () => {
  const events = [];
  const preparationContext = { routeId: "candidate-route" };
  const route = { current: "old" };
  let deployment;
  /** @type {Array<{ deployment: unknown, context: unknown, reason: string }>} */
  const rollbackCalls = [];
  const trafficRouter = {
    prepare: async (receivedDeployment) => {
      events.push("prepare");
      deployment = receivedDeployment;
      return {
        healthUrl: "http://candidate.test/health",
        context: preparationContext,
      };
    },
    switch: async (_deployment, context) => {
      events.push("switch");
      assert.strictEqual(context, preparationContext);
      route.current = "candidate";
      throw new Error("switch partially applied");
    },
    rollback: async (receivedDeployment, context, reason) => {
      events.push("router-rollback");
      rollbackCalls.push({
        deployment: receivedDeployment,
        context,
        reason,
      });
      route.current = "old";
    },
  };
  const docker = makeFakeDocker();
  const dockerRollback = docker.rollback;
  docker.rollback = async () => {
    events.push("docker-rollback");
    return dockerRollback();
  };
  const { pilot } = makePilot({ docker, trafficRouter });

  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof UpdatePilotError && error.context.phase === "switch",
  );

  assert.deepEqual(events, [
    "prepare",
    "switch",
    "router-rollback",
    "docker-rollback",
  ]);
  assert.equal(rollbackCalls.length, 1);
  const [rollbackCall] = rollbackCalls;
  assert.ok(rollbackCall);
  assert.strictEqual(rollbackCall.deployment, deployment);
  assert.strictEqual(rollbackCall.context, preparationContext);
  assert.equal(rollbackCall.reason, "switch-failed");
  assert.equal(route.current, "old");
  assert.equal(docker.calls.finalize, 0);
});

test("router preparation failure removes the candidate and preserves the old route", async () => {
  const events = [];
  const docker = makeFakeDocker();
  const dockerRollback = docker.rollback;
  docker.rollback = async () => {
    events.push("docker-rollback");
    return dockerRollback();
  };
  const trafficRouter = makeFakeTrafficRouter(events, {
    prepareError: new Error("candidate route unavailable"),
  });
  let rollbackArguments;
  const routerRollback = trafficRouter.rollback;
  trafficRouter.rollback = async (...args) => {
    rollbackArguments = args;
    return routerRollback(...args);
  };
  const { pilot } = makePilot({
    docker,
    trafficRouter,
  });

  await assert.rejects(pilot.runUpdate(), UpdatePilotError);
  assert.deepEqual(events, ["prepare", "router-rollback", "docker-rollback"]);
  assert.ok(rollbackArguments);
  assert.equal(rollbackArguments[1], undefined);
  assert.equal(rollbackArguments[2], "prepare-failed");
});

test("invalid candidate health URLs are rolled back before health verification", async (t) => {
  const cases = [
    { name: "malformed URL", candidateHealthUrl: "not a URL" },
    {
      name: "unsupported protocol",
      candidateHealthUrl: "ftp://candidate.test/health",
    },
    {
      name: "configured live endpoint",
      candidateHealthUrl: "http://x/health",
    },
    {
      name: "live endpoint with a fragment",
      candidateHealthUrl: "http://x/health#candidate",
    },
  ];

  for (const { name, candidateHealthUrl } of cases) {
    await t.test(name, async () => {
      const events = [];
      const { pilot, docker, health } = makePilot({
        trafficRouter: makeFakeTrafficRouter(events, { candidateHealthUrl }),
      });

      await assert.rejects(pilot.runUpdate(), (error) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.context.field, "trafficRouter.prepare.healthUrl");
        assert.equal(error.context.phase, "deploy");
        return true;
      });
      assert.deepEqual(events, ["prepare", "router-rollback"]);
      assert.equal(health.calls, 0);
      assert.equal(docker.calls.rollback, 1);
      assert.equal(docker.calls.finalize, 0);
    });
  }
});

test("accepts a distinct HTTPS candidate health URL", async () => {
  const events = [];
  const health = {
    ...makeFakeHealth(),
    /** @param {{ url?: string }} [options] */
    check: async ({ url } = {}) => {
      events.push(`health:${url}`);
      return makeFakeHealth().check({ url });
    },
  };
  const { pilot } = makePilot({
    health,
    trafficRouter: makeFakeTrafficRouter(events, {
      candidateHealthUrl: "https://candidate.test/ready",
    }),
  });

  assert.equal((await pilot.runUpdate()).status, "updated");
  assert.deepEqual(events, [
    "prepare",
    "health:https://candidate.test/ready",
    "switch",
  ]);
});

test("checkOnly returns update information without touching Docker", async () => {
  const { pilot, docker } = makePilot();
  assert.equal((await pilot.checkOnly()).updateAvailable, true);
  assert.deepEqual(docker.calls, { deploy: 0, rollback: 0, finalize: 0 });
});

test("runUpdate returns up-to-date when no release is newer", async () => {
  const { pilot } = makePilot({
    github: makeFakeGitHub({ updateAvailable: false }),
  });
  assert.equal((await pilot.runUpdate()).status, "up-to-date");
});

test("force redeploys a valid release even when no release is newer", async () => {
  const { pilot, docker } = makePilot({
    github: makeFakeGitHub({ updateAvailable: false }),
  });
  assert.equal((await pilot.runUpdate({ force: true })).status, "updated");
  assert.equal(docker.calls.deploy, 1);
  assert.deepEqual(docker.deployedTags, ["1.3.0"]);
});

test("engine passes a selected SHA release tag to Docker unchanged", async () => {
  const tag = "abcdef1234567";
  const { pilot, docker } = makePilot({
    github: makeFakeGitHub({ latestVersion: tag }),
  });

  const result = await pilot.runUpdate();

  if (result.status !== "updated") throw new Error("Expected an update");
  assert.equal(result.to, tag);
  assert.deepEqual(docker.deployedTags, [tag]);
});

test("force rejects when no eligible release exists before deployment", async () => {
  const events = [];
  const { pilot, docker } = makePilot({
    github: makeFakeGitHub({ updateAvailable: false, latestVersion: null }),
    trafficRouter: makeFakeTrafficRouter(events),
  });

  await assert.rejects(pilot.runUpdate({ force: true }), (error) => {
    assert.ok(error instanceof GitHubError);
    assert.equal(error.code, "E_GITHUB");
    assert.equal(error.context.phase, "check");
    return true;
  });
  assert.equal(docker.calls.deploy, 0);
  assert.deepEqual(events, []);
});

test("dry run does not deploy, finalize, or check health", async () => {
  const { pilot, docker, health } = makePilot();
  assert.equal((await pilot.runUpdate({ dryRun: true })).status, "dry-run");
  assert.deepEqual(docker.calls, { deploy: 0, rollback: 0, finalize: 0 });
  assert.equal(health.calls, 0);
});

test("health failure rolls back and returns structured status", async () => {
  const { pilot } = makePilot({ health: makeFakeHealth({ healthy: false }) });
  const result = await pilot.runUpdate();
  assert.equal(result.status, "rolled-back");
  assert.equal(result.reason, "health-check-failed");
  assert.equal(result.healthError.message, "health failed");
});

test("health failure calls rollback and skips finalize", async () => {
  const { pilot, docker } = makePilot({
    health: makeFakeHealth({ healthy: false }),
  });
  await pilot.runUpdate();
  assert.equal(docker.calls.rollback, 1);
  assert.equal(docker.calls.finalize, 0);
});

test("disabled automatic rollback leaves the candidate available for manual recovery", async () => {
  const events = [];
  const { pilot, docker } = makePilot({
    health: makeFakeHealth({ healthy: false }),
    trafficRouter: makeFakeTrafficRouter(events),
    config: { rollback: { enabled: false } },
  });

  await assert.rejects(pilot.runUpdate(), HealthCheckError);
  assert.deepEqual(events, ["prepare", "router-rollback"]);
  assert.equal(docker.calls.rollback, 0);
  assert.equal(docker.calls.finalize, 0);

  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
  assert.deepEqual(events, ["prepare", "router-rollback", "router-rollback"]);
  assert.equal(docker.calls.rollback, 1);
});

test("rollback failure is catastrophic", async () => {
  const { pilot } = makePilot({
    docker: makeFakeDocker({ rollbackFails: true }),
    health: makeFakeHealth({ healthy: false }),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof RollbackError &&
      error.message.includes("manual intervention"),
  );
});

test("Docker deploy failure is wrapped with deploy phase and skips rollback", async () => {
  const { pilot, docker } = makePilot({
    docker: makeFakeDocker({ deployFails: true }),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof UpdatePilotError && error.context.phase === "deploy",
  );
  assert.equal(docker.calls.rollback, 0);
});

test("GitHub check failure is wrapped with check phase", async () => {
  const { pilot } = makePilot({
    github: makeFakeGitHub({
      check: async () => {
        throw new Error("github down");
      },
    }),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof UpdatePilotError && error.context.phase === "check",
  );
});

test("finalize failure is wrapped with finalize phase", async () => {
  const { pilot } = makePilot({
    docker: makeFakeDocker({ finalizeFails: true }),
  });
  await assert.rejects(
    pilot.runUpdate(),
    (error) =>
      error instanceof DockerError && error.context.phase === "finalize",
  );
});

test("manual rollback remains available after finalize failure", async () => {
  const { pilot, docker } = makePilot({
    docker: makeFakeDocker({ finalizeFails: true }),
  });

  await assert.rejects(pilot.runUpdate(), DockerError);
  assert.equal(pilot.getStatus().lastResult, null);
  await assert.rejects(pilot.runUpdate(), RollbackError);
  assert.equal(docker.calls.deploy, 1);
  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
  assert.equal(docker.calls.rollback, 1);
});

test("parallel update call is rejected as already in progress", async () => {
  let release = /** @type {any} */ (() => {});
  const waiting = new Promise((resolve) => {
    release = () => resolve();
  });
  const github = makeFakeGitHub({
    check: async () => {
      await waiting;
      return makeFakeGitHub().check();
    },
  });
  const { pilot } = makePilot({ github });
  const first = pilot.runUpdate();
  await assert.rejects(pilot.runUpdate(), UpdateInProgressError);
  release();
  await first;
});

test("a later update is allowed after the previous run completes", async () => {
  const { pilot, docker } = makePilot();
  await pilot.runUpdate();
  await pilot.runUpdate();
  assert.equal(docker.calls.deploy, 2);
});

test("running state is released after errors", async () => {
  const { pilot } = makePilot({
    github: makeFakeGitHub({
      check: async () => {
        throw new Error("failed");
      },
    }),
  });
  await assert.rejects(pilot.runUpdate());
  assert.equal(pilot.getStatus().running, false);
});

test("lifecycle hooks fire in order on the happy path", async () => {
  const order = [];
  const config = {
    repo: "org/app",
    currentVersion: "1.2.3",
    docker: { image: "ghcr.io/org/app" },
    health: { url: "http://x/health" },
  };
  await new UpdatePilot(config, {
    githubAdapter: makeFakeGitHub(),
    dockerAdapter: makeFakeDocker(),
    healthAdapter: makeFakeHealth(),
    trafficRouter: makeFakeTrafficRouter(),
    hookBus: observingBus(order),
  }).runUpdate();
  assert.deepEqual(order, [
    HOOKS.BEFORE_CHECK,
    HOOKS.AFTER_CHECK,
    HOOKS.BEFORE_DEPLOY,
    HOOKS.AFTER_DEPLOY,
    HOOKS.BEFORE_VERIFY,
    HOOKS.AFTER_VERIFY,
  ]);
});

test("rollback hooks fire on health failure", async () => {
  const order = [];
  const config = {
    repo: "org/app",
    currentVersion: "1.2.3",
    docker: { image: "ghcr.io/org/app" },
    health: { url: "http://x/health" },
  };
  await new UpdatePilot(config, {
    githubAdapter: makeFakeGitHub(),
    dockerAdapter: makeFakeDocker(),
    healthAdapter: makeFakeHealth({ healthy: false }),
    trafficRouter: makeFakeTrafficRouter(),
    hookBus: observingBus(order),
  }).runUpdate();
  assert.ok(order.includes(HOOKS.BEFORE_ROLLBACK));
  assert.ok(order.includes(HOOKS.AFTER_ROLLBACK));
});

test("ON_ERROR fires on deploy failure", async () => {
  const order = [];
  const config = {
    repo: "org/app",
    currentVersion: "1.2.3",
    docker: { image: "ghcr.io/org/app" },
    health: { url: "http://x/health" },
  };
  await assert.rejects(
    new UpdatePilot(config, {
      githubAdapter: makeFakeGitHub(),
      dockerAdapter: makeFakeDocker({ deployFails: true }),
      healthAdapter: makeFakeHealth(),
      trafficRouter: makeFakeTrafficRouter(),
      hookBus: observingBus(order),
    }).runUpdate(),
  );
  assert.ok(order.includes(HOOKS.ON_ERROR));
});

test("throwing user hooks do not fail update", async () => {
  const { pilot } = makePilot({
    hooks: {
      beforeCheck: async () => {
        throw new Error("hook broken");
      },
    },
  });
  assert.equal((await pilot.runUpdate()).status, "updated");
});

test("getStatus reports the idle engine state", () => {
  const { pilot } = makePilot();
  const status = pilot.getStatus();
  assert.equal(status.running, false);
  assert.equal(status.lastResult, null);
  assert.equal(status.repo, "org/app");
  assert.ok(Number.isFinite(Date.parse(status.uptime.engineSince)));
});

test("engine preserves the resolved logger instance and its settings", () => {
  const writes = [];
  const stream = { write: (chunk) => writes.push(chunk) };
  const { pilot } = makePilot({
    config: {
      logger: {
        level: "debug",
        prefix: "[engine-test]",
        pretty: false,
        stream,
        redact: ["token"],
      },
    },
  });

  assert.equal(pilot.logger, pilot.config.logger);
  pilot.logger.debug("logger wired", { token: "secret" });

  assert.equal(writes.length, 1);
  const entry = JSON.parse(writes[0]);
  assert.equal(entry.level, "debug");
  assert.equal(entry.prefix, "[engine-test]");
  assert.equal(entry.message, "logger wired");
  assert.equal(entry.token, "***");
});

test("getStatus reports running during an in-flight check", async () => {
  let release = /** @type {any} */ (() => {});
  const waiting = new Promise((resolve) => {
    release = () => resolve();
  });
  const github = makeFakeGitHub({
    check: async () => {
      await waiting;
      return makeFakeGitHub().check();
    },
  });
  const { pilot } = makePilot({ github });
  const running = pilot.runUpdate();
  assert.equal(pilot.getStatus().running, true);
  release();
  await running;
});

test("manual rollback requires a prior successful update", async () => {
  const { pilot } = makePilot();
  await assert.rejects(
    pilot.rollback(),
    (error) =>
      error instanceof RollbackError &&
      error.message === "No successful update to roll back",
  );
});

test("manual rollback succeeds after an update", async () => {
  const events = [];
  const docker = makeFakeDocker();
  const dockerRollback = docker.rollback;
  docker.restorePrevious = async () => {
    events.push("restore-previous");
    return { restoredContainerId: "prev-id" };
  };
  docker.rollback = async () => {
    events.push("docker-rollback");
    return dockerRollback();
  };
  const { pilot } = makePilot({
    docker,
    trafficRouter: makeFakeTrafficRouter(events),
  });
  await pilot.runUpdate();
  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
  assert.equal(docker.calls.rollback, 1);
  assert.deepEqual(events, [
    "prepare",
    "switch",
    "restore-previous",
    "router-rollback",
    "docker-rollback",
  ]);
});

test("manual rollback does not remove a candidate without a previous container", async () => {
  const { pilot, docker } = makePilot({
    docker: makeFakeDocker({ previousContainerId: null }),
  });
  await pilot.runUpdate();

  await assert.rejects(pilot.rollback(), RollbackError);
  assert.equal(docker.calls.rollback, 0);
});

test("manual rollback remains available after a later no-op check", async () => {
  let checks = 0;
  const github = {
    check: async () => {
      checks += 1;
      return makeFakeGitHub({ updateAvailable: checks === 1 }).check();
    },
  };
  const { pilot, docker } = makePilot({ github });

  assert.equal((await pilot.runUpdate()).status, "updated");
  assert.equal((await pilot.runUpdate()).status, "up-to-date");
  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
  assert.equal(docker.calls.rollback, 1);
});

test("manual rollback rejects a success-shaped result without a restored ID", async () => {
  const docker = makeFakeDocker();
  let rollbackCalls = 0;
  docker.rollback = /** @type {typeof docker.rollback} */ (
    async () => {
      rollbackCalls += 1;
      return {
        rolledBack: true,
        restoredContainerId: rollbackCalls === 1 ? null : "prev-id",
      };
    }
  );
  const { pilot } = makePilot({ docker });

  await pilot.runUpdate();
  await assert.rejects(pilot.rollback(), RollbackError);
  assert.deepEqual(await pilot.rollback(), {
    status: "rolled-back-manual",
    to: "1.2.3",
  });
});

test("successful manual rollback consumes rollback eligibility", async () => {
  const { pilot, docker } = makePilot();
  await pilot.runUpdate();
  await pilot.rollback();

  await assert.rejects(pilot.rollback(), RollbackError);
  assert.equal(docker.calls.rollback, 1);
});

test("constructor rejects invalid user configuration", () => {
  assert.throws(() => new UpdatePilot({ repo: "bad" }), ConfigError);
});

test("engine passes rollback image retention to the Docker adapter", () => {
  const pilot = new UpdatePilot(
    {
      repo: "org/app",
      currentVersion: "1.2.3",
      docker: { image: "ghcr.io/org/app" },
      health: {
        url: "http://x/health",
        headers: { authorization: "Bearer test-token" },
      },
      rollback: { keepImages: 5 },
    },
    {
      githubAdapter: makeFakeGitHub(),
      trafficRouter: makeFakeTrafficRouter(),
    },
  );

  pilot._ensureAdapters({ github: false });

  assert.equal(pilot._docker.keepImages, 5);
  assert.deepEqual(pilot._health.headers, {
    authorization: "Bearer test-token",
  });
});
