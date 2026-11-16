import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error("Run this check through `npm run test:package`");

function runNode(args, cwd, label) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${label} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { cause: result.error },
    );
  return result;
}

function runNpm(args, cwd, label) {
  return runNode([npmCli, ...args], cwd, label);
}

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "update-pilot-package-smoke-"),
);

try {
  const packResult = runNpm(
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    root,
    "npm pack",
  );
  const [packageInfo] = JSON.parse(packResult.stdout);
  const packageFiles = packageInfo.files.map(({ path }) => path);
  const requiredFiles = [
    "src/index.js",
    "src/types/index.d.ts",
    "testing/traffic-router-contract.js",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
  ];
  for (const file of requiredFiles)
    assert.ok(packageFiles.includes(file), `Package is missing ${file}`);
  assert.ok(
    packageFiles.every(
      (file) =>
        !/^(?:test|tests|type-tests|scripts|notes|\.github)\//.test(file),
    ),
    "Package contains test, verification, private-note, or CI files",
  );

  const consumerDirectory = join(temporaryDirectory, "consumer");
  await mkdir(consumerDirectory);
  runNpm(
    [
      "install",
      "--prefix",
      consumerDirectory,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporaryDirectory, packageInfo.filename),
    ],
    root,
    "fresh tarball install",
  );

  const typeFixturePath = join(
    consumerDirectory,
    "traffic-router-contract.mts",
  );
  await writeFile(
    typeFixturePath,
    `import {
  defineTrafficRouterContractTests,
  type TrafficRouterContractTestOptions,
} from "update-pilot/testing/traffic-router-contract";

const options: TrafficRouterContractTestOptions = {
  providerName: "tarball type smoke",
  createScenario: async () => ({
    trafficRouter: {
      prepare: async () => ({ healthUrl: "http://candidate.test/health" }),
      switch: async () => {},
      rollback: async () => {},
    },
    deployment: {
      from: "1.2.3",
      to: "1.3.0",
      healthUrl: "http://app.test/health",
      previousContainerId: "previous",
      newContainerId: "candidate",
      candidatePorts: {},
    },
    verifyCandidateHealth: async (preparation, deployment) => {
      void preparation.healthUrl;
      void deployment.to;
    },
    assertOldRouteActive: async () => {},
    assertCandidateRouteActive: async () => {},
    assertPreparationCleaned: async () => {},
    cleanup: async () => {},
  }),
};

defineTrafficRouterContractTests(options);
`,
    "utf8",
  );
  runNpm(
    [
      "exec",
      "--yes",
      "--package",
      "typescript@5.9.3",
      "--",
      "tsc",
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      typeFixturePath,
    ],
    consumerDirectory,
    "fresh tarball TypeScript provider scenario compile",
  );

  runNode(
    [
      "-e",
      [
        'const assert = require("node:assert/strict");',
        'const api = require("update-pilot");',
        'const health = require("update-pilot/adapters/health");',
        'const testing = require("update-pilot/testing/traffic-router-contract");',
        'assert.equal(typeof api.UpdatePilot, "function");',
        'assert.equal(typeof health.HealthAdapter, "function");',
        'assert.equal(typeof testing.defineTrafficRouterContractTests, "function");',
        "assert.ok(new api.HookBus() instanceof api.HookBus);",
        'assert.equal("default" in api, false);',
      ].join("\n"),
    ],
    consumerDirectory,
    "fresh CommonJS require smoke",
  );
  runNode(
    [
      "--input-type=module",
      "-e",
      [
        'import assert from "node:assert/strict";',
        'import * as api from "update-pilot";',
        'import { HealthAdapter } from "update-pilot/adapters/health";',
        'import { defineTrafficRouterContractTests } from "update-pilot/testing/traffic-router-contract";',
        'assert.equal(typeof api.UpdatePilot, "function");',
        'assert.equal(typeof HealthAdapter, "function");',
        'assert.equal(typeof defineTrafficRouterContractTests, "function");',
        "assert.ok(new api.HookBus() instanceof api.HookBus);",
        'assert.equal("default" in api, false);',
      ].join("\n"),
    ],
    consumerDirectory,
    "fresh ESM import smoke",
  );

  console.log(
    `Fresh ESM/CommonJS and TypeScript consumer smoke passed: ${packageFiles.length} files, ${Math.round(packageInfo.size / 1024)} KB compressed`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
