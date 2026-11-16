import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { GitHubAdapter } from "../src/adapters/github.js";
import { GitHubError, RateLimitError } from "../src/utils/errors.js";

const tempDirs = [];
let tempRoot;
before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "update-pilot-tests-"));
});
after(async () =>
  Promise.all(
    [tempRoot, ...tempDirs].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  ),
);

async function cachePath() {
  const directory = await mkdtemp(join(tmpdir(), "update-pilot-"));
  tempDirs.push(directory);
  return join(directory, "releases.json");
}

function release(tag, options = {}) {
  return {
    tag_name: tag,
    prerelease: options.prerelease ?? false,
    draft: false,
    published_at: options.published_at ?? "2025-01-01T00:00:00Z",
    html_url: `https://github.com/org/app/releases/tag/${tag}`,
    body: `Notes for ${tag}`,
  };
}

/** @param {unknown} data @param {{ status?: number, headers?: Record<string, string | number>, jsonError?: Error }} [options] */
function fakeResponse(data, { status = 200, headers = {}, jsonError } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      String(value),
    ]),
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => normalizedHeaders[name.toLowerCase()] ?? null },
    json: async () => {
      if (jsonError) throw jsonError;
      return data;
    },
  };
}

function adapterOptions(fetchImpl, options = {}) {
  return {
    repo: "org/app",
    currentVersion: "1.2.3",
    cacheFile: join(tempRoot, `${randomUUID()}.json`),
    fetchImpl,
    ...options,
  };
}

test("check reports no update when the latest release equals current", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([release("v1.2.3")])),
  );
  const result = await adapter.check();
  assert.equal(result.updateAvailable, false);
  assert.equal(result.latestVersion, "1.2.3");
});

test("check reports a newer release", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([release("v1.3.0")])),
  );
  assert.equal((await adapter.check()).updateAvailable, true);
});

test("check normalizes v-prefixed current and release versions", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([release("v1.3.0")]), {
      currentVersion: "v1.2.3",
    }),
  );
  const result = await adapter.check();
  assert.equal(result.currentVersion, "1.2.3");
  assert.equal(result.currentVersionRaw, "v1.2.3");
  assert.equal(result.latestVersion, "1.3.0");
});

test("check excludes prereleases by default", async () => {
  const releases = [
    release("v2.0.0-beta.1", {
      prerelease: true,
      published_at: "2025-02-01T00:00:00Z",
    }),
    release("v1.5.0"),
  ];
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse(releases)),
  );
  assert.equal((await adapter.check()).latestVersion, "1.5.0");
});

test("check includes prereleases when enabled", async () => {
  const releases = [
    release("v2.0.0-beta.1", {
      prerelease: true,
      published_at: "2025-02-01T00:00:00Z",
    }),
    release("v1.5.0"),
  ];
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse(releases), {
      includePrerelease: true,
    }),
  );
  const result = await adapter.check();
  assert.equal(result.latestVersion, "2.0.0-beta.1");
  assert.equal(result.isPrerelease, true);
});

test("check preserves SHA release tags as the selected deployment identity", async () => {
  const tag = "abcdef1234567";
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([release(tag)]), {
      currentVersion: "0123456789abcde",
    }),
  );
  const result = await adapter.check();

  assert.equal(result.updateAvailable, true);
  assert.equal(result.latestVersion, tag);
  assert.equal(result.latestVersionRaw, tag);
});

test("check parses rate limit headers", async () => {
  const fetchImpl = async () =>
    fakeResponse([release("v1.3.0")], {
      headers: {
        "x-ratelimit-remaining": 42,
        "x-ratelimit-limit": 60,
        "x-ratelimit-reset": 1_735_689_600,
      },
    });
  const result = await new GitHubAdapter(adapterOptions(fetchImpl)).check();
  assert.deepEqual(result.rateLimit, {
    remaining: 42,
    limit: 60,
    resetAt: "2025-01-01T00:00:00.000Z",
  });
});

test("check throws RateLimitError when remaining quota is zero", async () => {
  const fetchImpl = async () =>
    fakeResponse([], {
      status: 403,
      headers: {
        "x-ratelimit-remaining": 0,
        "x-ratelimit-reset": 1_735_689_600,
      },
    });
  await assert.rejects(
    new GitHubAdapter(adapterOptions(fetchImpl)).check(),
    (error) =>
      error instanceof RateLimitError &&
      error.context.resetAt === "2025-01-01T00:00:00.000Z",
  );
});

test("check throws GitHubError for a missing repository", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([], { status: 404 })),
  );
  await assert.rejects(
    adapter.check(),
    (error) =>
      error instanceof GitHubError &&
      error.context.status === 404 &&
      error.message.includes("org/app not found or has no releases"),
  );
});

test("check throws GitHubError for authentication failures", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([], { status: 401 }), {
      token: "token",
    }),
  );
  await assert.rejects(
    adapter.check(),
    (error) =>
      error instanceof GitHubError &&
      error.message === "GitHub authentication failed — check your token",
  );
});

test("check wraps malformed JSON as GitHubError", async () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () =>
      fakeResponse(null, { jsonError: new SyntaxError("bad json") }),
    ),
  );
  await assert.rejects(
    adapter.check(),
    (error) =>
      error instanceof GitHubError &&
      error.message === "Invalid JSON response from GitHub" &&
      error.cause instanceof SyntaxError,
  );
});

test("second check reads a valid disk cache", async () => {
  const file = await cachePath();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse([release("v1.3.0")]);
  };
  const adapter = new GitHubAdapter(
    adapterOptions(fetchImpl, { cacheFile: file }),
  );
  assert.equal((await adapter.check()).fromCache, false);
  assert.equal((await adapter.check()).fromCache, true);
  assert.equal(calls, 1);
});

test("cacheTTL zero forces a fresh request", async () => {
  const file = await cachePath();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse([release("v1.3.0")]);
  };
  const adapter = new GitHubAdapter(
    adapterOptions(fetchImpl, { cacheFile: file, cacheTTL: 0 }),
  );
  await adapter.check();
  await adapter.check();
  assert.equal(calls, 2);
});

test("clearCache removes an existing cache and reports the result", async () => {
  const file = await cachePath();
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([release("v1.3.0")]), {
      cacheFile: file,
    }),
  );
  await adapter.check();
  assert.equal(await adapter.clearCache(), true);
  assert.equal(await adapter.clearCache(), false);
});

test("private version comparison uses numeric core components", () => {
  const adapter = new GitHubAdapter(
    adapterOptions(async () => fakeResponse([])),
  );
  assert.equal(adapter._compareVersions("1.2.3", "1.2.10"), -1);
  assert.equal(adapter._compareVersions("1.2.10", "1.2.3"), 1);
});

test("constructor rejects malformed repository names", () => {
  assert.throws(
    () =>
      new GitHubAdapter(
        adapterOptions(async () => fakeResponse([]), { repo: "org/app/extra" }),
      ),
    GitHubError,
  );
});
