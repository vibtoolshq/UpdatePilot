import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { DockerAdapter } from "../src/adapters/docker.js";
import { DockerError } from "../src/utils/errors.js";

function makeFakeDocker(overrides = {}) {
  const calls = {
    pull: [],
    created: [],
    removed: [],
    renamed: [],
    stopped: 0,
    started: 0,
  };
  const docker = {
    calls,
    pull: async (image) => {
      calls.pull.push(image);
      return new EventEmitter();
    },
    modem: {
      followProgress: (stream, callback, onProgress) =>
        setTimeout(() => {
          onProgress?.({ status: "done" });
          callback(null, []);
        }, 10),
    },
    listContainers: async () => [],
    createContainer: async (options) => {
      calls.created.push(options);
      const id = calls.created.length === 1 ? "new-id" : "restored-id";
      return {
        id,
        inspect: async () => ({
          Image: "sha256:candidate-image",
          NetworkSettings: {
            Ports: Object.fromEntries(
              Object.entries(options.HostConfig?.PortBindings ?? {}).map(
                ([port, bindings]) => [
                  port,
                  bindings.map((binding) => ({
                    ...binding,
                    HostPort:
                      binding.HostPort === "0"
                        ? String(49152 + calls.created.length)
                        : binding.HostPort,
                  })),
                ],
              ),
            ),
          },
        }),
        start: async () => {
          calls.started += 1;
        },
        stop: async () => {
          calls.stopped += 1;
        },
        rename: async ({ name }) => {
          calls.renamed.push({ id, name });
        },
        remove: async () => {
          calls.removed.push(options.name);
        },
      };
    },
    getContainer: (id) => ({
      id,
      stop: async () => {
        calls.stopped += 1;
      },
      start: async () => {
        calls.started += 1;
      },
      remove: async () => {
        calls.removed.push(id);
      },
    }),
    listImages: async () => [],
    getImage: () => ({ remove: async () => {} }),
    ...overrides,
  };
  return docker;
}

function makeAdapter(dockerClient, options = {}) {
  return new DockerAdapter({
    image: "ghcr.io/org/app",
    containerName: "app",
    dockerClient,
    ...options,
  });
}

test("constructor requires a non-empty image", () => {
  assert.throws(() => new DockerAdapter({}), DockerError);
  assert.throws(() => new DockerAdapter({ image: "" }), DockerError);
});

test("pull requests the configured image and tag", async () => {
  const docker = makeFakeDocker();
  const adapter = makeAdapter(docker, { tag: "1.2.3" });
  assert.deepEqual(await adapter.pull(), {
    pulled: true,
    image: "ghcr.io/org/app:1.2.3",
  });
  assert.deepEqual(docker.calls.pull, ["ghcr.io/org/app:1.2.3"]);
});

test("pull waits for followProgress completion", async () => {
  let completed = false;
  const docker = makeFakeDocker({
    modem: {
      followProgress: (stream, callback) =>
        setTimeout(() => {
          completed = true;
          callback(null, []);
        }, 10),
    },
  });
  const adapter = makeAdapter(docker);
  await adapter.pull();
  assert.equal(completed, true);
});

test("pull retries transient stream failures", async () => {
  let calls = 0;
  const docker = makeFakeDocker({
    pull: async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return new EventEmitter();
    },
  });
  await makeAdapter(docker).pull();
  assert.equal(calls, 2);
});

test("getCurrentContainer returns null when no containers match", async () => {
  assert.equal(await makeAdapter(makeFakeDocker()).getCurrentContainer(), null);
});

test("getCurrentContainer returns the matching container info", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old-image",
        State: "running",
        Status: "Up",
      },
    ],
  });
  assert.deepEqual(await makeAdapter(docker).getCurrentContainer(), {
    id: "old-id",
    name: "app",
    image: "old-image",
    state: "running",
    status: "Up",
  });
});

test("deploy retains the previous container without stopping it", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "running",
        Status: "Up",
        Ports: [],
      },
    ],
  });
  await makeAdapter(docker).deploy("2.0.0");
  assert.equal(docker.calls.stopped, 0);
});

test("deploy creates and starts a temporary candidate container", async () => {
  const docker = makeFakeDocker();
  const before = Date.now();
  await makeAdapter(docker).deploy("2.0.0");
  const name = docker.calls.created[0].name;
  assert.match(name, /^app-new-\d+$/);
  assert.ok(Number(name.slice("app-new-".length)) >= before);
  assert.equal(docker.calls.started, 1);
});

