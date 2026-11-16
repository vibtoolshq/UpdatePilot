# Phase Log — Universal Router Compatibility

## Current State

- Documentation/baseline refresh: complete; see `UNIVERSAL_COMPATIBILITY_PLAN.md`.
- Product Fix Phases 0–8: complete.
- CI Test Phases 01, 02, 03A: complete.
- Universal Compatibility Phase 01: complete; injected-router health targets and lifecycle/error semantics are specified and enforced.
- Universal Compatibility Phase 02: complete locally; provider failure conformance suite expanded, no vendor selected.
- Universal Compatibility Phase 03: complete; the installed tarball's TypeScript provider scenario compiles, provider invocation is documented, and `AGENTS.md` contains the requested verification budget.
- npm Release Readiness: complete locally; package metadata/links and lockfile are aligned, full publish gate and npm dry-run passed. No actual publication attempted; registry account/name confirmation remains external.
- No mandatory implementation phase remains for provider-neutral router compatibility on Docker candidates. Phase 04 first-party integration is optional and target-dependent.
- Optional provider-specific integration and non-Docker deployment support are separate and unapproved.

## Completed Product Work

| Phase  | Result                                                                                 | Remaining limit                                                                   |
| ------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Fix 0  | Baseline and initial forensic findings documented.                                     | Historical baseline is not a production claim.                                    |
| Fix 1  | Rollback metadata/result lifecycle and post-finalize recovery fixed.                   | State remains process-local; Docker proof used fakes.                             |
| Fix 2  | Dynamic candidate ports and injected `prepare → health → switch → finalize` contract.  | No built-in provider or real route-switch proof.                                  |
| Fix 3  | Compose mode rejected before side effects.                                             | Compose remains unsupported.                                                      |
| Fix 4  | Rollback settings, image retention, health headers/interval, logger semantics aligned. | Docker retention/provider behavior partly fake-tested.                            |
| Fix 5  | Forced update without eligible release rejected with typed error.                      | Tags are mutable; digest pinning is not implemented.                              |
| Fix 6  | Example loopback binding and explicit real-mode/router settings.                       | Same-host callers remain unauthenticated.                                         |
| Fix 7  | Node range, ESM/CommonJS interop, public declarations and claims aligned.              | Node 22.12 reports experimental `require(esm)`; lockfile engine metadata differs. |
| Fix 8  | Package, CI, type and release gates added.                                             | Generic Docker candidate test is not provider traffic certification.              |
| CI 01  | Health fake timer fixed without changing production timeout behavior.                  | Local Docker remains unavailable.                                                 |
| CI 02  | Reusable workflow, Node matrix, Docker candidate/cleanup job.                          | Tests container lifecycle only.                                                   |
| CI 03A | Exported provider-neutral conformance kit and types.                                   | Initial helper coverage does not yet cover every provider failure mode.           |

## Current Verification

- Latest local Node 26.12 gate after Phase 03: `npm run prepublishOnly` passed, 164 passed / 1 opt-in Docker skip / 0 failures or cancellations.
- Workspace types, fresh-tarball TypeScript provider scenario, and ESM/CommonJS package smoke passed; 17 files, 36 KB compressed.
- `npm run lint` passed; touched-file diagnostics are clean; `git diff --check` found no whitespace errors. Dependency audit was not repeated because Phase 03 changed no dependencies.
- Remote run `43778214559` passed for commit `e773671` across Node 20.19/22.12/26.12, package compatibility, example, lint, types, audit, and Docker candidate lifecycle. It predates the local Phase-01/02 changes and does not verify them remotely.
- User-authorized commit `511c0d882342c9ce778b4e55e335f598b678b9ad` was pushed to `origin/main`. GitHub Actions CI run `43786989299` completed successfully: all 8 jobs passed, including Node 20.19/22.12/26.12 tests, all package-compatibility jobs, example smoke, and Docker candidate/cleanup. The separate CodeQL run was in progress at the single status check.

## Universal Compatibility Phase 03 — Provider Authoring and Generic CI Gate (Complete)

### Plan and Scope Lock

