# TypeScript public types and interfaces

**Declaration source:** `src/types/index.d.ts`. These types are available from `update-pilot` and `update-pilot/testing/traffic-router-contract`; they are erased at runtime. The package declares no independent TypeScript compiler output; declarations describe the shipped JavaScript API.

## Configuration types

| Type | Contents |
| --- | --- |
| `UserConfig` | `repo`, `currentVersion`, `docker`, `health` required; `github`, `rollback`, `hooks`, `logger` optional |
| `ResolvedConfig` | all sections resolved, frozen at runtime, `currentVersionRaw`, normalized `currentVersion`, resolved logger |
| `GitHubConfig` / `ResolvedGitHubConfig` | token, prerelease flag, cache TTL/path |
| `DockerConfig` / `ResolvedDockerConfig` | image/tag, optional Compose path, name, socket |
| `HealthConfig` / `ResolvedHealthConfig` | URL, retry/timeout/interval, status, headers |
| `RollbackConfig` / `ResolvedRollbackConfig` | enabled, keepImages |
| `LoggerConfig`, `Logger`, `LogLevel` | logger options, methods, severity union |
| `HooksConfig`, `HookHandler<T>` | typed lifecycle callbacks and payloads |
| `UpdatePilotDependencies` | injectable adapters, logger, bus, router |

## Result types

| Type | Meaning |
| --- | --- |
| `CheckResult` | `updateAvailable`, current/latest raw/normalized versions, release URL/notes/published time, prerelease/cache/rate-limit metadata |
| `UpToDateResult`, `DryRunResult`, `UpdatedResult`, `RolledBackResult` | the four run-update discriminated variants |
| `ManualRollbackResult` | `{ status: "rolled-back-manual"; to: string }` |
| `UpdateResult` | union of the five result types above (including manual rollback) |
| `EngineStatus` | process-local status and uptime |
| `HealthResult` | successful health probe metadata |
| `DockerDeployResult`, `DockerFinalizeResult`, `DockerRollbackResult` | Docker lifecycle payloads |
| `ErrorOptions` | code, cause, context |
| `GitHubAdapterOptions`, `DockerAdapterOptions`, `HealthAdapterOptions` | direct-adapter constructor options |

The source `runUpdate()` declaration returns `Promise<UpdateResult>`, whose declared union includes `ManualRollbackResult` even though `runUpdate` never produces that status at runtime; only `rollback()` produces it. Handle that type conservatively or narrow in the calling application. The `DockerAdapter.getCurrentContainer()` runtime can include an optional `imageId` although its type declaration does not list it; do not rely on this field as a stable declared contract.

## Router types

- `TrafficRouterDeployment`: `from`, `to`, `healthUrl`, `previousContainerId`, `newContainerId`, `candidatePorts`.
- `TrafficRouterPreparation`: `{ healthUrl: string; context?: unknown }`.
- `TrafficRouter`: `prepare(deployment): Promise<TrafficRouterPreparation>`, `switch(deployment, context?): Promise<void>`, `rollback(deployment, context?, reason?): Promise<void>`.
- `TrafficRouterContractScenario` (testing subpath): provider, deployment, five checks/teardown functions.
- `TrafficRouterContractTestOptions` (testing subpath): `providerName` and `createScenario()`.

Hook payload type names: `BeforeCheckPayload`, `AfterCheckPayload`, `BeforeDeployPayload`, `AfterDeployPayload`, `BeforeVerifyPayload`, `AfterVerifyPayload`, `BeforeRollbackPayload`, `AfterRollbackPayload`, and `OnErrorPayload`. They correspond to `HOOKS` names in [hooks](hooks-and-logging.md).

```ts
import {
  defineConfig,
  type UserConfig,
  type TrafficRouter,
  type UpdateResult
} from "update-pilot";

const settings: UserConfig = {
  repo: "acme/app",
  currentVersion: "1.0.0",
  docker: { image: "ghcr.io/acme/app" },
  health: { url: "http://localhost:3000/health" }
};
const config = defineConfig(settings);
const resultStatus = (result: UpdateResult) => result.status;
void config;
void resultStatus;
```

For the full exact type surface use the declaration file as definitive source, and test consuming the published tarball using `npm run test:package`.