test("deploy allocates candidate ports without conflicting with the old host port", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "running",
        Status: "Up",
        Ports: [
          { PrivatePort: 3000, PublicPort: 8080, Type: "tcp", IP: "127.0.0.1" },
        ],
      },
    ],
  });
  const deployment = await makeAdapter(docker).deploy("2.0.0");
  assert.deepEqual(docker.calls.created[0].HostConfig.PortBindings, {
    "3000/tcp": [{ HostPort: "0", HostIp: "127.0.0.1" }],
  });
  assert.equal(deployment.candidatePorts["3000/tcp"][0].HostPort, "49153");
});

test("deploy removes the new container when starting it fails", async () => {
  const docker = makeFakeDocker({
    createContainer: async (options) => ({
      id: "bad-id",
      start: async () => {
        throw new Error("start failed");
      },
      remove: async () => {
        docker.calls.removed.push(options.name);
      },
    }),
  });
  await assert.rejects(makeAdapter(docker).deploy("2.0.0"), DockerError);
  assert.equal(docker.calls.removed.length, 1);
});

test("finalize stops and removes the previous container", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "running",
        Status: "Up",
        Ports: [],
      },
    ],
  });
  const adapter = makeAdapter(docker);
  await adapter.deploy("2.0.0");
  await adapter.finalize();
  assert.equal(docker.calls.stopped, 1);
  assert.ok(docker.calls.removed.includes("old-id"));
  assert.ok(
    docker.calls.renamed.some(
      ({ id, name }) => id === "new-id" && name === "app",
    ),
  );
});

test("finalize is safe when called twice", async () => {
  const adapter = makeAdapter(makeFakeDocker());
  await adapter.deploy("2.0.0");
  assert.deepEqual(await adapter.finalize(), { finalized: true });
  assert.deepEqual(await adapter.finalize(), { finalized: true });
});

test("rollback after finalize recreates the previous image", async () => {
  const removedImages = [];
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Image: "ghcr.io/org/app:1.0.0",
        ImageID: "sha256:old-image",
        Names: ["/app"],
        State: "running",
        Status: "Up",
        Ports: [
          { PrivatePort: 3000, PublicPort: 8080, Type: "tcp", IP: "127.0.0.1" },
        ],
      },
    ],
    listImages: async () => [
      { Id: "sha256:old-image", Created: 1 },
      { Id: "dangling-2", Created: 2 },
      { Id: "dangling-3", Created: 3 },
      { Id: "dangling-4", Created: 4 },
    ],
    getImage: (id) => ({
      remove: async () => removedImages.push(id),
    }),
  });
  const adapter = makeAdapter(docker, { keepImages: 0 });

  await adapter.deploy("2.0.0");
  await adapter.finalize();
  assert.ok(!removedImages.includes("sha256:old-image"));
  assert.deepEqual(removedImages, ["dangling-2", "dangling-3", "dangling-4"]);
  const result = await adapter.rollback();

  assert.deepEqual(result, {
    rolledBack: true,
    restoredContainerId: "restored-id",
  });
  assert.equal(docker.calls.created[1].Image, "sha256:old-image");
  assert.equal(docker.calls.created[1].name, "app");
  assert.deepEqual(docker.calls.created[1].HostConfig.PortBindings, {
    "3000/tcp": [{ HostPort: "8080", HostIp: "127.0.0.1" }],
  });
  assert.ok(docker.calls.removed.includes("old-id"));
  await assert.rejects(adapter.rollback(), DockerError);
});

test("restorePrevious recreates the old service before candidate removal", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Image: "ghcr.io/org/app:1.0.0",
        ImageID: "sha256:old-image",
        Names: ["/app"],
        State: "running",
        Status: "Up",
        Ports: [],
      },
    ],
  });
  const adapter = makeAdapter(docker);

  await adapter.deploy("2.0.0");
  await adapter.finalize();
  const restored = await adapter.restorePrevious();

  assert.deepEqual(restored, { restoredContainerId: "restored-id" });
  assert.equal(docker.calls.created[1].Image, "sha256:old-image");
  assert.ok(!docker.calls.removed.includes(docker.calls.created[0].name));
  assert.ok(
    docker.calls.renamed.some(
      ({ id, name }) => id === "new-id" && name !== "app",
    ),
  );

  const rollback = await adapter.rollback();
  assert.deepEqual(rollback, {
    rolledBack: true,
    restoredContainerId: "restored-id",
  });
  assert.ok(docker.calls.removed.includes(docker.calls.created[0].name));
});

