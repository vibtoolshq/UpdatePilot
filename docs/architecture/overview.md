# Architecture and execution flow

UpdatePilot is an embedded Node.js library with an orchestration core, dedicated service adapters, an injected traffic-router boundary, hooks, logging, and typed errors. It exposes no HTTP endpoints itself. The application decides who may call its methods and how it persists deployment state.

```mermaid
flowchart LR
  A[Application admin action] --> E[UpdatePilot engine]
  E --> G[GitHubAdapter]
  G --> R[GitHub Releases API and file cache]
  E --> D[DockerAdapter]
  D --> C[Docker Engine]
  E --> T[Injected TrafficRouter]
  E --> H[HealthAdapter]
  T --> P[Candidate-only probe endpoint]
  H --> P
  E --> B[HookBus and Logger]
```

## Lifecycle

```mermaid
flowchart TD
  Start[runUpdate] --> Check[GitHub release check]
  Check --> Available{New eligible release or force?}
  Available -->|No| Current[Return up-to-date]
  Available -->|Yes| Dry{dryRun?}
  Dry -->|Yes| Planned[Return dry-run]
  Dry -->|No| Pending{Pending recovery?}
  Pending -->|Yes| Fail[Throw RollbackError]
  Pending -->|No| Deploy[Pull and start Docker candidate]
  Deploy --> Prepare[Router prepare; keep old route]
  Prepare --> Health[Probe candidate-only health URL]
  Health -->|Healthy| Switch[Switch live route]
  Switch --> Finalize[Finalize Docker candidate]
  Finalize --> Done[Return updated]
  Prepare -->|Failure| Restore[Router rollback then Docker rollback]
  Health -->|Unhealthy, rollback enabled| Restore
  Switch -->|Failure| Restore
  Restore --> Recovered{Recovery succeeded?}
  Recovered -->|Health failure| Rolled[Return rolled-back]
  Recovered -->|Other failure| Error[Throw original wrapped error]
  Recovered -->|No| Critical[Critical rollback failure]
```

This diagram describes the normal recovery path. When `rollback.enabled=false`, a health failure attempts router cleanup and throws without automatic Docker rollback. Other unexpected failures may also require operator recovery.

### Stage details

1. Resolve and deeply freeze config via `defineConfig`.
2. Lazily create GitHub, Docker, and health adapters as needed.
3. Compare latest eligible GitHub release against configured version; `checkOnly` ends here.
4. For a qualifying `runUpdate`, reject any pending unresolved rollback, then launch a Docker candidate while the old container is retained.
5. Build `TrafficRouterDeployment` and call `prepare()`; validate absolute HTTP(S) candidate URL, distinct from live URL when the router is injected.
6. Probe that **candidate** with retry/timeout policy and `beforeVerify` / `afterVerify` hooks.
7. Only after health success call `switch()`; then `finalize()` Docker state and return `updated`.
8. On prepare/switch failure, route rollback precedes Docker rollback; on health failure, follow the configured auto-rollback policy.

## Trust boundaries

- Root config knows repo, image, socket, health URL; no repository-owned admin authentication.
- GitHub adapter holds optional API token and caches results in a local file.
- Docker socket access provides powerful host privileges; isolate credentials and limit who may trigger updates.
- Router implementation is external: a syntactically distinct health URL alone does **not** certify that it points to a candidate container.
- Hooks are best effort; failures don't block lifecycle. Error serialization is not automatically safe for public clients.
- Recovery context and last results live in **one process**; durable transactions and multi-process locks are not implemented.

Read [Internal systems](internals.md), [Router integration](../guides/integration.md), and [Exceptions](../api/errors.md).