# CI, packaging and release process

## Source configuration

`.github/workflows/ci.yml` runs on `main` push, PR, workflow dispatch and reusable-workflow invocation. Jobs exercise Node `20.19.0`, `22.12.0`, `26.12.0`, plus package compatibility, Express example smoke and disposable Docker candidate cleanup. The test job also runs `npm audit --audit-level=high`. `.github/workflows/codeql.yml` provides code scanning; check the workflow for its actual scheduled/trigger policy.

`.github/workflows/release.yml` triggers on `v*` tag pushes and runs `npm ci` followed by `npm publish --access public` on Node `26.12.0` with `NODE_AUTH_TOKEN` from the repository's `NPM_TOKEN` secret. **Pushing a matching tag may initiate an actual publish.** Do not tag or release during docs-only maintenance.

## Package allowlist

`package.json#files` includes `src`, `testing`, `README.md`, `LICENSE`, and `CHANGELOG.md`. The npm package smoke verifies that private notes, tests, CI, and scripts are not shipped. The `docs/` tree is intended for repository developer documentation, **not** included in the declared npm package files list.

## Pre-publish gate

```sh
npm run prepublishOnly
npm publish --dry-run --ignore-scripts --access public
```

The first command explicitly invokes the package's combined test/type/tarball-smoke gate. The second inspects the would-be package without actually publishing. This does not prove npm account authorization or package name availability. An actual release requires versioning, changelog review, approved tag, npm credentials/rights and CI green status. No current npm publication is implied by the presence of the workflow.

## Git and sync verification

After an approved documentation commit, compare `git rev-parse HEAD`, `git status --short --branch`, and `git ls-remote origin refs/heads/main`. A clean working tree and matching local/remote commit prove Git source sync at that point, not production deployment or npm publication.

See [Contributing](contributing.md), [Testing](testing.md), and [Compatibility](../reference/compatibility.md).