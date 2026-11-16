# Contributing to UpdatePilot

Thanks for considering a contribution to UpdatePilot. Your bug reports,
implementation work, and documentation improvements help make safe
self-hosted updates useful to more Node.js projects.

## Code of Conduct

We aim to keep participation respectful and welcoming to everyone.
Contributors are expected to follow the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
The community's shared standards apply to project spaces and discussions.

## How Can I Contribute?

### 🐛 Reporting Bugs

Use the [GitHub issue tracker](https://github.com/mdnajmul729080/UpdatePilot/issues).
Include the Node.js version, deployment setup, steps to reproduce, and the
behavior you expected. Remove secrets and private infrastructure details
before submitting logs or configuration.

### 💡 Suggesting Features

Open a [GitHub issue](https://github.com/mdnajmul729080/UpdatePilot/issues/new)
to describe the use case and the problem the feature would solve. Adapter
proposals should explain how they fit the existing adapter contract.

### 📝 Improving Docs

Documentation updates are welcome, including clearer configuration guidance,
examples, and corrections to behavior descriptions. Keep examples consistent
with the public API and note when a capability is planned rather than
implemented.

### 🔌 Writing a New Adapter

An adapter should implement `check()`, `deploy()`, and `rollback()` so the
engine can use it for release discovery and deployment recovery. See the
[architecture guide](./docs/ARCHITECTURE.md) for the contract and lifecycle.

## Development Setup

Clone the repository and run the test suite with Node.js `^20.19.0 || >=22.12.0`:

```bash
git clone https://github.com/mdnajmul729080/UpdatePilot.git
cd update-pilot
npm install
npm test
```

Keep changes focused. Before opening a pull request, run the tests and include
any relevant configuration or reproduction details in the description.

## Project Structure

```text
src/
  core/       Update orchestration, configuration, and lifecycle hooks
  adapters/   Integrations for releases, Docker, and health checks
  utils/      Shared logging, retry, and error utilities
test/         Automated tests
examples/     Sample application configuration and integrations
```

The engine and configuration live in `src/core`; external systems are kept
behind `src/adapters`. Shared helpers belong in `src/utils`, while tests and
copyable integration examples remain in their own top-level directories.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
messages. Choose the prefix that best describes the change:

| Prefix      | Use                                                        |
| ----------- | ---------------------------------------------------------- |
| `feat:`     | Add a user-visible capability.                             |
| `fix:`      | Correct a defect or unintended behavior.                   |
| `docs:`     | Change documentation or examples.                          |
| `test:`     | Add or update automated tests.                             |
| `chore:`    | Perform maintenance that does not change product behavior. |
| `refactor:` | Restructure code without changing its external behavior.   |

For example, `docs: clarify rollback configuration` describes a documentation
change, while `fix: preserve the old container during verification` describes
a behavior correction.

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] Code documented with JSDoc
- [ ] README updated if public API changed
- [ ] Commit messages follow Conventional Commits

In the pull request description, summarize the change and include test
results. For adapter work, describe how the implementation handles failed
deployment and rollback.

## Adapter Authoring Guide

Adapters implement a small asynchronous contract so the update engine can
coordinate release discovery, deployment, and recovery without depending on
one concrete provider. Methods should return the documented result shapes:

```js
export class MyAdapter {
  async check(currentVersion) {
    /* returns { updateAvailable, version } */
  }
  async deploy(version) {
    /* returns { success } */
  }
  async rollback(version) {
    /* returns { success } */
  }
}
```

Keep provider-specific details inside the adapter. The engine should be able
to decide what happens next from the method results, and rollback should
restore the prior working version when deployment verification fails. See
the [architecture guide](./docs/ARCHITECTURE.md) for lifecycle context.
