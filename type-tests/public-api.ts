import type { TrafficRouter } from "update-pilot";
import { HOOKS, HookBus, UpdatePilot } from "update-pilot";
import { DockerAdapter } from "update-pilot/adapters/docker";
import { GitHubAdapter } from "update-pilot/adapters/github";
import { HealthAdapter } from "update-pilot/adapters/health";
import {
  defineTrafficRouterContractTests,
  type TrafficRouterContractTestOptions,
} from "update-pilot/testing/traffic-router-contract";

const hooks: HookBus = new HookBus();
hooks.on(HOOKS.BEFORE_CHECK, (payload) => payload);

const engine = new UpdatePilot({
  repo: "owner/repository",
  currentVersion: "1.2.3",
  docker: { image: "ghcr.io/owner/repository" },
  health: { url: "http://127.0.0.1:8080/health" },
});

void engine;
void new DockerAdapter({ image: "ghcr.io/owner/repository" });
void new GitHubAdapter({ repo: "owner/repository", currentVersion: "1.2.3" });
void new HealthAdapter({ url: "http://127.0.0.1:8080/health" });

const trafficRouter: TrafficRouter = {
  prepare: async () => ({ healthUrl: "http://127.0.0.1:49152/ready" }),
  switch: async () => {},
  rollback: async () => {},
};
const routerContract: TrafficRouterContractTestOptions = {
  providerName: "example router",
  createScenario: async () => ({
    trafficRouter,
    deployment: {
      from: "1.2.3",
      to: "1.3.0",
      healthUrl: "http://127.0.0.1:8080/health",
      previousContainerId: "previous",
      newContainerId: "candidate",
      candidatePorts: {
        "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "49152" }],
      },
    },
    verifyCandidateHealth: async () => {},
    assertOldRouteActive: async () => {},
    assertCandidateRouteActive: async () => {},
    assertPreparationCleaned: async () => {},
    cleanup: async () => {},
  }),
};

void defineTrafficRouterContractTests;
void routerContract;
