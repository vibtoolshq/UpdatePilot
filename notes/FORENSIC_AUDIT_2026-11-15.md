# Forensic Audit — Universal Router Compatibility

**Date:** 2026-11-15
**Baseline:** `e7736718102a243a8e4e2961e76381a3d8906bae` plus the dirty overlay in `BASELINE_FREEZE_2026-11-15.md`
**Scope:** Current provider contract, engine lifecycle, Docker candidate model, reusable contract tests, public types/docs, package exports, CI evidence, and error paths.

## Executive Finding

UpdatePilot already has a provider-neutral injection point: applications supply `prepare()`, `switch()`, and `rollback()` implementations. A specific router does not need to be selected to make this contract usable. The current runtime remains Docker-backed, however, and the exported provider test kit does not certify every external router automatically.

Define universal compatibility as: **any router that can keep the old route active while a Docker candidate is independently health-checked, switch traffic after health succeeds, and restore/clean up on failure can be integrated through the public contract.** This does not mean every router is bundled, auto-detected, or live-tested, nor does it cover non-Docker deployment engines.

The original baseline fix findings were resolved, explicitly disabled, or scoped by Fix Phases 1–8. The items below are current compatibility/evidence gaps, not a reopening of those original bugs.

## Current Evidence

- `src/core/engine.js` requires all three router methods for the built-in Docker adapter and orders prepare → candidate health → switch → finalize. Prepare, health, switch, and manual rollback failures invoke rollback paths; failed recovery produces `RollbackError`.
- `src/types/index.d.ts` exposes `TrafficRouterDeployment`, `TrafficRouterPreparation`, and `TrafficRouter`.
- `testing/traffic-router-contract.js` exports `defineTrafficRouterContractTests()` and asks provider projects to assert actual route state and clean their isolated resources.
- `test/engine.test.js` tests engine ordering and simulated prepare/health/switch failures. `test/testing/traffic-router-contract.test.js` tests candidate-only health, old-route preservation, switch/rollback, no-switch cleanup, invalid-scenario cleanup, and a deliberately broken prepare implementation.
- Current local release gate after Universal Compatibility Phase 03: 164 tests passed, 1 opt-in Docker test skipped, 0 failed/cancelled; workspace types, installed-tarball provider scenario types, ESM/CommonJS smoke, lint, and diff check passed.
- Remote Actions run `43778214559` passed for committed baseline `e773671`, including the three Node test jobs and generic Docker candidate lifecycle. It does not validate the current uncommitted refinement or a named router's production traffic switching.
- After commit `511c0d8` was pushed, GitHub Actions CI run `43786989299` passed all 8 jobs, including the Node test matrix, package compatibility, example smoke, and Docker candidate/cleanup. The run verifies the published-package TypeScript scenario smoke but does not certify a named router's production traffic switching.

## Findings and Required Work

### UCOMP-01 — Generic provider failure matrix (Resolved in Phase 02)

**Classification:** Generic suite coverage gap, closed in Phase 02; this was not a proven engine defect.
**Baseline evidence:** The suite initially checked normal preparation/switch/rollback scenarios and rejected a provider that switched during `prepare()`. It did not exercise downstream provider rollback after health failure, partial switch, or repeated cleanup.
**Risk before Phase 02:** A provider package could pass the shared suite while mishandling partial switch failure, health failure cleanup, or repeated rollback.
**Phase-01 result:** Contract semantics are now documented; engine validates injected-provider candidate URL syntax, protocol, and effective request URL equality against the configured live endpoint (ignoring fragments) and rolls back before probing on violation. Preparation context/reason and partial switch recovery are covered by engine tests.
**Phase-02 result:** The exported suite now covers candidate-health failure, no-context preparation recovery, switch failure after route mutation, repeated rollback, assertion-failure cleanup, and fragment-only live URL variation; focused contract tests pass 9/9.
**Remaining provider evidence:** Each provider project must run these scenarios against its isolated real infrastructure. Engine/unit and fake-provider results alone do not certify a vendor, version, or production topology.

### UCOMP-02 — Router neutrality is not deployment-runtime neutrality

**Classification:** Scope boundary.
**Evidence:** `TrafficRouterDeployment` carries previous/new container IDs and Docker candidate port mappings; `DockerAdapter` allocates the candidate port.
**Risk:** Users may interpret “universal router support” as support for Kubernetes, VM, serverless, or arbitrary deployment platforms.
**Required:** Keep the current goal explicitly scoped to routers in front of UpdatePilot's Docker candidates. Plan a separate architecture phase before changing the deployment target abstraction.

### UCOMP-03 — Provider verification is supplied by the provider project

**Classification:** Intentional architecture boundary with production-evidence gap.
**Evidence:** The conformance helper receives callbacks for actual candidate health, old/candidate route state, cleanup, and teardown. No router backend is bundled.
**Risk:** Passing the helper with a fake does not prove a real router, version, topology, or credential setup.
**Required:** Each provider project should run the helper against isolated real infrastructure before claiming that provider/version is verified. Vendor selection is optional for universal compatibility and required only for a first-party integration or certification claim.

### UCOMP-04 — Recovery after process restart is not durable

**Classification:** Production readiness gap.
**Evidence:** Engine and Docker rollback eligibility is held in process-local state.
**Risk:** Restarting the process can lose the target needed for manual recovery.
**Required:** Define persistence and recovery ownership in a separately scoped phase; do not imply that router conformance tests solve it.

### UCOMP-05 — Docker lookup errors collapse into “not found”

**Classification:** Error-handling gap.
**Evidence:** `DockerAdapter.getCurrentContainer()` catches inspection/list errors, logs a warning, and returns `null`.
**Risk:** A daemon/API failure may be treated like an absent prior container.
**Required:** Separate not-found from operational failure and add tests before a production claim relying on prior-container discovery.

### UCOMP-06 — Compose is deliberately unsupported

**Classification:** Explicitly disabled, not an open universal-router feature.
**Evidence:** `DockerAdapter.deploy()` rejects `composeFile` before Docker/Compose side effects.
**Required:** Keep the rejection documented. Compose support needs its own candidate identity, route, cleanup, and rollback design.

### UCOMP-07 — Example is loopback-only, not authenticated

**Classification:** Sample exposure limit.
**Evidence:** The example binds to `127.0.0.1`; local users/processes can still call administrative routes.
**Required:** Add authentication before exposing it beyond loopback. No UI change is required for router compatibility.

### UCOMP-08 — Package engine metadata differs

**Classification:** Release consistency follow-up.
**Evidence:** `package.json` says `^20.19.0 || >=22.12.0`; root `package-lock.json` says `>=20`.
**Required:** Reconcile in an approved package/release scope, then verify install behavior. This audit does not edit package metadata.

## Disposition

- No provider vendor must be selected for the provider-neutral contract or shared conformance helper.
- The next universal-compatibility implementation work is contract semantics and downstream failure coverage.
- First-party provider integration and non-Docker deployment support are optional, separate scopes.
- Do not claim universal certification or production readiness from fake-provider tests or the generic Docker candidate job.
