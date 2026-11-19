# Internal systems and module map

This page maps implementation details for maintainers; underscore-prefixed methods and unexported helpers are **not** supported consumer APIs.

| File | Internal responsibility |
| --- | --- |
| `src/index.js` | only root runtime exports and `VERSION` |
| `src/core/engine.js` | update state machine, injection, status, rollback context, phase errors |
| `src/core/config.js` | strict root/subobject validation, defaults, version normalization, deep freeze |
| `src/core/events.js` | sequential async hook collection; `HookBus` and `HOOKS` are public |
| `src/adapters/github.js` | GitHub fetch/retry, version comparison, prerelease filtering, disk cache, rate limit |
| `src/adapters/docker.js` | Docker image pull, existing container lookup, candidate with dynamic host ports, finalize and restore |
| `src/adapters/health.js` | HTTP(S) GET, abort/timeout, retries, exact status |
| `src/utils/errors.js` | error constructors and `toJSON()` |
| `src/utils/logger.js` | level filtering, child binding, exact-key redaction |
| `src/utils/retry.js` | private `retry()` and `sleep()` helpers |
| `src/utils/events.js` | internal legacy HookBus re-export |
| `src/types/index.d.ts` | declared root, adapter and testing-subpath TypeScript API |
| `testing/traffic-router-contract.js` | exported Node test helper for downstream provider conformance |

## State and concurrency

`UpdatePilot` stores `_running`, `_lastResult`, pending rollback version and router state, last successful update, and engine initialization time in instance memory. An in-process flag rejects concurrent full updates/rollback; it is not a host-distributed mutex or persisted job queue. The configured current version does not automatically update in place after successful deployment.

The Docker adapter retains references to the previous and new containers until cleanup. Finalize removes the old container and prunes images beyond configured retention (protecting current/previous known image IDs). Manual rollback may attempt to reconstruct a removed previous container from image data retained in memory; real recovery is topology/image dependent.

## Release discovery and cache

The GitHub adapter uses `GET /repos/{owner}/{repo}/releases?per_page=10` and recognizes GitHub rate-limit headers. It ignores draft releases, optionally excludes prereleases, sorts eligible entries by publication time, and compares semver-like tags or SHAs against the configured version. It stores a best-effort JSON cache at `github.cacheFile`, with matching repo, base URL, prerelease policy, TTL and rate-limit metadata. No database is used.

## Hook and error propagation

`HookBus.emit` stops on a failing handler; `HookBus.emitSafe` collects results/errors. The engine uses the safe form to avoid handler failures corrupting deployment transitions. Public error subclasses wrap phase context with `cause` where appropriate; critical rollback failures are intentionally distinct and should be escalated to operators.

## Unsupported/internal paths

`DockerAdapter.deploy` rejects when `composeFile` is configured before touching Docker. The now-unreachable Compose branch must not be treated as implemented. The source imports `dockerode-compose`, but a dependency being installed does not imply Compose support. `src/utils/retry.js` has no declared package export. A custom handoff-owning Docker adapter uses an internal no-op router only to preserve the engine lifecycle; it is not traffic-switch certification.

For external contracts use [API reference](../api/index.md), not internal file paths.