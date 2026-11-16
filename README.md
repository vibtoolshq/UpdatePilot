<div align="center">

![UpdatePilot](./docs/logo.svg)

</div>

# UpdatePilot

One-click safe self-hosted update engine for Node.js apps

[![npm version](https://img.shields.io/npm/v/update-pilot)](https://www.npmjs.com/package/update-pilot)
[![npm downloads](https://img.shields.io/npm/dm/update-pilot)](https://www.npmjs.com/package/update-pilot)
[![CI status](https://img.shields.io/github/actions/workflow/status/mdnajmul729080/UpdatePilot/ci.yml?branch=main)](https://github.com/mdnajmul729080/UpdatePilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/mdnajmul729080/UpdatePilot)](https://github.com/mdnajmul729080/UpdatePilot/blob/main/LICENSE)
[![Node version: 20.19+ or 22.12+](https://img.shields.io/badge/node-20.19%2B%20%7C%2022.12%2B-brightgreen)](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)
[![GitHub stars](https://img.shields.io/github/stars/mdnajmul729080/UpdatePilot)](https://github.com/mdnajmul729080/UpdatePilot)

> 🚧 **Status: Early Development** — API may change before v1.0.0

## Update Your App From Its Own Admin Panel

UpdatePilot lets you add a **Check for Updates** action to an existing
administration panel. It watches GitHub Releases for a newer version, pulls
the corresponding Docker image, starts the new version, and checks whether
the application is healthy before treating the update as successful. If that
check fails, UpdatePilot asks the configured traffic router to restore the
previous route and rolls back the candidate. A router provider is supplied by
the application; the package does not bundle a proxy integration.
There is no separate dashboard to operate, no hosted update service to rely
on, and no need to move the application's release process away from GitHub.
Connect the library to the Node.js app you already run, expose the update
action where your administrators need it, and trigger the process with one
function call.

## ✨ Why UpdatePilot?

- **No separate dashboard.** The update action lives inside your own admin
  panel, alongside the operational tools your team already uses.
  Administrators keep the same login, navigation, and operational context
  they use for the rest of the application.
- **Automatic recovery.** A failed health check triggers rollback rather than
  leaving the application on a version that did not become healthy.
  The update result distinguishes success from a deployment that could not
  pass verification.
- **GitHub Releases as the source of truth.** Use the releases you already
  publish; UpdatePilot does not require a separate release registry.
  Release discovery and deployment therefore follow the version history your
  project already maintains.
- **Adapter architecture.** Docker is the initial deployment target, with
  Podman and Kubernetes identified as future adapter directions.
  Release lookup, container operations, and health checks remain separate
  so a future provider can fit the same update lifecycle.
- **Focused package footprint.** The current compressed npm package is about
  36 KB; the installed footprint also includes runtime dependencies for Docker
  operations. The package focuses on update orchestration instead of shipping
  a hosted service or a separate administrative application.
- **MIT and self-hosted.** Run updates in your own environment and retain
  control of your release and deployment process.
  Your application controls the route, permissions, and interface used to
  request an update.

## 📦 Installation

UpdatePilot supports Node.js `^20.19.0 || >=22.12.0` and non-Compose Docker
deployments. Install it in the Node.js service that owns your admin panel:

```bash
npm install update-pilot
```

Run the installation from the application that will initiate updates. The
package's public entry point can be imported from ESM. CommonJS `require()` is
supported through Node's synchronous ESM interop on the declared versions; the
module graph must remain free of top-level `await`. Node marks this interop
experimental in some supported releases, so ESM imports are preferred.

The package is designed to be called by your application. It does not
introduce a hosted control plane or require a separate UpdatePilot service.
The application's own deployment and authorization policies remain in force;
installing the package does not create an externally hosted endpoint. The
built-in non-Compose Docker adapter requires a project-provided `trafficRouter`
for candidate-only health checks and traffic switching; no router backend is
bundled.

## 🚀 Quick Start

The following example shows the integration shape: describe the release
repository and Docker deployment, configure a health endpoint, inject a
project-specific `trafficRouter`, then call the update operation from a
protected admin route. UpdatePilot does not include a built-in router provider.

The configuration belongs to the Node.js process that performs the update.
Keep the configured current version aligned with the version actually
deployed, and point the health URL at the application instance being checked.
The example uses a local health URL; adapt the host and port to match the
networking available to your deployment process.

Create `update.config.js`:

```js
import { defineConfig } from "update-pilot";

export default defineConfig({
  repo: "YOUR_ORG/YOUR_APP",
  currentVersion: process.env.APP_VERSION,
  docker: {
    image: "ghcr.io/YOUR_ORG/YOUR_APP",
  },
  health: {
    url: "http://127.0.0.1:3000/health",
    retries: 10,
    timeout: 3000,
  },
});
```

Create `app.js` in the same project:

```js
import express from "express";
import { UpdatePilot } from "update-pilot";
import updateConfig from "./update.config.js";
import trafficRouter from "./traffic-router.js";

const app = express();
const updatePilot = new UpdatePilot(updateConfig, { trafficRouter });

app.post("/admin/update", async (request, response, next) => {
  try {
    const result = await updatePilot.runUpdate();
    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.listen(3000);
```

Protect the route with the authentication and authorization middleware your
admin panel already uses. UpdatePilot provides the update operation; your
application remains responsible for deciding which administrators may invoke
it and how the route is exposed.

The route is deliberately part of the application rather than a new service.
That keeps the update control close to existing operator workflows while
allowing the application to reuse its own access rules. Only expose the route
to trusted administrators, and do not make a deployment action publicly
available without authentication.

The route delegates the process to one update operation. That operation
checks the release, deploys when a newer version is available, verifies the
configured health endpoint, and returns a result to the application. The
application decides how to present that result to the person who requested
the update.

When a newer release is deployed successfully, the route returns a response
in this shape:

```json
{
  "status": "updated",
  "version": "1.2.3"
}
```

The example assumes that the release version, Docker image, and health URL are
appropriate for your own deployment. Replace the placeholder repository and
image names before using the configuration. Compose deployment is disabled.

Treat the values in the sample as an application-specific starting point.
The repository value identifies where releases are checked, while the image
identifies the application deployment. The health URL should refer to the same
application version being prepared.

The configured current version should be maintained by the application as
part of its release process. Keeping it accurate makes release comparisons
clear to operators and helps them understand which version an update will
replace.

The response above describes a successful deployment. If the deployment
does not pass health verification, the engine follows the rollback path and
the route should report the unsuccessful result through the application's
normal error and response handling. Do not treat a failed update as a
successful version change in application-owned status displays.

The sample route uses Express only to demonstrate where an application can
invoke the library. UpdatePilot does not require Express; another Node.js
server can call the same update operation from its own protected route or
administrative action.

## 🧠 How It Works

```text
GitHub Releases → Pull candidate → Prepare router endpoint
→ Candidate health check → Switch traffic → Finalize
                                  ↘ failure: restore route and rollback
```

1. **Find a release.** The GitHub adapter checks the configured repository for
   its latest release and compares it with the application's current version.
   This makes the project's published release the input to the update check.
   If there is no newer version, the deployment stage has no new version to
   install.
2. **Prepare the candidate.** The non-Compose Docker adapter keeps the old
   container running and requests a dynamic host port for the candidate, so
   the two containers do not claim the same fixed host port.
3. **Prepare and verify routing.** The injected router provider prepares a
   candidate-only health endpoint. The health adapter probes that endpoint;
   the existing application route remains the provider's responsibility.
4. **Switch or recover.** Only after health succeeds does the engine call the
   provider's `switch()`, then finalize the deployment. Health or switch
   failure calls `rollback()` and removes the candidate. The provider must
   restore the previous route safely.

### Traffic Router Provider

The `trafficRouter` dependency is a provider-neutral interface supplied by
each application. `prepare(deployment)` must keep the old route active and
return an absolute HTTP(S) candidate-only `healthUrl` distinct from
`deployment.healthUrl`, plus optional opaque `context`. The engine rejects an
invalid URL or the unchanged live health URL and attempts rollback before
health verification. This URL check does not prove which backend a provider
actually routes to; the provider's integration test must assert candidate-only
reachability.

If `prepare()` rejects before returning its context, it must clean up any
partial resources itself. The engine also calls
`rollback(deployment, undefined, "prepare-failed")` for cleanup. `switch()`
must resolve only after the candidate route is active; if it rejects after a
partial change, `rollback(deployment, context, reason)` must restore the old
route. `rollback()` must be idempotent because automatic route cleanup can be
followed by manual recovery, and because preparation may fail without context.
If no prior route exists, rollback must leave the candidate unrouted.

A custom Docker adapter may own the handoff without an injected `trafficRouter`.
In that path, its optional `DockerDeployResult.healthUrl` supplies the candidate
health target; the adapter owns route safety and candidate-only reachability.
The engine's internal no-op router does not certify that adapter's traffic
switching.

The deployment argument includes the old and candidate container IDs, version
transition, live health URL, and candidate port mappings. The provider must
keep the old route active until `switch()` is called. UpdatePilot fails
closed before deployment when its built-in Docker adapter is used without a
valid provider. A custom Docker adapter may own the handoff itself. No
Traefik, Caddy, Nginx, or other built-in provider is included; the application
must supply an implementation that matches its actual routing environment.

### Test a Custom Provider

Provider packages can reuse the Node.js contract suite from
`update-pilot/testing/traffic-router-contract`:

```js
import assert from "node:assert/strict";
import { defineTrafficRouterContractTests } from "update-pilot/testing/traffic-router-contract";

defineTrafficRouterContractTests({
  providerName: "my-router",
  async createScenario() {
    const environment = await startIsolatedRouterEnvironment();
    return {
      trafficRouter: environment.trafficRouter,
      deployment: environment.deployment,
      async verifyCandidateHealth(preparation) {
        const response = await fetch(preparation.healthUrl);
        assert.equal(response.status, 200);
        await environment.assertCandidateOnly(preparation.healthUrl);
      },
      assertOldRouteActive: () => environment.assertOldRouteActive(),
      assertCandidateRouteActive: () =>
        environment.assertCandidateRouteActive(),
      assertPreparationCleaned: () => environment.assertPreparationCleaned(),
      cleanup: () => environment.close(),
    };
  },
});
```

Place this registration in a provider test file such as
`test/traffic-router-contract.test.js` and run it with `node --test` (or the
provider project's test command).

The provider supplies isolated infrastructure and assertions that inspect its
actual route state. The suite checks candidate-only health, preservation of the
old route until switching, rollback, and cleanup. It does not install a
provider or certify the application's production topology.

Docker Compose deployments do not yet implement this candidate/router
contract and are not production-ready; Compose behavior remains a separate
roadmap phase.

The update is initiated by your Node.js application, so the release check and
deployment can be presented as one action in the admin experience you already
maintain.
The release source, deployment target, and health endpoint are configured
once for the application; the same path coordinates these stages whenever an
authorized administrator requests an update.

## 🔧 Configuration Reference

The configuration object describes the release source, current version,
deployment target, health check, cache, lifecycle callbacks, and rollback
policy. Required values should be supplied explicitly for each application.

| Option               | Type       | Default       | Description                                                      |
| -------------------- | ---------- | ------------- | ---------------------------------------------------------------- |
| `repo`               | `string`   | None          | GitHub repository in `owner/name` form; the source for releases. |
| `currentVersion`     | `string`   | None          | Version currently running; compared with the latest release.     |
| `docker.composeFile` | `string`   | None          | Retained for compatibility; deployment is rejected when set.     |
| `docker.image`       | `string`   | None          | Docker image used for the application deployment.                |
| `health.url`         | `string`   | None          | HTTP endpoint requested to verify application health.            |
| `health.retries`     | `number`   | Not specified | Number of health-check attempts configured for verification.     |
| `health.timeout`     | `number`   | Not specified | Timeout, in milliseconds, for a health-check attempt.            |
| `cache.file`         | `string`   | Not specified | File used to cache GitHub release responses.                     |
| `on.beforeDeploy`    | `function` | None          | Callback invoked before deployment begins.                       |
| `on.afterRollback`   | `function` | None          | Callback invoked after a rollback completes.                     |
| `rollback.enabled`   | `boolean`  | Enabled       | Whether failed health verification should trigger rollback.      |

`None` means the value is supplied by the application rather than assumed by
this reference. Defaults that are not established here are marked
**Not specified**; choose values explicitly instead of relying on an
undocumented default.
This is especially important during early development, when configuration
details may still evolve before the stable API is released. Confirm that the
values match the deployment environment in which the Node.js process runs.

### Release Source

Set `repo` to the GitHub repository whose Releases represent deployable
versions. Set `currentVersion` to the version the running application reports
so the release check can determine whether a newer version is available.
Use the repository's `owner/name` identifier rather than a release URL. The
current version should describe the code that is actually serving requests;
otherwise, the comparison may not reflect the deployed application state.
Keep version values consistent with the release versions used by your team.
Check that the value comes from the same release series as the GitHub
repository. A mismatch between the running version and release tags can make
the update comparison confusing for both the engine and the administrator.
Treat the configured version as a description of the current deployment, not
as a version the update operation should silently infer from another source.

### Docker Deployment

Set `docker.image` to the application image and keep its release tags aligned
with the GitHub release tags. The built-in adapter supports non-Compose Docker
deployments only. Setting `docker.composeFile` is rejected before Docker side
effects; Compose update support has not been implemented.

### Health Verification

Set `health.url` to an endpoint that represents whether the application can
serve requests. `health.retries` and `health.timeout` bound the retry-based
check. The health endpoint should be available on the target deployment and
should return a successful HTTP response only when the application is ready.
Choose retry and timeout values that reflect the startup and response
characteristics of the application. An endpoint that reports readiness too
early can allow an unhealthy version through; an endpoint that is too strict
can cause a healthy but slow start to be rolled back.
The endpoint should check application readiness at the level that matters to
users of the service. Keep the health response independent of transient
startup states so the retry window can observe the service becoming ready.
Set the endpoint up before enabling updates, and verify that it can be
reached from the same environment that performs deployment checks.

### Cache, Callbacks, and Rollback

The optional `cache.file` setting identifies where GitHub response data is
cached to help avoid unnecessary API requests. The `on.beforeDeploy` and
`on.afterRollback` callbacks provide lifecycle points for application-owned
logging or alerting. Keep rollback enabled when automatic recovery from an
unsuccessful health check is required.
Choose a cache path writable by the Node.js process and suitable for the
environment where updates run. Callbacks should support operational needs
without replacing the engine's verification and rollback decisions.
Rollback remains the recovery path when the new deployment does not satisfy
the configured health check.
Choose a cache location that is writable by the Node.js process and suitable
for the environment where updates run. Keep callback work bounded, and make
callbacks safe to run as part of the deployment lifecycle because they are
invoked around an operation that may affect the running application.

## 🛡️ Safety Requirements and Limits

- The built-in non-Compose Docker adapter allocates candidate ports
  dynamically and leaves the old container running during candidate health
  verification.
- Health-before-switch is provided only when the application injects a
  `trafficRouter` that keeps the old route active until `switch()` succeeds.
  The package includes the contract, not a router backend.
- Without a valid router, the built-in Docker adapter rejects an update before
  Docker deployment. A custom Docker adapter without a router is responsible
  for its own candidate health and traffic handoff behavior.
- No zero-downtime, fixed rollback-time, Git-SHA pinning, or immutable-image
  guarantee is provided. Images are selected by their configured tag.
- Compose mode has not yet been verified against the router contract. Do not
  treat it as production-ready until its roadmap phase is complete.
- The opt-in Docker integration test requires a local Docker daemon and a
  pre-pulled HTTP image. Unit tests with fake providers do not prove a specific
  proxy integration or production routing configuration.

Choose a health endpoint that indicates application readiness, and keep
monitoring and incident-response procedures in place. A health check only
covers the conditions represented by its endpoint.

## 🧩 Adapters

Adapters isolate release discovery, container deployment, and health
verification behind focused interfaces. The first three adapters form the
Docker-based MVP; the remaining entries are planned directions, not current
deployment targets.

| Adapter              | Status                      |
| -------------------- | --------------------------- |
| GitHub (releases)    | ✅ MVP                      |
| Docker (non-Compose) | 🚧 Router provider required |
| Docker Compose       | 🚧 Not production-ready     |
| HTTP Health          | ✅ MVP                      |
| Podman               | 🚧 Planned                  |
| Kubernetes           | 🚧 Planned                  |
| GitLab Releases      | 🚧 Planned                  |

The current adapters cover release discovery, Docker operations, and HTTP
health verification. Non-Compose traffic switching requires an injected
provider; Compose deployment has not yet been reconciled with candidate
health, routing, and rollback.

Podman, Kubernetes, and GitLab Releases are roadmap directions. Their
presence in the table does not mean they are available in the current
package; use the adapters marked MVP for the Docker-based integration.

### MVP Integration Boundary

The GitHub adapter answers which release is available. The Docker adapter
handles the non-Compose candidate deployment, and the health adapter decides whether
the new version is ready according to the configured endpoint. The engine
coordinates these roles in order and uses the rollback path when verification
does not pass.

This boundary keeps provider details out of application route handlers.
Applications invoke the engine and present its outcome, while supplying a
router implementation appropriate to their deployment environment.

## 📚 Documentation

- [Architecture](./docs/ARCHITECTURE.md) describes the engine, adapters, and
  update lifecycle.
- [Contributing](./CONTRIBUTING.md) covers local setup and contribution
  conventions.
- [Examples](./examples/) contains sample application integrations.

The architecture and contribution guides are maintained alongside the
package so implementation decisions and public integration guidance can
evolve together.
Use the architecture guide when reviewing the lifecycle or considering a
new adapter. Use the contribution guide before changing code so local setup,
tests, and pull request expectations are clear.

The examples directory is linked as a directory because integrations are
organized with the project rather than published as a separate documentation
site. The basic Express example is a placeholder while implementation work
continues.

## 🗺️ Roadmap

The checklist reflects the current early-development stage. Documentation
exists, while implementation and release milestones remain ahead.

- [x] Project scaffold
- [x] Documentation
- [ ] Core utils
- [ ] Config loader
- [ ] GitHub adapter
- [ ] Docker adapter
- [ ] Health adapter
- [ ] Engine orchestrator
- [ ] Express example
- [ ] Test suite
- [ ] v1.0.0 stable release

The project scaffold and documentation are checked because they are present
in the repository. Core utilities and configuration come first in the
implementation sequence, followed by the adapters and engine that coordinate
them.

The Express example and test suite are also milestones, not descriptions of
completed implementation. A stable release depends on the core update path
being implemented and verified as the project develops.

## 🤝 Contributing

Contributions to implementation, tests, and documentation are welcome. Start
with the [contribution guide](./CONTRIBUTING.md) for development setup and
the expected pull request checklist.

## 📄 License

UpdatePilot is released under the [MIT License](./LICENSE).

---

Made with ❤️ for the self-hosting community
