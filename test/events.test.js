import assert from "node:assert/strict";
import { test } from "node:test";
import { HookBus, HOOKS } from "../src/core/events.js";
import { ConfigError } from "../src/utils/errors.js";

test("on and emit invoke handlers sequentially and return results", async () => {
  const bus = new HookBus();
  const order = [];
  bus.on(HOOKS.BEFORE_DEPLOY, async () => {
    order.push("first");
    return 1;
  });
  bus.on(HOOKS.BEFORE_DEPLOY, () => {
    order.push("second");
    return 2;
  });

  const results = await bus.emit(HOOKS.BEFORE_DEPLOY, {});

  assert.deepEqual(order, ["first", "second"]);
  assert.deepEqual(results, [1, 2]);
});

test("once removes its handler after the first emission", async () => {
  const bus = new HookBus();
  let calls = 0;
  bus.once(HOOKS.AFTER_CHECK, () => {
    calls += 1;
  });

  await bus.emit(HOOKS.AFTER_CHECK, {});
  await bus.emit(HOOKS.AFTER_CHECK, {});

  assert.equal(calls, 1);
  assert.equal(bus.listenerCount(HOOKS.AFTER_CHECK), 0);
});

test("off removes a registered handler", async () => {
  const bus = new HookBus();
  let calls = 0;
  const handler = () => {
    calls += 1;
  };
  bus.on(HOOKS.AFTER_DEPLOY, handler).off(HOOKS.AFTER_DEPLOY, handler);

  await bus.emit(HOOKS.AFTER_DEPLOY, {});

  assert.equal(calls, 0);
});

test("emitSafe returns successful results and collects handler errors", async () => {
  const bus = new HookBus();
  const failure = new Error("hook failed");
  bus.on(HOOKS.ON_ERROR, () => "ok");
  bus.on(HOOKS.ON_ERROR, () => {
    throw failure;
  });
  bus.on(HOOKS.ON_ERROR, async () => "also ok");

  const result = await bus.emitSafe(HOOKS.ON_ERROR, failure);

  assert.deepEqual(result.results, ["ok", "also ok"]);
  assert.deepEqual(result.errors, [failure]);
});

test("on rejects event names that are not in HOOKS", () => {
  assert.throws(() => new HookBus().on("beforeDepoly", () => {}), ConfigError);
});

test("clear removes handlers for all events", async () => {
  const bus = new HookBus();
  bus.on(HOOKS.BEFORE_CHECK, () => {}).on(HOOKS.AFTER_CHECK, () => {});

  bus.clear();

  assert.equal(bus.listenerCount(HOOKS.BEFORE_CHECK), 0);
  assert.equal(bus.listenerCount(HOOKS.AFTER_CHECK), 0);
  assert.deepEqual(await bus.emit(HOOKS.BEFORE_CHECK, {}), []);
});
