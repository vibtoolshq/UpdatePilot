# Compatibility, dependencies, and limitations

## Declared support

| Area | Declared or observed |
| --- | --- |
| Package | `update-pilot@0.0.1` |
| Node.js | `^20.19.0 || >=22.12.0` (package engine) |
| Module format | `"type": "module"`; named ESM exports; synchronous `require()` interop on supported Node versions |
| JavaScript | Supported |
| TypeScript | Declaration file `src/types/index.d.ts` and consumer package-smoke checks |
| Docker | Built-in non-Compose Docker Engine adapter |
| GitHub | GitHub Releases REST API via built-in adapter |
| HTTP health | `fetch` with HTTP(S) GET |
| Database | None (local GitHub release cache file only) |
| CLI | None (`package.json` has no `bin` entry) |
| Auth/admin UI | Provided by host application, not this package |

**Runtime dependencies:** `dockerode@4.0.11` and `dockerode-compose@^1.4.0`. **Development dependencies:** `@eslint/js@^9.39.5`, `eslint@^9.39.5`, `globals@^17.14.0`. Type testing uses `npx --yes --package typescript@5.9.3` rather than a declared installed dev dependency. Lockfile pins resolved dependency tree.

The CI workflow names Node `20.19.0`, `22.12.0`, and `26.12.0`. This is not proof every patch or OS works; local development may run an otherwise engine-compatible Node version. The repository's CI runs on Ubuntu; native Windows/macOS runtime deployment is not established by this CI.

## Explicit limits

- **No Docker Compose deployment**: a configured `docker.composeFile` triggers rejection in `deploy()`.
- **No bundled Traefik/Caddy/Nginx router**, provider autodetection, or provider-specific certification.
- **No Podman/Kubernetes/non-Docker production adapter** built into package.
- **No persistence of rollback context** across Node process restart.
- **No cross-process update lock**, distributed orchestration or transactional fleet rollout.
- **No built-in admin authentication/authorization**, user interface, CSRF protection, or hosted service.
- **No guarantee of zero downtime**: actual traffic-router correctness depends on the integrated provider.
- `GitHubAdapter` examines a limited first page of releases, sorted by publication date, not an exhaustive semver registry.
- Error context and stack need sanitization before external exposure.
- npm registry publication/ownership and live topology are separate external validations; repository source does not prove either.

Use [installation](../getting-started/installation.md) for declared commands, [testing](../development/testing.md) for available verification, and [troubleshooting](../help/troubleshooting.md) for operator problems.