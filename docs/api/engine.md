# UpdatePilot engine API

**Import:** `import { UpdatePilot } from "update-pilot";`
**Implementation:** `src/core/engine.js`, with declarations in `src/types/index.d.ts`.

## Constructor and properties

| Signature | Description |
| --- | --- |
| `new UpdatePilot(userConfig: UserConfig, deps?: UpdatePilotDependencies)` | Validates config with `defineConfig`, builds a hook bus, injects or lazily creates adapters |
| `pilot.config: ResolvedConfig` | Deeply frozen resolved configuration |
| `pilot.logger: Logger` | Engine logger |
| `pilot.hooks: HookBus` | Active lifecycle hook bus |

`deps` may include `githubAdapter`, `dockerAdapter`, `healthAdapter`, `trafficRouter`, `logger`, and `hookBus`. Injection is useful in tests; the built-in Docker deployment path requires an application-supplied valid `trafficRouter`. An injected custom Docker adapter can own handoff when no router is supplied.

## Methods

### `checkOnly(): Promise<CheckResult>`

Checks eligible releases using `GitHubAdapter.check()`, emits `beforeCheck` and `afterCheck`, and returns fields listed under [CheckResult](types.md). Does not start Docker. Throws wrapped errors including `GitHubError`, `RateLimitError`, `UpdateInProgressError`.

### `runUpdate(options?: { dryRun?: boolean; force?: boolean }): Promise<UpdateResult>`

Both options default to `false`. Calls release lookup, returns `up-to-date` if no update and not forced, returns `dry-run` if a newer/forced release exists and `dryRun` is true. Otherwise checks pending rollback state, deploys via Docker, prepares router context, verifies candidate URL, switches traffic, finalizes, then returns `updated`.

**Outcome variants:**

| Status | Additional fields |
| --- | --- |
| `up-to-date` | `currentVersion`, `latestVersion`, `checkedAt` |
| `dry-run` | `wouldDeploy: { from, to }`, `checkedAt` |
| `updated` | `from`, `to`, `newContainerId`, `healthLatencyMs`, `durationMs`, `checkedAt` |
| `rolled-back` | `reason: "health-check-failed"`, `from`, `to`, `healthError: { message, context }`, `durationMs` |

A release is required even if `force` is true. If a health probe fails and enabled rollback succeeds, the method returns `rolled-back`; failures in other phases throw the appropriate wrapped error. On critical rollback failure, the message may begin `CRITICAL:` and manual intervention is necessary.

### `getStatus(): EngineStatus`

Synchronous snapshot: `running`, `lastResult`, `currentVersion`, `repo`, and `uptime: { startedAt, engineSince }`. This is in-memory runtime status; it does not query Docker or persist history.

### `rollback(): Promise<ManualRollbackResult>`

Manually restores the pending or last successful deployment and asks the router to restore traffic. Returns `{ status: "rolled-back-manual", to: string }`. Throws `RollbackError` if no previous result/restore target exists or recovery fails. The instance-level concurrency guard blocks simultaneous updates/rollback. A successful `runUpdate` finalizes/removes the previous container; `restorePrevious()` may attempt recreation from retained image information, which depends on the deployment environment and image retention.

## Error handling and hooks

All deployment callers should wrap `await pilot.runUpdate()` in `try/catch`, distinguish `UpdatePilotError.code` values, **sanitize** error `context` and `stack` before responding to HTTP clients, and avoid pretending that successful hooks certify successful deployment. `runUpdate` resets its `running` flag in a `finally` block. See [errors](errors.md) and [hooks](hooks-and-logging.md).

## Representative example

```js
import { UpdatePilot, isUpdatePilotError } from "update-pilot";

async function checkFromAdmin(config) {
  const pilot = new UpdatePilot(config);
  try {
    return await pilot.checkOnly();
  } catch (error) {
    if (isUpdatePilotError(error)) {
      console.error(error.code, error.message);
    }
    throw error;
  }
}
```

This example uses GitHub I/O for real checks and expects a valid application config. It does not deploy.