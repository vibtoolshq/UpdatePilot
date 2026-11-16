import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, RateLimitError } from "../src/utils/errors.js";
import { retry } from "../src/utils/retry.js";

test("returns a successful first attempt without retrying", async () => {
  let calls = 0;
  const result = await retry(() => {
    calls += 1;
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("succeeds after two failures", async () => {
  let calls = 0;
  const result = await retry(
    () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary");
      return "recovered";
    },
    { retries: 3, baseDelay: 10, jitter: false },
  );

  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("throws the last error after exhausting attempts", async () => {
  const failure = new Error("still unavailable");
  let calls = 0;

  await assert.rejects(
    retry(
      () => {
        calls += 1;
        throw failure;
      },
      { retries: 3, baseDelay: 10, jitter: false },
    ),
    (error) => error === failure,
  );
  assert.equal(calls, 3);
});

test("does not retry when shouldRetry returns false", async () => {
  let calls = 0;

  await assert.rejects(
    retry(
      () => {
        calls += 1;
        throw new Error("permanent");
      },
      { retries: 4, shouldRetry: () => false, baseDelay: 10 },
    ),
    /permanent/,
  );
  assert.equal(calls, 1);
});

test("does not retry configuration and rate-limit UpdatePilot errors", async () => {
  for (const error of [
    new ConfigError("invalid"),
    new RateLimitError("limited"),
  ]) {
    await assert.rejects(
      retry(
        () => {
          throw error;
        },
        { retries: 3, baseDelay: 10 },
      ),
      (value) => value === error,
    );
  }
});
