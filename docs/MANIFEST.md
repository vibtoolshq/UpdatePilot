# Developer Documentation Manifest and Audit Coverage

**Audited source baseline:** `bd836aee4ff63ef49394740413e53522f1348d0f` (main, 2026-11-19). **Product version:** `0.0.1`. This is a source-to-documentation audit, not a live deployment certification.

## Navigation

| Area | Documents |
| --- | --- |
| Install | [Installation](getting-started/installation.md), [Quickstart](getting-started/quickstart.md) |
| Use | [Basic usage](guides/basic-usage.md), [Configuration](guides/configuration.md), [Integration](guides/integration.md) |
| Public APIs | [Index](api/index.md), [Engine](api/engine.md), [Adapters](api/adapters.md), [Hooks/logger](api/hooks-and-logging.md), [Types](api/types.md), [Errors](api/errors.md), [Test helper](api/router-contract-tests.md) |
| Design | [Architecture](architecture/overview.md), [Internals](architecture/internals.md) |
| Operations | [Compatibility](reference/compatibility.md), [Testing](development/testing.md), [Contributing](development/contributing.md), [Release](development/release-process.md), [Troubleshooting](help/troubleshooting.md), [Validation](VALIDATION.md) |

## Source-to-reference mapping

| Audited source | Documentation |
| --- | --- |
| `src/index.js`, `package.json`, `src/types/index.d.ts` | [API index](api/index.md), [Types](api/types.md), [Compatibility](reference/compatibility.md) |
| `src/core/config.js` | [Configuration](guides/configuration.md) |
| `src/core/engine.js` | [Engine API](api/engine.md), [Architecture](architecture/overview.md) |
| `src/core/events.js`, `src/utils/events.js` | [Hooks](api/hooks-and-logging.md) |
| `src/adapters/github.js`, `docker.js`, `health.js` | [Adapters](api/adapters.md) |
| `src/utils/errors.js`, `logger.js`, `retry.js` | [Errors](api/errors.md), [Hooks/logger](api/hooks-and-logging.md), [Internals](architecture/internals.md) |
| `testing/traffic-router-contract.js` | [Router contract tests](api/router-contract-tests.md) |
| `test/`, `type-tests/`, `scripts/package-smoke.js` | [Testing](development/testing.md) |
| `examples/basic-express/`, `examples/config.sample.js` | [Quickstart](getting-started/quickstart.md), [Integration](guides/integration.md) |
| `.github/workflows/*`, `CONTRIBUTING.md`, `AGENTS.md`, `CHANGELOG.md` | [Contributing](development/contributing.md), [Release](development/release-process.md) |

## Verification boundaries

- The source defines **20 named root runtime exports** in total: 11 non-error values/functions, eight named error constructors and one error predicate; the exact exports, including `VERSION`, are enumerated at [API index](api/index.md). The contract-testing subpath has one public function. Do not confuse runtime exports with the larger set of TypeScript type-only exports.
- The current package has **three supported adapter subpaths** and one test-helper subpath, with no CLI/bin entry.
- Automated tests and published-package smoke exist, but this audit does **not** certify any real traffic-router provider or production infrastructure.
- The source still includes a disabled Docker Compose branch and unused internal compatibility re-export. These are **not** advertised as supported deployment APIs.
- Package/root README/CONTRIBUTING may still contain `mdnajmul729080/UpdatePilot` identity links after repository relocation. Changing those files or `package.json` is outside the documentation-only scope.
- Docs describe the code even where its behavior may be surprising: `dryRun` can return `up-to-date` when no newer release exists; manually disabling automatic rollback changes the health-failure path; state is process-local.

## Documentation QA criteria

Coverage is mapped to public exports, constructors, methods, return shapes, hook names, config keys, package exports, integration/test contracts, and internal modules above. See the final delivery report for the actual execution status of syntax/example/test/link checks. No externally hosted npm package, GitHub release, real Docker deployment, proxy route, or runtime security posture is asserted as live-verified.