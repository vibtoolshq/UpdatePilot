import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createLogger, silentLogger } from "../src/utils/logger.js";

function captureStream() {
  const stream = new PassThrough();
  let output = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    output += chunk;
  });
  return { stream, read: () => output };
}

test("level filtering hides messages below the configured level", () => {
  const captured = captureStream();
  const logger = createLogger({ level: "warn", stream: captured.stream });

  logger.info("hidden");
  logger.warn("visible");

  assert.equal(captured.read().includes("hidden"), false);
  assert.equal(captured.read().includes("visible"), true);
});

test("silent level suppresses all logger output including child loggers", () => {
  const captured = captureStream();
  const logger = createLogger({ level: "silent", stream: captured.stream });

  logger.error("error");
  logger.warn("warning");
  logger.info("info");
  logger.debug("debug");
  logger.child({ requestId: "abc" }).error("child error");

  assert.equal(captured.read(), "");
});

test("JSON mode emits valid JSON lines with structured fields", () => {
  const captured = captureStream();
  const logger = createLogger({
    level: "info",
    pretty: false,
    stream: captured.stream,
  });

  logger.info("release found", { version: "1.2.3" });
  const entry = JSON.parse(captured.read().trim());

  assert.equal(entry.level, "info");
  assert.equal(entry.message, "release found");
  assert.equal(entry.version, "1.2.3");
  assert.ok(entry.time);
});

test("redacts sensitive keys recursively", () => {
  const captured = captureStream();
  const logger = createLogger({ pretty: false, stream: captured.stream });

  logger.info("credentials", {
    token: "secret",
    nested: { authorization: "bearer", ok: true },
  });
  const entry = JSON.parse(captured.read().trim());

  assert.equal(entry.token, "***");
  assert.equal(entry.nested.authorization, "***");
  assert.equal(entry.nested.ok, true);
});

test("child logger merges bindings into metadata", () => {
  const captured = captureStream();
  const logger = createLogger({ pretty: false, stream: captured.stream });

  logger.child({ requestId: "abc" }).info("started", { version: "1.2.3" });
  const entry = JSON.parse(captured.read().trim());

  assert.equal(entry.requestId, "abc");
  assert.equal(entry.version, "1.2.3");
});

test("silentLogger accepts calls without output or failure", () => {
  assert.doesNotThrow(() => silentLogger.info("ignored"));
  assert.equal(silentLogger.child({}).error, silentLogger.error);
});
