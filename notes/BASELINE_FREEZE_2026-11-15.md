# Baseline Freeze — 2026-11-15

## Snapshot

- Repository: `UpdatePilot`, branch `main`, tracking `origin/main`.
- HEAD: `e7736718102a243a8e4e2961e76381a3d8906bae` (`feat: add reusable router provider conformance tests`). This is the committed baseline, not a clean worktree.
- Package: `update-pilot@0.0.1`; `package.json` engine range: `^20.19.0 || >=22.12.0`.
- Local runtime: Windows, Node.js `v26.12.0`, npm `11.20.0`.

## Worktree Overlay

Preserve these pre-existing local changes; they are not included in HEAD:

- `.gitignore`: removes the `notes/` ignore rule. Do not edit or stage this user change. Private notes are currently untracked and must stay uncommitted.
- `testing/traffic-router-contract.js`: runs scenario validation inside `try/finally` and calls scenario cleanup when available.
- `test/testing/traffic-router-contract.test.js`: adds cleanup coverage when scenario validation fails.
- `notes/`: local documentation; excluded by the package allowlist, not staged or committed.

No application runtime, workflow, dependency, UI, or unrelated test edits were present in the frozen overlay.

## Verification Evidence

### Current local worktree

- `npm run prepublishOnly`: 151 passed, 1 opt-in Docker test skipped, 0 failed or cancelled.
- Public TypeScript fixture compiled.
- Fresh ESM/CommonJS package smoke passed: 17 intended files, 35 KB compressed.
- `npm run lint` passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: no whitespace errors; Git emitted only LF-to-CRLF normalization warnings for existing dirty files.
- Docker CLI was not available locally, so the real Docker test was skipped.

### Remote committed baseline

GitHub Actions run `43778214559` passed for commit `e773671`: Node 20.19.0/22.12.0/26.12.0 test matrix, package compatibility matrix, example smoke, lint, types, audit, and Docker candidate lifecycle/cleanup. It does not test a named router's production traffic switch and predates the two local cleanup-refinement edits above.

## Known Baseline Limits

- Router integration is provider-neutral and injected; no built-in router is shipped.
- Deployment candidate data is Docker-shaped (container IDs and published candidate ports). Router-vendor neutrality does not imply Kubernetes or arbitrary deployment-runtime support.
- Docker Compose deployment is rejected before side effects.
- Rollback metadata is process-local; crash/restart recovery is not proven.
- The Express sample binds to loopback but has no same-host authentication.
- `package-lock.json` root engine metadata still says `>=20`; it does not match the narrower `package.json` engine range. This docs-only task does not change it.

## Freeze Rule

Treat HEAD plus the overlay above as the current baseline. Any later phase must record its own plan, exact allowlist, acceptance checks, and verification before implementation. This file is a snapshot, not a production-readiness claim.

## Post-Freeze Update — Universal Compatibility Phase 01

Phase 01 is complete in the local worktree. The engine now validates candidate health URLs for injected routers and rolls back route/container state before health probing if the URL is malformed, non-HTTP(S), or equal to the configured live endpoint. The custom-Docker-adapter-owned handoff remains supported through its optional `DockerDeployResult.healthUrl`; it is not claimed as provider certification.

Verification on local Node 26.12: 160 passed, 1 opt-in Docker test skipped, 0 failures/cancellations; type and package smoke, lint, high-severity audit, diagnostics, and diff checks pass. The run is local only; GitHub Actions run `43778214559` predates Phase 01. The allowed Phase-01 file changes are recorded in `PHASE_LOG.md`. Existing `.gitignore` and Phase-03A changes remain uncommitted and preserved.

## Post-Freeze Update — Universal Compatibility Phase 02

Phase 02 expands the exported downstream conformance suite with health-failure rollback, no-context preparation recovery, switch failure after route mutation, repeated rollback, assertion-failure cleanup, and fragment-insensitive candidate URL validation. Final local verification: 164 passed, 1 opt-in Docker test skipped, 0 failed/cancelled; types/package smoke passed (17 files, 36 KB); lint, audit, diagnostics, and diff checks passed. The focused suite passed 9/9. No provider vendor was added or certified; provider-owned real infrastructure remains untested locally.

## Post-Freeze Update — Universal Compatibility Phase 03

The fresh-package smoke now installs the tarball into an isolated consumer and compiles a TypeScript provider scenario against its installed declarations, in addition to ESM/CommonJS runtime imports. README documents provider-suite execution, and `AGENTS.md` records the user's bounded verification policy. One final local `npm run prepublishOnly` passed: 164 tests, 1 opt-in Docker skip, 0 failures/cancellations; package smoke covered 17 files / 36 KB. Lint, diagnostics, and diff check passed. The CI workflow was unchanged because its existing package matrix already invokes this smoke. No provider or vendor was added; Phase 04 remains optional and target-dependent.

Commit `511c0d882342c9ce778b4e55e335f598b678b9ad` was pushed to `origin/main`. GitHub Actions CI run `43786989299` passed all 8 jobs, including the Node test matrix, package-compatibility matrix, example smoke, and Docker candidate cleanup. Private notes and the existing `.gitignore` edit were not committed. CodeQL was a separate run and was still in progress at the single status check.
