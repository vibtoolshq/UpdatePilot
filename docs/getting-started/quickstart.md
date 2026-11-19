---
title: "Quickstart"
description: "Minimal release check and safe dry-run example."
order: 2
---

# Quickstart: safe release check and a deployment dry run

This example is **executable with locally injected fake I/O**; it never calls GitHub or Docker. For live updates you must supply a real router provider and reachable infrastructure (see [integration](../guides/integration.md)). The configuration itself is validated by the package.

Create `quickstart.mjs` in a project with `update-pilot` installed:

```js
import { UpdatePilot } from "update-pilot";

const config = {
  repo: "example/app",
  currentVersion: "1.0.0",
  docker: { image: "ghcr.io/example/app" },
  health: { url: "http://127.0.0.1:3000/health" },
  logger: { level: "silent" }
};

const pilot = new UpdatePilot(config, {
  githubAdapter: {
    async check() {
      return {
        updateAvailable: true,
        currentVersion: "1.0.0",
        currentVersionRaw: "1.0.0",
        latestVersion: "1.1.0",
        latestVersionRaw: "v1.1.0",
        releaseUrl: null,
        releaseNotes: null,
        publishedAt: null,
        isPrerelease: false,
        fromCache: false,
        rateLimit: null
      };
    }
  }
});

console.log((await pilot.checkOnly()).latestVersion);
console.log((await pilot.runUpdate({ dryRun: true })).status);
console.log(pilot.getStatus().running);
```

Run `node quickstart.mjs`. Expected output:

```text
1.1.0
dry-run
false
```

`checkOnly()` performs release discovery only. `runUpdate({ dryRun: true })` stops before Docker/health/router operations when an update is available. `force: true` is **not** a dry-run flag and must not be used to test a live environment casually.

## Next steps

- [Engine API and result variants](../api/engine.md)
- [All configuration keys/defaults](../guides/configuration.md)
- [Production router requirements](../guides/integration.md)
- [Local Express example](../guides/integration.md#existing-express-example)

**Security:** do not copy a sample admin route without authentication and authorization. Package operations can pull images and change running containers.