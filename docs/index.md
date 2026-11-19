---
title: "UpdatePilot Developer Documentation"
description: "Developer documentation for the UpdatePilot Node.js release discovery, Docker candidate deployment, health verification, and rollback library."
order: 0
version: "0.0.1"
---

# UpdatePilot — Developer Documentation

**Package:** `update-pilot@0.0.1` · **Runtime:** Node.js `^20.19.0 || >=22.12.0` · **Model:** embedded JavaScript/TypeScript library, not a hosted service or CLI.

UpdatePilot coordinates GitHub Releases checks, non-Compose Docker candidate deployments, HTTP health verification, application-provided traffic switching, and rollback. The application supplies authorization and a traffic-router implementation. The project does **not** bundle a proxy provider, admin UI, Kubernetes support, or restart-durable recovery.

## Start here

- [Requirements and installation](getting-started/installation.md)
- [First integration / dry run](getting-started/quickstart.md)
- [Engine lifecycle and result handling](guides/basic-usage.md)
- [Traffic router integration](guides/integration.md)
- [Configuration details](guides/configuration.md)
- [Complete runtime API](api/index.md)
- [TypeScript contracts](api/types.md)
- [Architecture and failure paths](architecture/overview.md)
- [Tests, development and publishing](development/testing.md)
- [Compatibility and limitations](reference/compatibility.md)
- [Troubleshooting](help/troubleshooting.md)
- [Documentation validation report](VALIDATION.md)

## Public package entry points

| Import | Contents |
| --- | --- |
| `update-pilot` | `UpdatePilot`, `defineConfig`, `validateConfig`, `GitHubAdapter`, `DockerAdapter`, `HealthAdapter`, `HookBus`, `HOOKS`, logger, error classes, `VERSION` |
| `update-pilot/adapters/github` | `GitHubAdapter` |
| `update-pilot/adapters/docker` | `DockerAdapter` |
| `update-pilot/adapters/health` | `HealthAdapter` |
| `update-pilot/testing/traffic-router-contract` | `defineTrafficRouterContractTests` |

**Source of truth:** `src/index.js`, `package.json`, `src/types/index.d.ts`, `testing/traffic-router-contract.js` and implementation/tests at the audited source baseline. Only paths declared in `package.json#exports` are supported package imports; `src/utils/retry.js` is internal, not a public subpath.