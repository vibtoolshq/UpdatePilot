---
title: "Installation and Requirements"
description: "Supported Node.js versions, npm installation, and deployment prerequisites."
order: 1
---

# Installation and requirements

This is an npm-distributed ESM package with Node's supported synchronous CommonJS interop. `package.json` declares `"node": "^20.19.0 || >=22.12.0"`, and package name `update-pilot` at version `0.0.1`. Node 21 and Node 22 versions below 22.12 are **not** declared supported. The installed package is an embedded library; no CLI command, resident daemon, hosted control plane, or standalone dashboard is installed.

## Application installation

```sh
npm install update-pilot
```

This is the declared package name; confirm that your intended version is published and accessible on your npm registry before relying on this command. A local source checkout can be prepared with:

```sh
git clone https://github.com/vibtoolshq/UpdatePilot.git
cd UpdatePilot
npm ci
npm ci --prefix examples/basic-express
npm test
```

`npm ci` expects the checked-in `package-lock.json`. `npm run test:types` uses `npx` and pins TypeScript 5.9.3; `npm run test:package` performs a temporary tarball install. See [testing](../development/testing.md). The package depends on `dockerode@4.0.11` and `dockerode-compose@^1.4.0`, although Compose deployment is disabled.

## Deployment prerequisites

For built-in deployment, a reachable Docker Engine, permission to its API/socket, a pullable container image with version-matching tags, the existing container's recognized name, an HTTP(S) readiness endpoint, and an **application-supplied trafficRouter** are required. The default Docker socket path is `/var/run/docker.sock`; on Windows development hosts or alternate Docker configurations inject a suitable Docker client or configure another socket, and independently validate actual host compatibility.

GitHub Release checks need access to GitHub's API and optional `github.token` for private/authenticated access. Treat the token as a secret; never place it in source or logs.

## Import options

```js
import { UpdatePilot, defineConfig } from "update-pilot";
import { GitHubAdapter } from "update-pilot/adapters/github";
```

The root import additionally exports the same adapter class. `require("update-pilot")` relies on supported Node synchronous ESM interop; ESM is preferred. There is no declared `bin` command. Uninstall with `npm uninstall update-pilot` from the consumer project. Review [compatibility](../reference/compatibility.md) before production use.