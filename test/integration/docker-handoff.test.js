import Docker from "dockerode";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DockerAdapter } from "../../src/adapters/docker.js";
import { HealthAdapter } from "../../src/adapters/health.js";

const enabled = process.env.UPDATEPILOT_DOCKER_INTEGRATION === "1";

async function removeContainer(docker, id) {
  if (!id) return;
  const container = docker.getContainer(id);
  try {
    await container.stop();
  } catch {
    // The test may already have stopped or removed the container.
  }
  try {
    await container.remove({ force: true });
  } catch {
    // Cleanup is best-effort after a failed integration assertion.
  }
}

test(
  "opt-in Docker handoff probes the candidate on a distinct published port",
  { skip: !enabled, timeout: 30_000 },
  async () => {
    const docker = /** @type {any} */ (new Docker());
    const imageRef =
      process.env.UPDATEPILOT_DOCKER_TEST_IMAGE ?? "nginx:alpine";
    const separator = imageRef.lastIndexOf(":");
    assert.ok(separator > 0, "Docker test image must include an explicit tag");
    const image = imageRef.slice(0, separator);
    const tag = imageRef.slice(separator + 1);
    const containerName = `updatepilot-handoff-${process.pid}-${Date.now()}`;
    let oldContainer;
    let deployment;
    let adapter;

    try {
      await docker.getImage(imageRef).inspect();
      oldContainer = await docker.createContainer({
        Image: imageRef,
        name: containerName,
        ExposedPorts: { "80/tcp": {} },
        HostConfig: {
          PortBindings: {
            "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "0" }],
          },
        },
      });
      await oldContainer.start();
      const oldDetails = await oldContainer.inspect();
      const oldPort = oldDetails.NetworkSettings.Ports["80/tcp"][0].HostPort;

      adapter = new DockerAdapter({
        image,
        tag,
        containerName,
        dockerClient: docker,
      });
      adapter.pull = async () => ({ pulled: true, image: imageRef });
      deployment = await adapter.deploy(tag);

      const candidatePort = deployment.candidatePorts["80/tcp"][0].HostPort;
      assert.notEqual(candidatePort, oldPort);
      const health = new HealthAdapter({
        url: `http://127.0.0.1:${candidatePort}/`,
        retries: 20,
        interval: 250,
        timeout: 1_000,
      });
      const result = await health.check();
      assert.equal(result.healthy, true);
      assert.equal(result.status, 200);
      assert.equal((await oldContainer.inspect()).State.Running, true);

      const rollback = await adapter.rollback();
      assert.equal(rollback.restoredContainerId, oldContainer.id);
    } finally {
      if (adapter) {
        try {
          await adapter.rollback();
        } catch {
          // A prior rollback or failed deploy can leave no adapter state.
        }
      }
      await removeContainer(docker, deployment?.newContainerId);
      await removeContainer(docker, oldContainer?.id);
      const remaining = await docker.listContainers({
        all: true,
        filters: { name: [containerName] },
      });
      assert.equal(remaining.length, 0, "test containers must be removed");
    }
  },
);
