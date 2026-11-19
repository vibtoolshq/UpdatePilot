# Integration: traffic router, admin endpoint, and Express example

## Traffic router contract

The built-in Docker adapter requires an application-provided `trafficRouter` with three asynchronous methods:

| Method | Contract |
| --- | --- |
| `prepare(deployment)` | Start candidate-only routing while keeping the old live route active. Return `{ healthUrl, context? }`; URL must be absolute HTTP(S), distinct from live URL (fragments ignored). |
| `switch(deployment, context)` | Switch live traffic only after the engine's candidate health check; resolve when active. |
| `rollback(deployment, context, reason)` | Restore old live route and clear preparation. Idempotent, including `context=undefined` after failed preparation. |

`deployment` supplies `from`, `to`, `healthUrl`, `previousContainerId`, `newContainerId`, and `candidatePorts`. The engine validates URL shape, not real router isolation: **your integration must assert that candidate health does not reach the old container**. Providers must clean partial preparation even when `prepare()` throws. A custom *injected* Docker adapter may own switching and optionally return `healthUrl` in its deployment result; that path is separate from the default adapter and does not receive a first-party router certification.

Pass a provider only after implementing and testing these methods in your actual environment:

```js
import { UpdatePilot } from "update-pilot";
import trafficRouter from "./traffic-router.js"; // application-owned, not included

const pilot = new UpdatePilot({
  repo: "acme/shop",
  currentVersion: process.env.APP_VERSION,
  docker: { image: "ghcr.io/acme/shop", containerName: "shop" },
  health: { url: "https://shop.example.com/health" }
}, { trafficRouter });

// Call only from an authenticated, authorized admin action:
// const result = await pilot.runUpdate();
```

`./traffic-router.js` is deliberately an application-owned module, not something the package ships. See [conformance tests](../api/router-contract-tests.md).

## Existing Express example

The repository includes `examples/basic-express/server.js`. It exposes `GET /health`, `GET /api/status`, `GET /api/check`, `POST /api/update`, and `POST /api/rollback` on **127.0.0.1**. **It has no authentication** and must not be publicly exposed.

By default `UPDATE_PILOT_DEMO` is not `0`; the example injects fake GitHub, Docker, and HTTP adapters and performs **no real deployment**. In real mode (`UPDATE_PILOT_DEMO=0`), it requires `GITHUB_REPOSITORY`, `APP_VERSION`, `DOCKER_IMAGE`, `HEALTH_URL`, and `TRAFFIC_ROUTER_MODULE`. It optionally reads `GITHUB_TOKEN` and `PORT`; `COMPOSE_FILE` causes rejection in real mode. The module referenced by `TRAFFIC_ROUTER_MODULE` must export a suitable default router or `trafficRouter` named export.

```sh
npm install --prefix examples/basic-express
node examples/basic-express/server.js
```

The second command must run in the repository root so the example's relative imports resolve; npm install of the root package dependencies is also required (see [installation](../getting-started/installation.md)). Treat loopback access by other local users as a real privilege boundary. For production, add application-owned authentication, authorization, CSRF controls, deployment locking across processes, audit logging, secrets handling, and environment-specific router conformance checks.

## Health verification

`HealthAdapter` requires the exact expected HTTP status (`200` by default), uses `GET`, does not follow redirects (`redirect: "manual"`), retries up to the configured limit, supports an `AbortSignal`, and reports latency. The health target should reflect readiness, not merely a running port.