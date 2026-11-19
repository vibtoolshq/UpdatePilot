# Adapter API reference

The root entry point exports all three classes; also import them individually via `update-pilot/adapters/github`, `/docker`, or `/health`. Each adapter has an independent contract: **there is no common exported `UpdateAdapter` class**. Public methods below are the methods declared in `src/types/index.d.ts`; underscore methods are implementation-only.

## GitHubAdapter — `src/adapters/github.js`

**Constructor:** `new GitHubAdapter(options: GitHubAdapterOptions)`.

| Option | Required/default | Notes |
| --- | --- | --- |
| `repo` | required | `owner/repo` |
| `currentVersion` | required | semver-like tag or 7–40 char SHA |
| `token` | optional | GitHub bearer token |
| `includePrerelease` | `false` | exclude prereleases by default |
| `cacheFile` | `.update-cache.json` | disk cache location |
| `cacheTTL` | `300000` ms | zero disables hits |
| `logger` | `silentLogger` | compatible logger |
| `fetchImpl` | `globalThis.fetch` | injection for tests |
| `baseUrl` | `https://api.github.com` | direct-adapter override; not a root config key |

| Method | Return | Failure/notes |
| --- | --- | --- |
| `check(): Promise<CheckResult>` | version comparison, notes, URL, rate limit and cache metadata | `GitHubError`, `RateLimitError`; 3 attempts for retryable transport/server errors |
| `getLatestRelease(): Promise<Record<string, unknown> | null>` | raw latest eligible release | uses same cache/release policy |
| `clearCache(): Promise<boolean>` | `true` if file deleted; otherwise `false` | never throws by design; warns best effort |

The adapter obtains the first 10 GitHub releases, ignores drafts, and selects the most recently published eligible release; it does **not** guarantee semver-maximum selection across all tags. SHA comparisons differ from semver checks. Cache writes are best effort; when a cached response reports rate limit remaining 0, the rate-limit guard still applies.

## DockerAdapter — `src/adapters/docker.js`

**Constructor:** `new DockerAdapter(options: DockerAdapterOptions)`.

| Option | Required/default | Notes |
| --- | --- | --- |
| `image` | required | nonempty registry image path |
| `tag` | `latest` | default tag for pull/deploy |
| `containerName` | last segment of `image` | exact Docker container name |
| `composeFile` | undefined | **deployment rejected** if set |
| `socketPath` | `/var/run/docker.sock` | Docker API connection |
| `logger` | `silentLogger` | logger |
| `dockerClient`, `dockerComposeClient` | optional | injected clients |
| `keepImages` | `3` | older image retention count |

| Method | Return / effect |
| --- | --- |
| `pull(tag?: string): Promise<{ pulled: true; image: string }>` | pulls image with retry (3 attempts; 1000ms base delay) |
| `getCurrentContainer(): Promise<ContainerInfo | null>` | matches exact container name; returns `null` even on lookup failures |
| `deploy(newTag?: string): Promise<DockerDeployResult>` | non-Compose candidate alongside old container; assigns dynamic candidate host ports |
| `finalize(): Promise<{ finalized: true }>` | stops/removes previous, renames candidate, prunes old images |
| `restorePrevious(): Promise<{ restoredContainerId: string | null }>` | reactivates or recreates prior container for manual route recovery |
| `rollback(originalError?: Error): Promise<{ rolledBack: true; restoredContainerId: string | null }>` | removes candidate and attempts old-container restore; throws on failure |

`DockerDeployResult` includes `success`, `newContainerId`, `previousContainerId`, and optional `candidatePorts` / `healthUrl` (for custom adapter-owned handoff). The built-in adapter does not itself supply router health URL. **Do not assume zero downtime or fully durable rollback**: real routing is application-owned and state is held in memory.

## HealthAdapter — `src/adapters/health.js`

**Constructor:** `new HealthAdapter(options: HealthAdapterOptions)`. Requires a valid HTTP(S) `url`. Optional `retries=5`, `timeout=5000`, `interval=2000`, `expectStatus=200`, `headers={}`, `logger=silentLogger`, `fetchImpl=globalThis.fetch`, `sleepImpl=sleep`. In this *direct* constructor all numeric ranges require integers: retries 1–30; timeout 100–60000; interval 0–60000; expectStatus 100–599.

| Method | Return / behavior |
| --- | --- |
| `check({ signal?, url? } = {}): Promise<HealthResult>` | retrying GET with exact expected status; `url` can override candidate target |
| `checkOnce({ signal?, url? } = {}): Promise<HealthResult>` | one attempt |
| `waitUntilHealthy({ signal?, url? } = {}): Promise<HealthResult>` | alias for `check()` |

`HealthResult`: `{ healthy: true, url, status, attempts, latencyMs, checkedAt }`. Failure and caller abort throw `HealthCheckError`; responses with redirects are not followed, and timeout is per attempt. See [configuration](../guides/configuration.md) for root settings and [errors](errors.md).

## Examples

```js
import { GitHubAdapter, HealthAdapter } from "update-pilot";

const releases = new GitHubAdapter({
  repo: "acme/app", currentVersion: "1.0.0", cacheTTL: 0
});
const availability = new HealthAdapter({
  url: "http://127.0.0.1:3000/health", retries: 3
});
// await releases.check();       // real GitHub request
// await availability.checkOnce(); // real HTTP request
```