test("finalize retains active, rollback, and configured tagged prior images", async () => {
  const removedImages = [];
  const images = [
    {
      Id: "sha256:candidate-image",
      RepoTags: ["ghcr.io/org/app:2.0.0"],
      Created: 10,
    },
    {
      Id: "sha256:rollback-image",
      RepoTags: ["ghcr.io/org/app:1.9.0"],
      Created: 9,
    },
    { Id: "sha256:prior-1", RepoTags: ["ghcr.io/org/app:1.8.0"], Created: 8 },
    { Id: "sha256:prior-2", RepoTags: ["ghcr.io/org/app:1.7.0"], Created: 7 },
    {
      Id: "sha256:other-repository",
      RepoTags: ["ghcr.io/other/app:5.0.0"],
      Created: 11,
    },
    { Id: "dangling-newest", RepoTags: ["<none>:<none>"], Created: 6 },
    { Id: "dangling-oldest", RepoTags: ["<none>:<none>"], Created: 5 },
  ];
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Image: "ghcr.io/org/app:1.9.0",
        ImageID: "sha256:rollback-image",
        Names: ["/app"],
        State: "running",
        Status: "Up",
        Ports: [],
      },
    ],
    listImages: async () => images,
    getImage: (id) => ({
      remove: async () => removedImages.push(id),
    }),
  });
  const adapter = makeAdapter(docker, { keepImages: 1 });

  await adapter.deploy("2.0.0");
  await adapter.finalize();

  assert.deepEqual(removedImages, ["sha256:prior-2", "dangling-oldest"]);
  assert.ok(!removedImages.includes("sha256:candidate-image"));
  assert.ok(!removedImages.includes("sha256:rollback-image"));
  assert.ok(!removedImages.includes("sha256:prior-1"));
  assert.ok(!removedImages.includes("sha256:other-repository"));
  assert.ok(!removedImages.includes("dangling-newest"));
});

test("rollback rejects when no deployment state exists", async () => {
  const docker = makeFakeDocker();
  const adapter = makeAdapter(docker);

  await assert.rejects(adapter.rollback(), DockerError);
  assert.equal(docker.calls.removed.length, 0);
});

test("rollback removes the new container and restarts a stopped previous container", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "exited",
        Status: "Exited",
        Ports: [],
      },
    ],
  });
  const adapter = makeAdapter(docker);
  await adapter.deploy("2.0.0");
  const result = await adapter.rollback();
  assert.deepEqual(result, { rolledBack: true, restoredContainerId: "old-id" });
  assert.equal(docker.calls.started, 2);
  assert.ok(
    docker.calls.removed.includes(
      "app-new-" + docker.calls.created[0].name.split("app-new-")[1],
    ),
  );
});

test("rollback does not restart a still-running previous container", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "running",
        Status: "Up",
        Ports: [],
      },
    ],
  });
  const adapter = makeAdapter(docker);
  await adapter.deploy("2.0.0");
  await adapter.rollback();
  assert.equal(docker.calls.started, 1);
});

test("rollback wraps previous-container restart failure as DockerError", async () => {
  const docker = makeFakeDocker({
    listContainers: async () => [
      {
        Id: "old-id",
        Names: ["/app"],
        Image: "old",
        State: "exited",
        Status: "Exited",
        Ports: [],
      },
    ],
    getContainer: () => ({
      start: async () => {
        throw new Error("restart failed");
      },
      stop: async () => {},
      remove: async () => {},
    }),
  });
  const adapter = makeAdapter(docker);
  await adapter.deploy("2.0.0");
  await assert.rejects(
    adapter.rollback(new Error("health failed")),
    (error) => {
      if (!(error instanceof DockerError)) return false;
      const originalError = error.context.originalError;
      return (
        error.message ===
          "CRITICAL: rollback failed — manual intervention required" &&
        originalError instanceof Error &&
        originalError.message === "health failed"
      );
    },
  );
});

test("compose deploy is rejected before Docker or Compose side effects", async () => {
  let listContainerCalls = 0;
  const docker = makeFakeDocker({
    listContainers: async () => {
      listContainerCalls += 1;
      return [];
    },
  });
  const calls = [];
  const compose = {
    pull: async () => {
      calls.push("pull");
    },
    up: async () => {
      calls.push("up");
      return { id: "compose-new" };
    },
  };
  const adapter = makeAdapter(docker, {
    composeFile: "compose.yml",
    dockerComposeClient: compose,
  });

  await assert.rejects(
    adapter.deploy("2.0.0"),
    (error) =>
      error instanceof DockerError &&
      error.context.operation === "deploy" &&
      error.context.mode === "compose" &&
      error.message.includes("Compose deployments are disabled"),
  );
  assert.deepEqual(docker.calls.pull, []);
  assert.deepEqual(docker.calls.created, []);
  assert.equal(listContainerCalls, 0);
  assert.deepEqual(calls, []);
});
