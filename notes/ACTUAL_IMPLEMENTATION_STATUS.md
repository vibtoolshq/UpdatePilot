# Actual Implementation Status

**Snapshot:** 2026-11-15
**Commit baseline:** `e7736718102a243a8e4e2961e76381a3d8906bae`
**Package:** `update-pilot@0.0.1`; Node range `^20.19.0 || >=22.12.0`.

This records observed behavior, not roadmap promises.

## Working and Verified

| Area                  | Actual behavior                                                                                                                                                                                   | Evidence and limits                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update engine         | Checks releases, supports dry-run/force, candidate deployment, health verification, router switch, rollback/finalize, hooks, and in-process concurrency rejection.                                | Phase-01 rejects malformed/non-HTTP/live health targets from injected providers inside the rollback boundary. Live provider routing is not proven.                                                             |
| Router injection      | Injected provider receives configured live health URL; its `prepare()` must return a distinct absolute HTTP(S) candidate URL and opaque context.                                                  | Engine verifies URL syntax/protocol/difference, not actual routing; candidate payload remains Docker-oriented.                                                                                                 |
| Adapter-owned handoff | A custom Docker adapter may omit `trafficRouter` and provide `DockerDeployResult.healthUrl` for its candidate health probe.                                                                       | Internal no-op router preserves compatibility; adapter owns routing safety, not certified by provider contract tests.                                                                                          |
| Candidate lifecycle   | Non-Compose Docker candidate gets dynamic host ports; health is checked before route switch; rollback calls router before Docker cleanup.                                                         | Fake router/Docker tests plus generic Docker candidate job; no named router backend.                                                                                                                           |
| Reusable test kit     | `defineTrafficRouterContractTests()` is exported at `update-pilot/testing/traffic-router-contract`. Provider projects supply isolated setup, real health/route assertions, cleanup, and teardown. | Suite covers candidate health, old-route preservation, health/prepare/switch recovery, repeated rollback, assertion cleanup, and fragment-insensitive URL identity. Real provider behavior remains unverified. |
| Compose               | `composeFile` deployment rejects before Docker/Compose side effects.                                                                                                                              | Explicitly unsupported, not an unimplemented path that can be used.                                                                                                                                            |
| Rollback              | Finalize/manual rollback, pending recovery and rollback eligibility are handled in engine/adapter state.                                                                                          | Process-local only; restart durability and live Docker restoration are not established.                                                                                                                        |
| Configuration/logger  | Health headers/intervals, rollback flags/image retention, resolved logger options and silent level are implemented.                                                                               | Unit/fake-client tests pass.                                                                                                                                                                                   |
| Errors/hooks          | Typed errors, causes/context, phase wrapping, safe lifecycle hooks, JSON serialization.                                                                                                           | Nested context/stack must be sanitized before external response.                                                                                                                                               |
| Example               | Demo API works; real mode requires explicit target and router module and binds to loopback.                                                                                                       | Same-host users remain unauthenticated.                                                                                                                                                                        |
| Package/runtime       | Root, adapter and testing exports; ESM/CommonJS; public types. Fresh package smoke also compiles a TypeScript provider scenario against the installed tarball.                                    | Local Node 26.12 checks; remote matrix passed Node 20.19/22.12/26.12 on earlier committed code. Node 22.12 emits experimental `require(esm)` warning.                                                          |

## Current Verification

- Local `npm run prepublishOnly` after Phase-03: 164 passed, 1 opt-in Docker test skipped, 0 failed/cancelled.
- Workspace type compile, installed-tarball TypeScript provider scenario, and ESM/CommonJS smoke passed; package contains 17 intended files, 36 KB compressed.
- Local lint and diagnostics passed; `git diff --check` has no whitespace errors. No dependencies changed in Phase 03; the prior high-severity audit reported 0 vulnerabilities.
- GitHub Actions run `43778214559` passed all reported jobs on commit `e773671`. That remote run does not include the current uncommitted cleanup refinement.
- Commit `511c0d882342c9ce778b4e55e335f598b678b9ad` is pushed to `origin/main`; CI run `43786989299` passed all 8 jobs: Node test matrix, package-compatibility matrix, example smoke, and Docker candidate/cleanup. It includes the completed Phase-01/02/03 work.

## Universal Compatibility Status

**Ready now:** An application can inject any router implementation that satisfies the documented methods and can route the Docker candidate while the old route remains active. No specific vendor needs to be selected.

**Phase-01 complete:** Contract semantics, runtime URL guard for injected providers, rollback/context error path tests, and public docs/types agree.

**Phase-02 complete:** The exported downstream conformance suite exercises the generic failure/cleanup matrix. Provider packages still need to run it against their isolated real infrastructure before making provider/version certification claims.

**Phase-03 complete:** The published helper's types compile from a fresh tarball, provider test invocation is documented, and the existing generic CI matrix exercises the updated package smoke.

**No mandatory implementation phase remains** for universal router compatibility on Docker-backed candidates. Optional first-party provider certification requires a provider/version/topology choice.

**Not claimed:** Automatic support for every vendor/version; built-in router integrations; Kubernetes/non-Docker deployments; Compose; provider-specific production certification; durable restart recovery.

## Local Worktree Overlay

- `.gitignore` has a user edit removing `notes/`; do not change it or stage notes.
- Phase-01/02/03 project changes are committed and pushed in `511c0d8`; the successful remote CI run covers them.
- `.gitignore` remains a local edit and private `notes/` remain untracked and excluded from the commit. No application changes remain unstaged other than that local ignore edit.
- `package-lock.json` root engine range now matches `package.json`: `^20.19.0 || >=22.12.0`.

## npm Release Readiness

- Package metadata now points to the actual GitHub repository; README badges and CONTRIBUTING URLs are corrected; author/license placeholders are removed; the changelog identifies `0.0.1` as the initial release.
- Local `npm run prepublishOnly` passed: 164 passed, 1 opt-in Docker test skipped, 0 failed/cancelled. `npm publish --dry-run --ignore-scripts --access public` succeeded with 17 files / 36.7 KB.
- Package is prepared but not published. `npm view update-pilot` returned 404 before prep; name availability and account permission are not guaranteed. Dry-run warned that the current terminal is not logged in. Actual publish requires npm authentication or the release workflow's `NPM_TOKEN` secret and a `v*` tag.
