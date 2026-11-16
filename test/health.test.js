import assert from "node:assert/strict";
import { test } from "node:test";
import { HealthAdapter } from "../src/adapters/health.js";
import { HealthCheckError } from "../src/utils/errors.js";

const noSleep = async () => {};

/** @param {(number | Error | "hang")[]} sequence @param {(url: string, options: any) => void} [onCall] */
function makeFakeFetch(sequence, onCall = () => {}) {
  let index = 0;
  return async (url, options) => {
    onCall(url, options);
    const next = sequence[Math.min(index++, sequence.length - 1)];
    if (next instanceof Error) throw next;
    if (next === "hang")
      return new Promise((resolve, reject) => {
        const safetyTimeout = setTimeout(() => {
          options.signal.removeEventListener("abort", onAbort);
          reject(new Error("fake fetch did not receive its abort signal"));
        }, 2_000);
        const onAbort = () => {
          clearTimeout(safetyTimeout);
          options.signal.removeEventListener("abort", onAbort);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        if (options.signal.aborted) onAbort();
      });
    return { status: next, ok: next >= 200 && next < 300 };
  };
}

function makeAdapter(sequence, options = {}) {
  return new HealthAdapter({
    url: "http://localhost/health",
    fetchImpl: makeFakeFetch(sequence),
    sleepImpl: noSleep,
    ...options,
  });
}

test("single success reports a healthy result", async () => {
  const result = await makeAdapter([200]).check();
  assert.equal(result.healthy, true);
  assert.equal(result.status, 200);
  assert.equal(result.attempts, 1);
  assert.equal(result.url, "http://localhost/health");
});

test("check can target a provider-supplied candidate health URL", async () => {
  let requestedUrl;
  const adapter = new HealthAdapter({
    url: "http://localhost/health",
    fetchImpl: makeFakeFetch([200], (url) => {
      requestedUrl = url;
    }),
    sleepImpl: noSleep,
  });

  const result = await adapter.check({
    url: "http://127.0.0.1:49152/ready",
  });

  assert.equal(requestedUrl, "http://127.0.0.1:49152/ready");
  assert.equal(result.url, "http://127.0.0.1:49152/ready");
  assert.equal(adapter.url, "http://localhost/health");
});

test("failed candidate checks report the candidate URL in error context", async () => {
  const candidateUrl = "http://127.0.0.1:49152/ready";
  const adapter = new HealthAdapter({
    url: "http://localhost/health",
    retries: 1,
    fetchImpl: makeFakeFetch([500]),
    sleepImpl: noSleep,
  });

  await assert.rejects(
    adapter.check({ url: candidateUrl }),
    (error) =>
      error instanceof HealthCheckError && error.context.url === candidateUrl,
  );
});

test("check succeeds on its third attempt", async () => {
  const result = await makeAdapter([500, 500, 200]).check();
  assert.equal(result.attempts, 3);
  assert.equal(result.healthy, true);
});

test("all failures include the final status and attempt count", async () => {
  await assert.rejects(
    makeAdapter([500], { retries: 3 }).check(),
    (error) =>
      error instanceof HealthCheckError &&
      error.context.lastStatus === 500 &&
      error.context.attempts === 3 &&
      error.context.lastReason === "status",
  );
});

test("timed-out fetches fail with timeout reason", async () => {
  await assert.rejects(
    makeAdapter(["hang"], { timeout: 100, retries: 1 }).check(),
    (error) =>
      error instanceof HealthCheckError &&
      error.context.lastReason === "timeout",
  );
});

test("network failures are reported with network reason", async () => {
  await assert.rejects(
    makeAdapter([new Error("ECONNREFUSED")], { retries: 1 }).check(),
    (error) =>
      error instanceof HealthCheckError &&
      error.context.lastReason === "network" &&
      error.cause instanceof Error &&
      error.cause.message === "ECONNREFUSED",
  );
});

test("unexpected status is unhealthy", async () => {
  await assert.rejects(
    makeAdapter([204], { retries: 1 }).check(),
    (error) =>
      error instanceof HealthCheckError && error.context.lastStatus === 204,
  );
});

test("configured status 204 is accepted", async () => {
  const result = await makeAdapter([204], { expectStatus: 204 }).check();
  assert.equal(result.healthy, true);
  assert.equal(result.status, 204);
});

test("custom headers are sent to fetch", async () => {
  let captured = /** @type {any} */ ({});
  const fetchImpl = makeFakeFetch([200], (_url, options) => {
    captured = options;
  });
  await new HealthAdapter({
    url: "http://localhost/health",
    headers: { authorization: "Bearer token" },
    fetchImpl,
    sleepImpl: noSleep,
  }).check();
  assert.equal(captured.headers.authorization, "Bearer token");
});

test("requests use manual redirect handling", async () => {
  let captured = /** @type {any} */ ({});
  const fetchImpl = makeFakeFetch([200], (_url, options) => {
    captured = options;
  });
  await new HealthAdapter({
    url: "http://localhost/health",
    fetchImpl,
    sleepImpl: noSleep,
  }).check();
  assert.equal(captured.redirect, "manual");
});

test("checkOnce succeeds after exactly one attempt", async () => {
  let calls = 0;
  const fetchImpl = makeFakeFetch([500, 200], () => {
    calls += 1;
  });
  const adapter = new HealthAdapter({
    url: "http://localhost/health",
    retries: 5,
    fetchImpl,
    sleepImpl: noSleep,
  });
  await assert.rejects(adapter.checkOnce(), HealthCheckError);
  assert.equal(calls, 1);
});

test("checkOnce returns one attempt on success", async () => {
  const result = await makeAdapter([200]).checkOnce();
  assert.equal(result.attempts, 1);
});

test("constructor rejects invalid and non-HTTP URLs", () => {
  for (const url of ["not-a-url", "ftp://x.com", ""])
    assert.throws(
      () => makeAdapter([200], { url }),
      (error) =>
        error instanceof HealthCheckError && error.context.field === "url",
    );
});

test("constructor rejects out-of-range retry counts", () => {
  for (const retries of [0, 31, 1.5])
    assert.throws(() => makeAdapter([200], { retries }), HealthCheckError);
});

test("constructor rejects out-of-range timeouts", () => {
  for (const timeout of [50, 61_000])
    assert.throws(() => makeAdapter([200], { timeout }), HealthCheckError);
});

test("external abort during retry sleep rejects as caller cancellation", async () => {
  const controller = new AbortController();
  const sleepImpl = async () => controller.abort();
  await assert.rejects(
    makeAdapter([500], { retries: 3, sleepImpl }).check({
      signal: controller.signal,
    }),
    (error) =>
      error instanceof HealthCheckError && error.message.includes("aborted"),
  );
});

test("non-200 expected success code is accepted", async () => {
  const result = await makeAdapter([204], { expectStatus: 204 }).check();
  assert.equal(result.healthy, true);
  assert.equal(result.status, 204);
});

test("logger receives one debug entry for each failed attempt", async () => {
  const calls = { debug: 0 };
  const logger = {
    debug: () => {
      calls.debug += 1;
    },
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  await assert.rejects(
    makeAdapter([500], { retries: 3, logger }).check(),
    HealthCheckError,
  );
  assert.equal(calls.debug, 3);
});
