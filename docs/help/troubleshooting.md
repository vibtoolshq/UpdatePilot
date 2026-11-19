# Troubleshooting and developer FAQ

## Common errors

| Symptom | Cause / action |
| --- | --- |
| `ConfigError E_CONFIG` on startup | Validate exact config names; `repo`, `currentVersion`, `docker.image` and `health.url` are required. `currentVersionRaw` is resolved-only. |
| Traffic router is required | Built-in `DockerAdapter` cannot switch live traffic. Inject `trafficRouter` implementing `prepare/switch/rollback` or use a separately tested handoff-owning custom Docker adapter. |
| `prepare()` health URL rejected | Candidate URL must be absolute HTTP(S), separate from the configured live URL (ignoring fragment). Assert real candidate-only routing separately. |
| Docker Compose rejected | `composeFile` is recognized but deployment is deliberately unsupported. Use non-Compose Docker or plan a separately approved Compose implementation. |
| `GitHubError` / `RateLimitError` | Check repository visibility, eligible releases, token and API rate limits. Inspect `github.cacheFile` and configured TTL. |
| `HealthCheckError` | Inspect candidate URL, exact HTTP status, TLS/network, retry/timeout values and redirect policy. Do **not** test only the live URL. |
| `E_BUSY` | Another update/rollback is running on the same engine instance; use application-level scheduling/locking across processes. |
| `RollbackError` no prior version | There is no stored successful/pending update or restorable previous container for this engine instance. |
| Critical rollback failure | Stop automatic retries, inspect actual route and Docker state, and perform a controlled manual recovery using infrastructure runbooks. |
| Require/import mismatch | Check declared Node engine range and prefer ESM. `require()` depends on Node's synchronous ESM interop. |
| npm package missing | Source repo and `package.json` do not guarantee registry publication. Check your registry/name/version access. |
| Error response discloses secrets | Never send raw `error.toJSON()` to untrusted clients; sanitize nested context/stack. |

## Questions

**Does UpdatePilot supply a dashboard or protected admin API?** No. It is a library. The bundled Express example has endpoints but no authentication and binds to loopback.

**Is version comparison enough for a safe rollout?** No. The integrated router must keep live traffic on the old container while an isolated candidate is checked; real route-switch assertions are mandatory.

**Does `dryRun` always return `dry-run`?** No. If no newer release exists and `force` is false, it returns `up-to-date` before the dry-run branch.

**Does a successful `updated` status persist the application's new version?** No. UpdatePilot does not update external application config/DB or persist its own current version across restart.

**Can the library roll back after restart?** Not reliably. Rollback state is process-local; design separate durable operations and incident procedures for production.

**Can I use Kubernetes, Docker Compose or a bundled reverse proxy?** Those deployments/integrations are not implemented in the current package.

**Are all errors represented by `rolled-back` results?** No. Health failure with successful enabled rollback yields `rolled-back`; other failures generally throw typed errors. For details see [Engine](../api/engine.md) and [Errors](../api/errors.md).

**Where can developers see source-aligned API signatures?** Start at [API index](../api/index.md), then consult `src/types/index.d.ts` and the JavaScript implementations.