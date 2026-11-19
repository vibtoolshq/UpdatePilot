# Contributing and maintaining UpdatePilot

The repository establishes its contribution policy in `CONTRIBUTING.md`, development/phase rules in `AGENTS.md`, and JavaScript style in `.editorconfig`, `eslint.config.js` and `jsconfig.json`. The package is MIT licensed.

## Verified source workflow

```sh
git clone https://github.com/vibtoolshq/UpdatePilot.git
cd UpdatePilot
npm ci
npm ci --prefix examples/basic-express
npm test
npm run lint
```

For public API/type work also run `npm run test:types` and `npm run test:package`. Preserve the distinction between runtime exports (`src/index.js`), package subpaths (`package.json#exports`), type declarations (`src/types/index.d.ts`), and internal helpers.

The existing `CONTRIBUTING.md` requests Conventional Commits, a PR description with test results, relevant README/JSDoc updates for API changes, and provider-specific rollback design detail for adapter work. `AGENTS.md` requests an approved, recorded scope/verification plan and private phase notes before source modifications. GitHub workflows enforce tests, lint, type smoke, audit and package smoke on configured triggers.

## Architecture maintenance checklist

- For a new runtime export: update `src/index.js`, public declarations, package export mapping if a new subpath, tests, and docs.
- For router providers: implement real candidate-only reachability assertions and run [conformance helper](../api/router-contract-tests.md).
- For error or config changes: align validator behavior, types, tests, API examples and migration notes.
- For deployment work: explicitly describe route-switch order, failure cleanup, rollback durability and any change to old-container retention.
- For documentation-only work: audit the source, keep examples importable, and avoid claiming unsupported capabilities.

**Known external documentation mismatch:** some repository-level `CONTRIBUTING.md` and package metadata links still reference a prior GitHub owner, and `CONTRIBUTING.md` includes an illustrative shared adapter contract not matching the actual engine's three injected adapter interfaces. Those files were not altered under the current `docs/` scope. Use [API index](../api/index.md) as the current canonical contract.