- **Goal:** Prove that a provider project can import and type-check the helper from the published tarball, run it in its own Node test suite, and follow a concise phase verification policy.
- **Falsifiable hypothesis:** `test:types` currently compiles `type-tests/public-api.ts` against the workspace package, while `scripts/package-smoke.js` checks only runtime ESM/CommonJS imports from the installed tarball. Therefore a missing/broken published helper declaration could pass both gates.
- **Discriminating check:** Read the current package smoke/type fixture (done); add one temporary `.mts` consumer fixture to the fresh installed tarball smoke and ensure the package's exported scenario types compile.
- **Allowed files:** `scripts/package-smoke.js`, `README.md`, `AGENTS.md` (only the user-requested verification-budget section), and private notes. Existing `type-tests/public-api.ts`, `test/package-exports.test.js`, `.github/workflows/ci.yml`, `package.json`, runtime, provider helpers, and UI remain unchanged unless a concrete failure forces a revised scope.
- **Work:** Compile a representative `TrafficRouterContractTestOptions` scenario against the fresh tarball with TypeScript 5.9.3; document that provider test files run via `node --test`; add concise once-per-phase verification rules to `AGENTS.md`. Existing package-compatibility CI already runs `npm run test:package` across the supported Node matrix.
- **Out of scope:** No router vendor/backend, dependency, API/type edits, credentials, UI, non-Docker runtime, CI workflow change, or repeated verification loops. The generic CI gate runs without any provider installed.
- **Acceptance:** Fresh tarball install passes ESM/CommonJS and TypeScript scenario checks; provider authoring docs name the test-run command; `AGENTS.md` includes bounded verification guidance; one final `npm run prepublishOnly`, lint, diff and diagnostics batch passes. Update private records and close without repeating passing gates.

### Implementation and Scope Audit

- `scripts/package-smoke.js` now writes a temporary `.mts` provider scenario into the isolated consumer, installs the tarball, and compiles that scenario against the installed package declarations. ESM/CommonJS runtime smoke remains in the same gate.
- README documents placing provider registration in a test file and running it through `node --test` or the provider project's test command.
- `AGENTS.md` now enforces the requested verification budget: one focused check and one final gate, no repeated passing checks/polling loops, and scoped retries only after failure.
- Existing CI package-compatibility jobs already run `npm run test:package`; no workflow change was needed.
- Final verification: one `npm run prepublishOnly` passed (164 tests, 1 opt-in Docker skip, 0 failures/cancellations; workspace types, installed-tarball TypeScript scenario, and ESM/CommonJS smoke passed); lint, diagnostics, and diff checks passed. Dependencies were unchanged, so audit was not repeated for Phase 03.
- Scope audit: Phase-03 changes were limited to `scripts/package-smoke.js`, `README.md`, `AGENTS.md`, and private records. The requested commit included only nine approved project files spanning Phases 01–03; `.gitignore` and private `notes/` were excluded. No provider, UI, dependency, package metadata, CI workflow, or credentials changed.

## Optional Phase 04 — First-Party Provider Integration

No mandatory work remains for the universal provider-neutral contract. An optional first-party provider phase requires the user to select a provider, version, topology, and test environment before an exact plan can be written.

**Approval prompt template:** `Approve Universal Compatibility Phase 04 — Optional First-Party Router Integration (Provider: <name>, Version: <version>, Environment: <target>)`

## Universal Compatibility Phase 01 — Contract Semantics (Complete)

### Plan and Scope Lock

- **Goal:** Make the public `TrafficRouter` lifecycle contract explicit and enforce the candidate health target at runtime.
- **Falsifiable hypothesis:** `runUpdate()` accepts any string from `prepare().healthUrl`, including the configured live health URL or a non-HTTP URL. Returning the live URL could let a healthy old deployment satisfy candidate verification; an invalid URL could leave prepared routing state without entering the intended health-failure rollback path.
- **Discriminating check:** Add focused regressions proving the engine rejects malformed/non-HTTP/live health URLs (including a fragment-only URL variation) before health probing, calls router and Docker rollback, and does not finalize. A valid distinct HTTP(S) candidate URL must retain the existing prepare → health → switch order.
- **Allowed files:** `src/types/index.d.ts`, `src/core/engine.js`, `test/engine.test.js`, `README.md`, and `docs/ARCHITECTURE.md` only.
- **Contract decisions:** With an injected router, `TrafficRouterDeployment.healthUrl` is the configured live endpoint; `prepare()` must keep its route active and return an absolute HTTP(S) candidate-only URL distinct from it, plus optional opaque context. URL identity ignores fragments because HTTP requests do not send them. If `prepare()` rejects before returning context, it must clean its own partial work; the engine also calls idempotent `rollback(deployment, undefined, "prepare-failed")`. The same context is forwarded unchanged to `switch()` and `rollback()`. A partial switch failure must be recoverable. `rollback()` must be idempotent because automatic cleanup can precede later manual recovery; with no prior route it must leave the candidate unrouted. If no router is injected and a custom Docker adapter owns handoff, the internal no-op router uses `DockerDeployResult.healthUrl` (or configured health URL) as that adapter's probe target; only HTTP(S) syntax is enforceable in that path.
- **Out of scope:** No router backend/vendor, dependency, package export, CI workflow, credentials, deployment-runtime abstraction, Compose support, UI, or unrelated cleanup. No API shape change unless a test demonstrates it is required; any such finding stops for a revised scope.
- **Acceptance:** URL validation occurs inside the preparation cleanup boundary; malformed and unsupported-protocol URLs are rejected with `ConfigError` in either path, while an injected router's live-endpoint URL (including a fragment-only variation) is rejected. Route/Docker rollback happens before rethrow, and health/finalize are not called. The custom-adapter-owned handoff path remains compatible. Types, README, and architecture docs state identical lifecycle semantics. Existing successful and failure-order tests remain green.

