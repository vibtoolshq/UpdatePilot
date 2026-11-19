---
title: "Configuration"
description: "Validated configuration fields and defaults."
order: 2
---

# Configuration reference

`defineConfig(userConfig)` validates known keys, resolves defaults, normalizes a leading `v` in `currentVersion`, returns a deeply frozen object, and throws `ConfigError` for invalid input. `validateConfig(resolvedConfig)` revalidates an already-resolved config and returns `true`; it does **not** accept arbitrary unresolved user config as a substitute.

```js
import { defineConfig, validateConfig } from "update-pilot";

const config = defineConfig({
  repo: "acme/shop",
  currentVersion: "v1.2.3",
  github: { includePrerelease: false },
  docker: { image: "ghcr.io/acme/shop", containerName: "shop" },
  health: { url: "http://127.0.0.1:3000/health" },
  rollback: { enabled: true },
  logger: { level: "info" }
});
console.log(config.currentVersion); // "1.2.3"
console.log(validateConfig(config)); // true
```

## Root keys

| Key | Required | Type / behavior |
| --- | --- | --- |
| `repo` | Yes | `"owner/repo"` matching letters/digits/underscore/dot/dash |
| `currentVersion` | Yes | semver-style version or 7–40 hex SHA; `v` prefix normalized |
| `github` | No | GitHub API/cache settings |
| `docker` | Yes | image and Docker settings |
| `health` | Yes | HTTP(S) health endpoint and probe policy |
| `rollback` | No | rollback and image retention |
| `hooks` | No | known named functions (listed below) |
| `logger` | No | `createLogger` options; a logger object is resolved internally |

`currentVersionRaw` exists only on the resolved config and cannot be passed to an initial `defineConfig` call.

## GitHub options

| Key | Type | Default | Details |
| --- | --- | --- | --- |
| `token` | string (>=20 chars) | undefined | optional authentication |
| `includePrerelease` | boolean | `false` | eligible prerelease selection |
| `cacheFile` | nonempty string | `.update-cache.json` | local JSON cache |
| `cacheTTL` | finite number >=0 | `300000` | ms; 0 disables cache hits |

## Docker options

| Key | Type | Default | Details |
| --- | --- | --- | --- |
| `image` | nonempty string | **required** | Docker repository without a tag |
| `tag` | nonempty string | `latest` | default adapter tag |
| `containerName` | nonempty string | final segment of `repo` | exact current-container name |
| `socketPath` | nonempty string | `/var/run/docker.sock` | Docker Engine API socket |
| `composeFile` | optional nonempty string | undefined | **recognized but deploy rejects Compose** |

## Health options

| Key | Type | Default | Details |
| --- | --- | --- | --- |
| `url` | absolute HTTP(S) URL | **required** | live endpoint; router must return separate candidate URL |
| `retries` | integer 1–30 | `5` | total attempts |
| `timeout` | finite number 100–60000 | `5000` | ms per attempt; config accepts non-integers, unlike direct HealthAdapter constructor |
| `interval` | integer 0–60000 | `2000` | ms between attempts |
| `expectStatus` | integer 100–599 | `200` | exact expected HTTP status |
| `headers` | object of string values | `{}` | non-empty header names |

## Rollback, hooks and logging

`rollback.enabled` defaults `true`; `rollback.keepImages` defaults `3` (integer 0–100). With automatic rollback disabled, health failure still requests router route cleanup but may leave Docker candidate state pending; it is **not** a successful update.

`hooks` accepts only `beforeCheck`, `afterCheck`, `beforeDeploy`, `afterDeploy`, `beforeVerify`, `afterVerify`, `beforeRollback`, `afterRollback`, and `onError`; each value must be a function. Unknown config keys are rejected.

`logger` is the options object for `createLogger`: `level` (`silent|error|warn|info|debug`), `prefix`, `pretty`, `stream` and `redact`. Defaults and behavior: [hooks/logger](../api/hooks-and-logging.md).

**Environment variables:** the library itself does not automatically read `GITHUB_TOKEN`, `APP_VERSION` or `DOCKER_IMAGE`. Consumers explicitly read environment variables and populate config. The bundled Express example reads its own named variables: [integration](integration.md).