# npm Release Readiness Plan

## Goal

Prepare `update-pilot@0.0.1` for a first public npm release and a clean consumer `npm install`, without publishing or pushing this release-preparation change.

## Baseline Findings

- `npm view update-pilot` returned registry 404 (the name is not currently visible there; this does not guarantee npm will accept publication).
- `package.json` contains placeholder repository, bugs, homepage, and author metadata.
- README badges and CONTRIBUTING links still point at `YOUR_ORG/update-pilot`; quick-start `YOUR_ORG/YOUR_APP` values are generic consumer configuration examples and should remain placeholders.
- LICENSE copyright still says `Your Name`.
- `package-lock.json` root Node engine says `>=20`, while `package.json` says `^20.19.0 || >=22.12.0`.
- The package allowlist and fresh-install ESM/CommonJS/TypeScript smoke already exist. Release workflow publishes on `v*` tags using `NPM_TOKEN`; do not trigger it here.

## Scope Lock

- Allowed files: `package.json`, `package-lock.json`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `CHANGELOG.md`, and private release notes under `notes/`.
- Do not change runtime source, tests, package dependencies, release/CI workflows, UI, or example behavior.
- Use the actual public repository `mdnajmul729080/UpdatePilot` in repository-specific metadata and links. Keep the generic quick-start app/repository/image examples as user-editable placeholders.
- Replace the author placeholder with the public repository owner handle; no email or private identity is to be added.
- Do not run `npm publish` without `--dry-run`; do not commit, tag, or push this phase.

## Steps

1. Correct package links/author and repository-specific documentation links; replace the LICENSE placeholder with the public repository owner handle.
2. Mark the existing initial version `0.0.1` in CHANGELOG without inventing features beyond the current Unreleased section.
3. Regenerate only lockfile root metadata so the supported Node range matches `package.json`.
4. Run `npm run prepublishOnly` once, then run one `npm publish --dry-run --ignore-scripts --access public` check to inspect the publish artifact without rerunning lifecycle tests.
5. Record exact package file list/size, checks, and any remaining npm account/name availability caveat.

## Acceptance Criteria

- No `YOUR_ORG` or `Your Name` placeholders remain in package identity links, author metadata, license holder, badges, or contributor links; generic consumer setup examples remain intentionally generic.
- `package-lock.json` root name/version/license/engine metadata agrees with `package.json`.
- Fresh consumer install smoke and TypeScript provider scenario compile continue to pass; npm publish dry-run succeeds and contains only the intended package allowlist, excluding tests, private notes, CI, and local files.
- No package dependency, runtime/API, UI, CI workflow, or release automation behavior changes; no actual publication, tag, commit, or push occurs.

## Completion

- `package.json` now uses the real GitHub repository, issue tracker, homepage, and repository owner as author; the root lockfile Node engine range matches `package.json`.
- README project badges point at the npm package and actual GitHub repo; CONTRIBUTING links and Node support range are corrected; the LICENSE placeholder is replaced; CHANGELOG records the existing initial version `0.0.1`.
- Kept generic `YOUR_ORG/YOUR_APP` values in quick-start configuration examples because those are consumer-owned values, not project metadata.
- `npm run prepublishOnly` passed: 164 tests, 1 opt-in Docker skip, 0 failures/cancellations; workspace types, fresh tarball type scenario, and ESM/CommonJS smoke passed (17 files / 36 KB).
- `npm publish --dry-run --ignore-scripts --access public` succeeded and reported `update-pilot@0.0.1`, 17 files, 36.7 KB compressed. npm warned that the current session is not logged in; no actual publish was attempted and registry permissions are not verified.
- `npm run lint`, `git diff --check`, and touched-file diagnostics passed. Dependencies did not change; audit was not rerun.
- `npm view update-pilot` returned 404 before edits. This indicates no publicly readable package was found at lookup time but does not guarantee npm will accept the name or that the current account has publish rights.
- No tag, commit, push, dependency, runtime, UI, or CI workflow change was made for this release-preparation task.
