# Universal Compatibility Roadmap

## Goal and Definition

Support any traffic router that can control routing for UpdatePilot's Docker-backed candidate by injecting an implementation of `prepare(deployment)`, `switch(deployment, context)`, and `rollback(deployment, context, reason)`. Do not hardcode a router, autodetect vendors, or require a provider choice for the universal contract.

“Compatible” means an application/provider can implement and pass the contract. “First-party tested” means UpdatePilot has run that provider/version against isolated real infrastructure. Those are different claims. Kubernetes and other non-Docker deployment engines are outside this goal and need a separate architecture decision.

## Current Status

- Product Fix Phases 0–8: complete.
- CI Test Phases 01, 02, and 03A: complete; run `43778214559` passed all reported jobs for commit `e773671`.
- Existing foundation: injected provider contract, public types, exported downstream conformance helper, package export/type smoke, engine call-order/failure tests, and public provider-authoring guidance.
- Current local cleanup refinement: scenario validation is within cleanup `try/finally`; focused and full release checks pass locally. This refinement remains uncommitted and was not in the remote run.
- Universal Compatibility Phase 00 (baseline and documentation rebuild): complete.
- Universal Compatibility Phase 01 (TrafficRouter contract semantics): complete; no router vendor was selected or added.
- Universal Compatibility Phase 02 (provider failure conformance): complete locally; no router vendor was selected.
- Universal Compatibility Phase 03 (provider authoring/package/CI gate): complete locally; no vendor matrix or provider implementation was added.
- No mandatory implementation phase remains for universal router compatibility within the Docker deployment model.
- Optional next work: Phase 04 first-party provider integration after selecting a target provider/version/environment; Phase 05 non-Docker deployment targets remain a separate architecture project.

## Global Scope Lock

- No provider-specific dependency or built-in router in universal phases.
- No UI, deployment API, credential, or unrelated release changes.
- Preserve the existing runtime contract unless Phase 01 documents a tested incompatibility and explicitly approves an API change.
- Every implementation phase must have a written plan, exact file allowlist, out-of-scope list, acceptance checks, and post-phase audit before edits.
- Product/runtime changes are not authorized by this roadmap itself; start a phase only after its scope is approved.

## Phase 00 — Baseline and Documentation (Complete)

**Scope:** `notes/` only. Refresh current baseline, forensic report, roadmap, phase log, actual status, and error inventory. No application files changed.

**Acceptance:** Commit plus dirty overlay recorded; local and remote evidence distinguished; router-vendor compatibility separated from deployment-runtime support; no stale phase status remains.

## Phase 01 — TrafficRouter Contract Semantics

**Problem:** The method shape is public, but all lifecycle invariants and failure responsibilities are not yet stated as one versioned contract.

**Scope lock:** `src/types/index.d.ts`, `src/core/engine.js`, `test/engine.test.js`, `README.md`, and `docs/ARCHITECTURE.md` only. Do not add a router implementation, dependency, deployment runtime, UI, or CI secret.

**Work:** Specify what `prepare()` may mutate, when the old route must remain active, what health URL means, what context must preserve, how `switch()` partial failure is handled, and what `rollback()` must restore/clean. State idempotency/retry expectations and what happens if prepare fails before returning context. Distinguish an injected router from a custom Docker adapter that owns handoff and supplies its own candidate probe. Keep vendor-specific mechanics outside the core.

**Acceptance:** Public types/docs agree with engine call order; tests cover success and error order; every failure has an observable route/recovery expectation; no provider name is required to implement the contract. Any API shape change has explicit compatibility tests.

**Completed:** `runUpdate()` captures provider context before validating its preparation result. For an injected `TrafficRouter`, it requires an absolute HTTP(S) candidate URL distinct from the configured live health URL; malformed, unsupported-protocol, or identical URLs fail as `ConfigError` inside the preparation cleanup boundary, causing router and Docker rollback before any health probe or finalize. The existing custom-Docker-adapter-owned handoff remains supported: its optional `DockerDeployResult.healthUrl` is the candidate probe, and the internal no-op router validates protocol without pretending to certify the adapter's route switch. Contract docs/types now define prepare cleanup, opaque context forwarding, partial-switch recovery, idempotent rollback, and no-prior-route behavior.

**Evidence:** Engine tests 48/48; final `npm run prepublishOnly`: 160 passed, 1 opt-in Docker test skipped, 0 failed/cancelled; public type compile and package smoke passed (17 files, 35 KB); lint passed; high-severity audit found 0 vulnerabilities; diagnostics clean; `git diff --check` found no whitespace errors (line-ending warnings only). Local verification is Node 26.12; the prior remote run predates this phase.

**Scope audit:** Changed only `src/core/engine.js`, `src/types/index.d.ts`, `test/engine.test.js`, `README.md`, and `docs/ARCHITECTURE.md`. No router vendor, dependency, UI, CI, credentials, or deployment target was changed. Existing Phase-03A helper diffs and `.gitignore` edit were preserved.

## Phase 02 — Expand the Reusable Provider Conformance Suite

**Problem:** The helper covers core happy-path invariants and invalid setup cleanup, but does not yet test the full failure matrix against downstream provider implementations.

