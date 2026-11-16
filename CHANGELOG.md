# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-11-15

### Added

- Core UpdatePilot engine with orchestrator flow
- `defineConfig()` with strict validation and helpful error messages
- `GitHubAdapter` for GitHub Releases checks with caching and rate-limit handling
- Non-Compose Docker candidate deployment with a provider-neutral router contract; Compose mode is rejected
- `HealthAdapter` for HTTP health checks with timeout and retry
- `HookBus` with nine lifecycle hooks
- Full TypeScript declarations in `src/types/index.d.ts`
- Express admin panel example in `examples/basic-express/`
- Safe demo mode with simulated adapters and a real-infrastructure opt-in
- ESLint flat config, CodeQL, Dependabot, and CI checks for tests, types, and fresh-install module compatibility
- README, contribution guide, and architecture documentation
- Engine-flow integration tests and a spawned-server HTTP smoke test for all admin endpoints
- Fresh-tarball install smoke tests for ESM and CommonJS root and adapter imports
- npm audit remediation for the nested Dockerode dependency tree

### Changed

- Supported Node range is `^20.19.0 || >=22.12.0`; CommonJS uses Node's synchronous ESM interop.
- The example admin server binds to loopback, and real mode requires an application router and candidate-specific health URL.
- CI runs the full suite on Node 26.12 and fresh-install module compatibility checks on the supported Node floors; `prepublishOnly` runs tests, type compilation, and tarball smoke checks.
- `HookBus` moved from `src/utils/events.js` to `src/core/events.js`; the utility path re-exports it for compatibility.

### Security

- Health checks use `redirect: 'manual'` to prevent false-positive redirects to login pages
- Deep-freezing the resolved config prevents accidental mutation
- An in-memory concurrency lock prevents overlapping deployments
