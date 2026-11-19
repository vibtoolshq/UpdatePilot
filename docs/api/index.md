---
title: "Public API Reference"
description: "Public runtime exports, package subpaths and API navigation."
order: 0
---

# Public API index

**Runtime export source:** `src/index.js`. **Types:** `src/types/index.d.ts`. **Published subpaths:** `package.json#exports`. The root package exports **20 named runtime values**; the test-helper subpath exports one additional public function.

| Group | Exported symbols | Reference |
| --- | --- | --- |
| Engine/config (3) | `UpdatePilot`, `defineConfig`, `validateConfig` | [Engine](engine.md), [Configuration](../guides/configuration.md) |
| Adapters (3) | `GitHubAdapter`, `DockerAdapter`, `HealthAdapter` | [Adapters](adapters.md) |
| Events (2) | `HookBus`, `HOOKS` | [Hooks](hooks-and-logging.md) |
| Logging (2) | `createLogger`, `silentLogger` | [Hooks/logger](hooks-and-logging.md) |
| Exceptions (9) | `UpdatePilotError`, `ConfigError`, `GitHubError`, `DockerError`, `HealthCheckError`, `RollbackError`, `UpdateInProgressError`, `RateLimitError`, `isUpdatePilotError` | [Exceptions](errors.md) |
| Version (1) | `VERSION` = `"0.0.1"` | [Compatibility](../reference/compatibility.md) |
| Separate testing subpath (1) | `defineTrafficRouterContractTests` | [Testing helper](router-contract-tests.md) |

## Import paths and visibility

```js
import {
  UpdatePilot, defineConfig, validateConfig,
  GitHubAdapter, DockerAdapter, HealthAdapter,
  HookBus, HOOKS, createLogger, silentLogger,
  UpdatePilotError, ConfigError, GitHubError,
  DockerError, HealthCheckError, RollbackError,
  UpdateInProgressError, RateLimitError,
  isUpdatePilotError, VERSION
} from "update-pilot";
import { defineTrafficRouterContractTests } from "update-pilot/testing/traffic-router-contract";
```

The three supported adapter subpaths are `update-pilot/adapters/github`, `update-pilot/adapters/docker`, and `update-pilot/adapters/health`. These export the corresponding named class. The `"import"` and `"require"` conditions point at the same ESM file, with Node's synchronous ESM interop on declared supported versions.

**Not public package APIs:** `src/utils/retry.js` (`retry`, `sleep`), `src/utils/events.js` (internal legacy re-export), underscore-prefixed engine/adapter methods, `src/core/*` file paths, the example HTTP endpoints (application example only), and the private Docker Compose code branch. Do not import these through undeclared package subpaths.

Runtime exports and type-only exports have different counts; see the [TypeScript reference](types.md).