**Scope lock:** `testing/traffic-router-contract.js` and `test/testing/traffic-router-contract.test.js` only. If new public types are unavoidable, stop and write an expanded phase plan before editing them.

**Work:** Add contract cases for prepare failure cleanup, candidate health failure with route restoration, switch failure including partial mutation, rollback idempotency, and cleanup after assertion failure. Scenarios must use isolated infrastructure and assert actual route state. Do not add fake success claims.

**Acceptance:** A deliberately faulty provider is rejected for each violated invariant; cleanup always runs; the provider's old route is confirmed after recoverable failure; existing package export and all current tests pass.

**Completed:** The exported suite now covers candidate-health failure rollback, rollback with unavailable preparation context, switch failure after route mutation, repeated rollback, assertion-failure teardown, and fragment-insensitive live/candidate URL comparison. No scenario fields, public types, providers, or CI workflows were added.

**Evidence:** Focused contract suite 9/9; final `npm run prepublishOnly`: 164 passed, 1 opt-in Docker test skipped, 0 failed/cancelled; types/package smoke passed (17 files, 36 KB); lint passed; high-severity audit found 0 vulnerabilities; diagnostics clean; `git diff --check` has no whitespace errors (line-ending warnings only).

**Scope audit:** Only `testing/traffic-router-contract.js` and `test/testing/traffic-router-contract.test.js` were changed for Phase 02. No engine, types, UI, public docs, provider, dependency, or CI changes. The test suite remains provider-neutral; actual provider certification still requires the provider project to run it against isolated real infrastructure.

## Phase 03 — Provider Authoring and Generic CI Gate

**Problem:** Provider projects need a repeatable, documented way to run the suite without coupling UpdatePilot CI to a vendor.

**Scope lock:** `AGENTS.md` only for the requested verification-budget policy; `README.md` for downstream test invocation; `scripts/package-smoke.js` for fresh-tarball type compilation; and relevant private phase/status logs. Existing type fixture, package export tests, and CI already cover the other gates and must remain unchanged unless a concrete acceptance gap is found. Do not add a named provider, credential, or dependency.

**Work:** Add a TypeScript scenario compile against the installed fresh tarball, not only the workspace package. Document where downstream providers place the test file and how they run it with Node's test runner. Add the user-requested short verification-budget rules to `AGENTS.md`. Reuse the existing package-compatibility workflow, which already invokes `npm run test:package` across the supported Node matrix; keep provider-specific jobs in provider projects.

**Acceptance:** The temporary installed consumer imports the helper and compiles a representative TypeScript scenario against the tarball's declarations; README explains provider test invocation; `AGENTS.md` includes a bounded once-per-phase verification policy; existing generic CI runs the updated package smoke without vendor-specific setup. No provider, API, UI, or dependency is added.

**Completed:** The temporary consumer smoke compiles a `.mts` `TrafficRouterContractTestOptions` scenario against the installed tarball. README shows provider test invocation; `AGENTS.md` documents the verification budget. The existing CI package matrix runs this smoke without changes to the workflow.

**Local evidence:** `npm run prepublishOnly` passed (164 tests, 1 opt-in Docker skip, 0 failures/cancellations; workspace types, installed-tarball type check, ESM/CommonJS smoke); lint, diagnostics, and diff checks passed. Package smoke: 17 files, 36 KB compressed.

**Remote evidence:** User-authorized commit `511c0d882342c9ce778b4e55e335f598b678b9ad` was pushed to `origin/main`; GitHub Actions run `43786989299` passed all 8 jobs: Node test matrix (20.19/22.12/26.12), package-compatibility matrix, example smoke, and Docker candidate/cleanup. It includes the fresh-tarball TypeScript scenario check.

**Scope audit:** Phase-03 changes were limited to `scripts/package-smoke.js`, `README.md`, `AGENTS.md`, and private notes. No provider, runtime API, UI, dependency, package metadata, workflow, or credentials changed. `.gitignore` and private notes were excluded from the commit.

## Phase 04 — Optional First-Party Provider Integration

**Status:** Optional, not a blocker for universal compatibility.

**Entry criteria:** User/community demand selects a provider and target version/environment. Then write a new phase plan with exact backend files, credentials handling, disposable infrastructure, support policy, and real acceptance criteria. No provider is implied by this roadmap.

**Approval prompt template:** `Approve Universal Compatibility Phase 04 — Optional First-Party Router Integration (Provider: <name>, Version: <version>, Environment: <target>)`

## Phase 05 — Optional Non-Docker Deployment Targets

**Status:** Separate architecture project, not implied by router neutrality.

**Entry criteria:** Explicit decision to support non-Docker deployment platforms. Revisit `TrafficRouterDeployment`, candidate lifecycle, health endpoints, rollback persistence, and adapter boundaries. Define compatibility with existing Docker users before API edits.

## Definition of Done

- No router vendor is hardcoded or required for the generic path.
- Any provider meeting the documented contract can be injected for Docker-backed candidates.
- The reusable suite enforces contract invariants and failure cleanup against provider-owned isolated environments.
- Public docs distinguish user-provided compatibility from vendor/version certification.
- Provider-specific and non-Docker work remain separate, opt-in roadmaps.
