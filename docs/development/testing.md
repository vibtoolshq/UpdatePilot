# Testing and debugging

## Development setup

From a source checkout, use a supported Node.js version and the lockfile:

```sh
npm ci
npm ci --prefix examples/basic-express
npm test
npm run lint
npm run test:types
npm run test:package
```

These scripts are defined in `package.json`: `test` runs `node --test`, `lint` runs `eslint .`, `test:types` invokes TypeScript 5.9.3 through `npx`, and `test:package` runs `scripts/package-smoke.js` to pack and install a temporary npm tarball. `npm run prepublishOnly` runs tests, types, and package smoke.

## Test organization

| Path | Coverage focus |
| --- | --- |
| `test/engine.test.js`, `test/integration/engine-flow.test.js` | orchestration, dry-run/rollback, dependency injection |
| `test/docker.test.js`, `test/integration/docker-handoff.test.js` | candidate port mapping, cleanup, disposable Docker integration |
| `test/github.test.js`, `test/health.test.js` | GitHub cache/API/compare, HTTP probe |
| `test/config.test.js`, `test/errors.test.js`, `test/events.test.js`, `test/logger.test.js`, `test/retry.test.js` | config, errors, hooks, logger and retry |
| `test/adapters.test.js`, `test/package-exports.test.js` | adapter and public export surfaces |
| `test/testing/traffic-router-contract.test.js` | reusable provider contract helper |
| `test/example-smoke.test.js`, `examples/basic-express/` | Express example sanity |
| `type-tests/public-api.ts` | public type compatibility |
| `scripts/package-smoke.js` | package allowlist, tarball ESM/CommonJS/type-consumer checks |

The Docker integration test is opt-in in local environments. GitHub CI explicitly runs it with `UPDATEPILOT_DOCKER_INTEGRATION=1`, image `nginx:alpine`, on disposable infrastructure. **Do not run it against production Docker infrastructure**; it creates/starts/removes containers.

## Focused checks

```sh
node --test test/config.test.js
node --test test/testing/traffic-router-contract.test.js
node --check examples/basic-express/server.js
```

Run the smallest check relevant to an edit, then the final configured gate. The project's `AGENTS.md` asks for bounded once-per-phase verification and focused scope auditing.

## What tests do not prove

The provider test helper requires environment-owned route assertions; fake adapters and generic CI do not prove a particular proxy works, that live routing is isolated, that persistent rollback works, or that production secrets are secure. ESM/CJS compatibility is validated only in the CI version matrix and package smoke. The developer guide should never represent historical pass counts as current run results.

## Debugging

Set `logger.level` to `debug` and, if needed, `pretty: false` for JSON lines. Preserve error code, phase and operation when logging internally, but redact sensitive fields, embedded URLs and stacks before exposing messages to users. Check `getStatus()` for the process-local last result, Docker container names/ports, the candidate-only URL, and GitHub rate limit/cache path. See [troubleshooting](../help/troubleshooting.md).