### Implementation and Scope Audit

- The engine records `prepare()` context before validating the returned health URL. Injected routers must return an absolute HTTP(S) candidate URL different from the configured live URL; rejection runs router rollback and Docker rollback before health probing/finalize.
- The internal no-op router path for a custom Docker adapter that owns handoff retains the adapter's optional candidate health URL; protocol validation applies, but URL inequality is not applied against the same adapter-owned target.
- Public TypeScript comments, README, and architecture docs now describe prepare failure cleanup, context forwarding, switch failure recovery, idempotent rollback, no-prior-route behavior, and the custom-adapter-owned exception.
- Added engine regressions for malformed URL, unsupported scheme, live endpoint reuse, HTTPS candidate, same opaque context after partial switch, prepare failure's undefined context/reason, and adapter-owned health URL.
- Verification: engine tests 48/48; full suite 160 passed / 1 opt-in Docker skip / 0 failed or cancelled; public types and fresh package smoke passed (17 files, 35 KB); lint passed; audit 0 vulnerabilities; diagnostics clean; diff check clean apart from line-ending warnings.
- Exact implementation allowlist followed: `src/core/engine.js`, `src/types/index.d.ts`, `test/engine.test.js`, `README.md`, `docs/ARCHITECTURE.md`. No provider, UI, dependency, CI, or deployment-platform change. Pre-existing `.gitignore` and CI Test Phase-03A edits remain untouched.
- At Phase-01 close, Phase 02 was unstarted; its completion is recorded below. Local Docker is unavailable; opt-in Docker integration remains skipped.

## Universal Compatibility Phase 02 — Provider Failure Conformance (Complete)

### Plan and Scope Lock

- **Goal:** Make downstream provider projects able to test rollback/cleanup behavior for failures after route preparation, without selecting or bundling a router vendor.
- **Falsifiable hypothesis:** The exported suite currently covers three normal scenarios plus setup-validation/prepare-invariant failures, but does not assert provider rollback after a simulated health failure, a switch that mutates routing before rejecting, or a repeated rollback. Cleanup-after-validation is covered, but cleanup after a failing provider assertion is not explicitly proven.
- **Discriminating check:** Run `node --test test/testing/traffic-router-contract.test.js` before changes; inspect the registered suite and confirm these failure cases are absent.
- **Allowed files:** `testing/traffic-router-contract.js` and `test/testing/traffic-router-contract.test.js` only.
- **Implementation approach:** Reuse the current scenario contract and wrap real scenario methods in test cases to induce deterministic failure at each boundary. Verify `rollback()` receives the deployment, opaque context, and failure reason; assert old route and resource cleanup. For no-context prepare recovery, exercise rollback with `undefined` context and `"prepare-failed"`. Call rollback twice to verify idempotence. Force a child test assertion to fail and prove `cleanup()` still runs.
- **Out of scope:** No source engine/types, README/architecture, package metadata, CI/workflow, provider implementation/vendor, dependency, UI, secrets, or new scenario fields/types. If the suite cannot exercise a failure without a new public scenario hook, stop and write an expanded scope plan rather than adding that API here.
- **Acceptance:** The provider suite rejects broken cleanup/rollback behavior for each new case; a partial route mutation is restored; repeated rollback remains safe; `cleanup()` executes after assertion failure; the existing happy-path and setup-validation cases remain green. Focused suite, full release gate, lint, audit, diagnostics, and diff checks pass.

### Implementation and Scope Audit

- Expanded `defineTrafficRouterContractTests()` with provider scenarios for candidate-health failure rollback, rollback when preparation context is unavailable, switch failure after route mutation, and repeated rollback. The suite checks old-route restoration and prepared-resource cleanup after recovery.
- Aligned candidate/live URL comparison with Phase 01 by ignoring fragments, which are not sent in HTTP requests.
- Strengthened subprocess regressions to verify provider cleanup runs after assertion failure and that a fragment-only URL variation of the live endpoint is rejected.
- Focused conformance suite: 9/9. Full release gate: 164 passed, 1 opt-in Docker test skipped, 0 failed/cancelled; type compile and package smoke passed (17 files, 36 KB); lint, audit (0 vulnerabilities), diagnostics, and diff checks passed.
- Implementation allowlist followed exactly: `testing/traffic-router-contract.js`, `test/testing/traffic-router-contract.test.js`. No public type/API, engine, UI, workflow, provider vendor, dependency, or public doc changes.
- Real provider-specific verification remains downstream; local Docker is unavailable and no provider was selected or bundled.

## Worktree Policy

The existing `.gitignore` edit remains local. Phase-01/02/03 project changes were committed and pushed in `511c0d8`. Keep private `notes/` untracked and do not stage, commit, or push them.
