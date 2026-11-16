# UpdatePilot Express Admin Example

This reference application demonstrates how a Node.js service can add update
operations to an existing administrative surface. It wraps `UpdatePilot` in
Express routes for status, release checks, deployment, and manual rollback;
the UI calls those routes with ordinary browser `fetch()` requests.

The example is intentionally small enough to adapt. Its server owns routing,
HTTP responses, and the admin page, while the engine coordinates the update
lifecycle. UpdatePilot does not supply authentication or a hosted dashboard;
those remain responsibilities of the application that embeds it.

The example binds its admin server to `127.0.0.1` in both modes. Loopback
binding prevents access from other machines, but does not authenticate other
users or processes on the same host.

## ⚠️ Important: Demo Mode

> **By default, this example runs in DEMO MODE.** All GitHub checks, Docker
> deployments, and health probes are simulated in-memory so you can explore
> the UI without any real infrastructure. To run against real infrastructure,
> set `UPDATE_PILOT_DEMO=0` in your environment **and ensure Docker is running
> locally**. See [Running Against Real Infrastructure](#running-against-real-infrastructure)
> below.

In demo mode, the release endpoint always advertises a sample update, Docker
operations return synthetic container IDs, and health verification succeeds
immediately. Nothing is pulled, restarted, or sent to GitHub. The mode banner
is also printed to the server terminal at startup.

![Admin Panel](./screenshot.png)

## Prerequisites

- Node.js `^20.19.0 || >=22.12.0`.
- npm, included with Node.js.
- Docker is optional for demo mode. Real mode requires a reachable local Docker
  daemon, an application image, and an application-provided traffic router.

## Run

From `examples/basic-express/`, install the example's isolated Express
dependency and start the server:

```bash
npm install
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). To use another port, set
`PORT` before starting the process. The app binds to the dynamically selected
loopback port when `PORT=0`.

## What You'll See

- **Check for Updates** calls the release check and shows the latest eligible
  version and update availability.
- **Deploy Update** is disabled until a check reports an available update. In
  demo mode it runs the full simulated deploy, verify, and finalize path.
- **Rollback** calls the manual rollback route. It reports an error until a
  successful update has been recorded by the current engine instance.
- **Operation response** displays formatted JSON from the latest request;
  request errors appear in a separate red alert area.

## API Endpoints

| Method | Path            | Description                                                  | Response shape                                            |
| ------ | --------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `GET`  | `/api/status`   | Read current engine state.                                   | `{ running, lastResult, currentVersion, repo, uptime }`   |
| `GET`  | `/api/check`    | Check GitHub Releases (or the demo adapter).                 | `{ updateAvailable, currentVersion, latestVersion, ... }` |
| `POST` | `/api/update`   | Run check, deploy, verify, then finalize or rollback.        | `{ status, from, to, ... }`                               |
| `POST` | `/api/rollback` | Revert the most recent successful update.                    | `{ status: "rolled-back-manual", to }`                    |
| `GET`  | `/health`       | Example control-server liveness; not a real candidate probe. | HTTP `200`                                                |

Successful API calls return JSON with HTTP `200`. A concurrent update returns
`409`; invalid configuration returns `400`. Other UpdatePilot failures return
`500`. The example maps an attempted manual rollback without a prior successful
update to `400`.

Each API response is rendered in the Operation response area without reloading
the page. `/api/status` reports the last completed result and whether an
operation is currently running. `/api/check` does not deploy anything. The
update route runs the complete engine lifecycle, and rollback is available
only after an update has completed successfully.

The Express routes are deliberately thin: they call the public engine API and
translate thrown errors into HTTP status codes. When adapting this pattern,
keep authentication and authorization in your own middleware rather than
placing access-control decisions in the browser page.

## Running Against Real Infrastructure

Demo mode is the default. Real mode requires explicit application-specific
settings and a traffic-router module. For example, in PowerShell:

```powershell
$env:UPDATE_PILOT_DEMO = "0"
$env:GITHUB_REPOSITORY = "your-org/your-app"
$env:APP_VERSION = "1.2.3"
$env:GITHUB_TOKEN = "<your-token>"
$env:DOCKER_IMAGE = "ghcr.io/your-org/your-app"
$env:HEALTH_URL = "http://127.0.0.1:8080/health"
$env:TRAFFIC_ROUTER_MODULE = ".\traffic-router.mjs"
npm start
```

Or in a POSIX shell:

```bash
UPDATE_PILOT_DEMO=0 GITHUB_REPOSITORY=your-org/your-app APP_VERSION=1.2.3 \
  DOCKER_IMAGE=ghcr.io/your-org/your-app HEALTH_URL=http://127.0.0.1:8080/health \
  TRAFFIC_ROUTER_MODULE=./traffic-router.mjs npm start
```

`GITHUB_REPOSITORY`, `DOCKER_IMAGE`, and `APP_VERSION` must describe the same
application and the version currently running. `HEALTH_URL` supplies the
application health path and base URL to the router; it is not the example
server's `/health` endpoint. The router module must export a default object or
named `trafficRouter` implementing `prepare`, `switch`, and `rollback`.
`prepare(deployment)` receives the candidate's published ports and must return
a candidate-only `healthUrl`; the engine probes that URL before calling
`switch()`. The module is resolved relative to the example's working directory
unless an absolute path is provided. UpdatePilot includes no router backend,
so real mode refuses to start without this module and the required settings.

Real mode rejects `COMPOSE_FILE`: Compose deployment is currently disabled.
The example uses the configured local Docker socket. A deploy request can pull
images and restart containers, so review the release/image mapping and router
implementation before running it.

The server prints a separate startup message for each mode. In demo mode,
the three adapters are in-memory fakes and do not call the network or Docker.
In real mode, the package constructs its actual adapters lazily when the
corresponding route is called. Merely starting the server does not connect to
the Docker socket or contact GitHub.

For a real setup, ensure the deployment user has permission to access Docker
and that the router can probe the candidate health endpoint using the
candidate port data. `PORT` is the admin server's loopback port and is
independent of application container ports.

## Adapt It to Your Project

1. Change the release source and running version:

   ```js
   repo: "your-org/your-app",
   currentVersion: process.env.APP_VERSION ?? "1.0.0",
   ```

2. Set `DOCKER_IMAGE` to the versioned image for that repository. Compose
   deployment is currently disabled.
3. Set `HEALTH_URL` to the application readiness path; the router must form a
   candidate-specific URL using the published candidate port.
4. Tune `retries`, `timeout`, and `interval` in the `health` configuration to
   match the app's startup behavior.
5. Add authentication and authorization middleware before exposing any admin
   route beyond the local host.

If the target application already has a configuration module, keep these
values there and pass the same object to `defineConfig()` and `UpdatePilot`.
Do not expose a general-purpose update endpoint to ordinary application
users; treat it as an administrative operation with a narrow permission.

The corresponding values in `server.js` are `repo`, `currentVersion`,
`docker.image`, and `health.url`. Keep the running version
in sync with the image actually serving requests.

These are the four application-specific values most projects need to replace:

```js
repo: "your-org/your-app",
currentVersion: process.env.APP_VERSION ?? "1.0.0",
image: "ghcr.io/your-org/your-app",
url: "http://127.0.0.1:8080/health",
```

## ⚠️ Security Warning

**This example has no authentication, authorization, CSRF protection, or
rate limiting. It binds to loopback only, but any local user or process that
can reach it can request a deployment or rollback. Do not expose it through a
firewall rule, tunnel, or reverse proxy without adding an access-control
boundary first.**

Before production use, place authentication middleware in front of every admin
route and authorize update actions for a limited operator group. Options
include [Basic Auth](https://www.npmjs.com/package/express-basic-auth) for a
private internal tool, secure session-based authentication with CSRF defenses,
or an organization SSO/OIDC provider. Add rate limiting to sensitive routes,
serve over HTTPS, and avoid logging or returning credentials and tokens.
Follow the [Express production security best practices](https://expressjs.com/en/advanced/best-practice-security.html).

UpdatePilot provides update orchestration, not identity management. Your app
must enforce who can check, deploy, and roll back.

## Troubleshooting

- **Port already in use:** choose another port with `PORT=3001 npm start` or
  the equivalent PowerShell environment assignment.
- **`Cannot find package 'express'`:** run `npm install` from this example's
  directory, not only from the repository root.
- **Update returns `409`:** another update is in progress. Wait for it to
  complete before submitting another request.
- **Rollback returns `400`:** no successful update has been recorded in this
  server process yet. Deploy successfully before requesting manual rollback.
- **Real mode refuses to start:** set all required real-mode variables and
  provide a valid `TRAFFIC_ROUTER_MODULE`; `COMPOSE_FILE` is unsupported.
- **Real deployment cannot reach Docker:** confirm Docker is running and that
  the process can access `/var/run/docker.sock`; check `DOCKER_IMAGE`.
- **Health verification fails:** confirm the router uses `candidatePorts` to
  return a candidate-only health URL for the configured `HEALTH_URL` path.
- **No real GitHub access:** verify the configured repository and token. Demo
  mode does not contact GitHub; set `UPDATE_PILOT_DEMO=0` to opt in.
