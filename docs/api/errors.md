# Error API and failure modes

Every named error constructor below is imported from `update-pilot` and extends `UpdatePilotError`, which extends native `Error`.

| Constructor | Default `code` | Common origin |
| --- | --- | --- |
| `UpdatePilotError` | `E_UPDATEPILOT` | fallback wrapping of unknown failures |
| `ConfigError` | `E_CONFIG` | unresolved invalid config, router config |
| `GitHubError` | `E_GITHUB` | release API failures, no eligible release for deployment |
| `DockerError` | `E_DOCKER` | pull/deploy/finalize/restore/rollback errors |
| `HealthCheckError` | `E_HEALTH` | unsuccessful HTTP probe, cancellation |
| `RollbackError` | `E_ROLLBACK` | missing restore target or failed recovery |
| `UpdateInProgressError` | `E_BUSY` | instance-level operation overlap |
| `RateLimitError` | `E_RATE_LIMIT` | GitHub API rate limit exhausted |

Constructors have the shape `new ErrorClass(message: string, options?: ErrorOptions)` where `ErrorOptions` is `{ code?: string; cause?: unknown; context?: Record<string, unknown> }`. Subclasses set their default code but may be explicitly overridden with `options.code`.

`isUpdatePilotError(value: unknown): value is UpdatePilotError` is the public narrowing predicate.

`error.toJSON()` returns `{ name, code, message, context, stack }`. This representation is **not guaranteed safe for untrusted clients**: context may contain nested errors, tokens, URLs or internal objects, and stack traces disclose implementation details. Sanitize before returning externally.

```js
import { ConfigError, isUpdatePilotError } from "update-pilot";

try {
  throw new ConfigError("Invalid app config", {
    context: { field: "repo" }
  });
} catch (error) {
  if (isUpdatePilotError(error)) {
    console.log(error.code); // E_CONFIG
    console.log(error.message);
  }
}
```

**Recovery semantics:** health failure with enabled successful rollback yields a `rolled-back` result; route prepare/switch errors normally throw after cleanup; critical dual failures include `CRITICAL:` and require operator intervention. An `UpdateInProgressError` is not a distributed lock. See [engine API](engine.md) and [troubleshooting](../help/troubleshooting.md).