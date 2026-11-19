---
title: "Basic Usage"
description: "Release checking, deployment results, and rollback handling."
order: 1
---

# Engine usage and result handling

`UpdatePilot` checks eligible GitHub releases, deploys a candidate if an update is needed, probes the **candidate** through an injected router or custom adapter, switches traffic, and finalizes the Docker container. The returned `status` is a discriminant, not a boolean.

| Call | Effect | Return |
| --- | --- | --- |
| `pilot.checkOnly()` | Release lookup only; emits check hooks | `Promise<CheckResult>` |
| `pilot.runUpdate()` | Full lifecycle | `Promise<UpdateResult>` |
| `pilot.runUpdate({ dryRun: true })` | Check; report intended deployment if newer version (no Docker operations) | `dry-run` or `up-to-date` |
| `pilot.runUpdate({ force: true })` | Attempt deployment despite version comparison, but requires an eligible release | `UpdateResult` or error |
| `pilot.getStatus()` | Snapshot | `EngineStatus` |
| `pilot.rollback()` | Attempt manual rollback of pending/last successful update | `rolled-back-manual` or error |

Result statuses from `runUpdate` are `up-to-date`, `dry-run`, `updated`, and `rolled-back`. A failed prepare/switch/finalize or an unrecoverable rollback generally **throws** rather than returning `rolled-back`. A health failure only yields `rolled-back` after enabled automatic recovery succeeds. The `rollback()` method can return `rolled-back-manual`.

```js
const result = await pilot.runUpdate({ dryRun: true });
switch (result.status) {
  case "up-to-date":
    console.log("No eligible newer release");
    break;
  case "dry-run":
    console.log("Would deploy", result.wouldDeploy.to);
    break;
  case "updated":
    console.log("Now deployed", result.to);
    break;
  case "rolled-back":
    console.error("Candidate unhealthy", result.reason);
    break;
}
```

This snippet assumes an existing `pilot` variable. `runUpdate` rejects concurrent **update** calls with `UpdateInProgressError` while an update/rollback is active; this lock exists in one engine instance, not across multiple Node processes. The configured `currentVersion` is frozen at construction and is not automatically persisted after an update. The application must track its deployed version and handle version refresh/reinitialization. See [engine reference](../api/engine.md) and [errors](../api/errors.md).

## Hooks

Configure callbacks in `hooks` or use `pilot.hooks.on(HOOKS.BEFORE_DEPLOY, handler)`. The engine uses safe emission so callback failures are logged rather than breaking the deployment. [Hook signatures](../api/hooks-and-logging.md).

## Rollback safety

The built-in Docker adapter tries to retain the previous container until verification. No first-party router controls real traffic; verify your provider's candidate-only health URL and recovery behavior. State is kept in process memory; restarting the process may lose manual rollback context. Never treat this as durable disaster recovery.