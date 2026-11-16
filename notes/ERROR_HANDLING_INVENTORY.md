# Error-Handling Inventory

**Snapshot:** 2026-11-15, HEAD `e773671` plus local overlay. This document records observed behavior and gaps; it does not itself authorize runtime changes.

## Error Types

| Type                    | Code            | Main source                                                       |
| ----------------------- | --------------- | ----------------------------------------------------------------- |
| `UpdatePilotError`      | `E_UPDATEPILOT` | Base error with cause/context and `toJSON()`.                     |
| `ConfigError`           | `E_CONFIG`      | Configuration and invalid router shape.                           |
| `GitHubError`           | `E_GITHUB`      | Release lookup, response, and no eligible release.                |
| `RateLimitError`        | `E_RATE_LIMIT`  | GitHub quota exhausted.                                           |
| `DockerError`           | `E_DOCKER`      | Docker pull/deploy/finalize/rollback, including disabled Compose. |
| `HealthCheckError`      | `E_HEALTH`      | Invalid target, timeout, network, status, or abort.               |
| `RollbackError`         | `E_ROLLBACK`    | Recovery failed or needs manual intervention.                     |
| `UpdateInProgressError` | `E_BUSY`        | Concurrent update/manual rollback.                                |

## Observed Handling

- `defineConfig()` validates and copies supported values; configuration failures carry field context.
- GitHub and Docker adapters translate provider failures to typed errors with causes/context; retry policy excludes configuration and rate-limit errors.
- Health failures preserve URL, status/attempt context, and cancellation/timeout distinctions.
- The engine wraps non-catastrophic `runUpdate()` failures with phase and duration context, preserves known UpdatePilot error subclasses, and emits `ON_ERROR` safely.
- For an injected router, the engine validates the candidate health URL (absolute HTTP(S), not the live configured URL) inside the preparation cleanup boundary. Invalid output is a `ConfigError`; the engine calls provider rollback with the captured context and `"prepare-failed"`, then Docker rollback, before rethrowing. A prepare rejection before returning context calls rollback with `undefined` context.
- Health failure restores route before Docker rollback when automatic rollback is enabled; when disabled it cleans the route but retains the candidate for manual recovery. Switch failure attempts route/Docker rollback with the same opaque context; failed recovery raises `RollbackError`.
- If a custom Docker adapter is injected without a router, it owns handoff and may return `DockerDeployResult.healthUrl` as its candidate probe. The internal no-op router keeps that path working; it does not certify candidate-only routing.
- Manual rollback stages the previous Docker service before restoring the router, then removes/promotes containers. A router rollback error becomes a manual `RollbackError`.
- Example routes return JSON errors but are unauthenticated to same-host processes; loopback binding is not authentication.

## Universal Provider Error Contract — Work Remaining

1. Phase 01 defines preparation cleanup when no context is returned, partial-switch recovery, context forwarding, and idempotent rollback in the public contract.
2. Phase 02 added generic conformance scenarios for health failure, unavailable preparation context, partial switch, repeated rollback, and cleanup after assertion failure. Each provider project still needs to run the suite against isolated real infrastructure.
3. Ensure provider errors retain a useful cause and lifecycle phase without leaking credentials or full internal context through public HTTP responses.

## Other Known Error Gaps

- `DockerAdapter.getCurrentContainer()` currently catches all lookup failures and returns `null`, conflating “not found” with daemon/API errors.
- Rollback/recovery metadata is process-local; process restart recovery is not established.
- `UpdatePilotError.toJSON()` contains stack/context; applications must sanitize data before returning it to remote callers.
- Compose errors are fail-fast because Compose is intentionally unsupported; do not imply Compose rollback handling exists.
- A concrete provider is not bundled, so network/API-specific retries, rate limits, credentials, and provider error mappings belong to that provider project unless a generic contract need is demonstrated.

## Verification Rules

For each error-path phase, assert both error class/code/context and resulting route/container state. Keep route rollback order observable. Do not label a fake-provider error test as proof of a real provider.
