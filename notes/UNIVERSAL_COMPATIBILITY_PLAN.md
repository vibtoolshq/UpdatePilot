# Universal Router Compatibility Plan

## Goal

Replace the accumulated private reports and stale phase snapshots with one current, evidence-based documentation pack. The new roadmap will make any provider that implements UpdatePilot's `TrafficRouter` contract usable without hardcoding or selecting a vendor, while separating that goal from first-party provider certification and non-Docker deployment support.

## Baseline Hypothesis

The current engine already injects a provider-neutral router interface, but its deployment payload is Docker-candidate-shaped and its reusable conformance suite covers only a subset of failure behavior. Thus universal router compatibility within the Docker deployment model does not require choosing a provider; claims covering every arbitrary router or non-Docker platform need explicit contract and scope boundaries.

## Starting Snapshot

- Commit: `e7736718102a243a8e4e2961e76381a3d8906bae` on `main`.
- Local environment: Windows, Node.js `v26.12.0`, npm `11.20.0`.
- Preserve existing tracked worktree changes in `.gitignore`, `testing/traffic-router-contract.js`, and `test/testing/traffic-router-contract.test.js`; preserve all other user files.
- Private `notes/` files are currently untracked because the existing `.gitignore` edit removes the `notes/` rule. Do not stage, commit, push, or edit `.gitignore`.

## Scope Lock

- Documentation-only changes under `notes/`.
- Replace stale historical/current-status prose with a concise baseline freeze, forensic audit, stepwise implementation roadmap, phase log, error-handling inventory, actual implementation status, and development log.
- Retain this universal compatibility plan as the governing scope record; carry forward verified session facts and discard temporary resume notes.
- Do not modify application source, tests, package metadata, lockfiles, CI, public documentation, UI, dependencies, or Git state.

## Steps

1. Run the current release verification and capture exact local results; distinguish those from the already-successful remote CI run for commit `e773671`.
2. Freeze the current commit plus dirty worktree overlay and record remaining production limitations.
3. Replace the old notes pack with current, non-contradictory universal-compatibility documents.
4. Cross-check phase counts, file scopes, acceptance criteria, error gaps, and all verification claims against source, tests, package metadata, and CI evidence.

## Universal Compatibility Definition

- Universal router compatibility means an application may inject any provider implementing `prepare`, `switch`, and `rollback` for UpdatePilot's Docker-backed candidate lifecycle.
- UpdatePilot will not autodetect, bundle, or claim to have tested every provider.
- A provider's own project can run the exported conformance suite against isolated real infrastructure; vendor/version certification is optional and separate.
- Kubernetes or another non-Docker deployment substrate is outside this definition and requires a separately approved deployment-abstraction phase.

## Verification Criteria

- `npm run prepublishOnly`, `npm run lint`, `npm audit --audit-level=high`, and `git diff --check` results are current and recorded accurately.
- The new report identifies actual working behavior, unresolved compatibility gaps, known safety limits, and evidence provenance.
- The roadmap gives each future phase an exact allowlist, explicit exclusions, and falsifiable acceptance checks; no phase requires a vendor choice unless it adds an optional first-party integration.
- No non-`notes/` file is changed by this documentation rebuild; existing user changes remain untouched and uncommitted.

## Baseline Verification

- `npm run prepublishOnly`: 151 tests passed, 1 opt-in Docker test skipped, 0 failed/cancelled; public type compilation passed; fresh package smoke passed (17 files, 35 KB compressed).
- `npm run lint` passed; `npm audit --audit-level=high` found 0 vulnerabilities.
- `git diff --check` found no whitespace errors; Git warned only that existing LF files may be normalized to CRLF.
- Docker CLI was not found on the local host.
- GitHub Actions run `43778214559` passed for commit `e773671`; it predates the current uncommitted cleanup refinement. Do not treat it as remote verification of that refinement.
- `package.json` allows `^20.19.0 || >=22.12.0`; the root `package-lock.json` still says `>=20`. Record this mismatch; do not modify the lockfile in this documentation scope.

## Completion

- Replaced the old baseline, forensic, roadmap, phase, actual-status, error, and development notes with the refreshed files listed in `notes/`.
- Removed the temporary Phase-03A resume note after carrying its verified facts into the current records.
- Notes diagnostics report no errors; final inventory contains the seven current reports/logs plus this governing plan.
- No application files or Git index/remote were changed by the documentation rebuild.

## Roadmap Position

- Universal Compatibility Phase 01 is complete in the local worktree; see `PHASE_LOG.md` for exact allowlist, results, and adapter-owned handoff distinction.
- Universal Compatibility Phase 02 is complete locally; see `PHASE_LOG.md` for evidence and scope audit.
- Universal Compatibility Phase 03 is complete locally; fresh-tarball TypeScript and runtime smoke, provider invocation guidance, and the requested `AGENTS.md` verification policy are in place.
- No mandatory implementation phase remains for router-vendor-neutral compatibility on Docker candidates. Optional first-party provider integration requires a user-selected target and separate approval.
