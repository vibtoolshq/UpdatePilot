import { ConfigError } from "../utils/errors.js";

/** @typedef {(payload: unknown) => unknown | Promise<unknown>} HookHandler */

/** Canonical lifecycle event names accepted by HookBus. */
export const HOOKS = Object.freeze({
  BEFORE_CHECK: "beforeCheck",
  AFTER_CHECK: "afterCheck",
  BEFORE_DEPLOY: "beforeDeploy",
  AFTER_DEPLOY: "afterDeploy",
  BEFORE_VERIFY: "beforeVerify",
  AFTER_VERIFY: "afterVerify",
  BEFORE_ROLLBACK: "beforeRollback",
  AFTER_ROLLBACK: "afterRollback",
  ON_ERROR: "onError",
});

/** @type {Set<string>} */
const VALID_HOOKS = new Set(Object.values(HOOKS));

/**
 * A small sequential, await-aware bus for update lifecycle hooks.
 * @example
 * const hooks = new HookBus();
 * hooks.on(HOOKS.BEFORE_DEPLOY, async ({ version }) => record(version));
 */
export class HookBus {
  /** @type {Map<string, HookHandler[]>} */
  #handlers = new Map();

  /** Create an empty hook bus.
   * @returns New HookBus instance.
   * @example
   * const hooks = new HookBus();
   */
  constructor() {}

  /**
   * Register a handler for a canonical hook name.
   * @param {string} event Hook name from {@link HOOKS}.
   * @param {HookHandler} handler Function invoked when the hook emits.
   * @returns {this} This bus for chaining.
   * @example
   * hooks.on(HOOKS.AFTER_CHECK, (result) => audit(result));
   */
  on(event, handler) {
    if (!VALID_HOOKS.has(event))
      throw new ConfigError(`Unknown hook event: ${event}`, {
        context: { event },
      });
    if (typeof handler !== "function")
      throw new TypeError("handler must be a function");
    const handlers = this.#handlers.get(event) ?? [];
    handlers.push(handler);
    this.#handlers.set(event, handlers);
    return this;
  }

  /**
   * Remove a previously registered handler.
   * @param {string} event Hook name.
   * @param {HookHandler} handler Handler or original once-handler to remove.
   * @returns {this} This bus for chaining.
   * @example
   * hooks.off(HOOKS.AFTER_CHECK, auditHandler);
   */
  off(event, handler) {
    const handlers = this.#handlers.get(event);
    if (!handlers) return this;
    const remaining = handlers.filter((item) => {
      const registered =
        /** @type {HookHandler & { listener?: HookHandler }} */ (item);
      return registered !== handler && registered.listener !== handler;
    });
    if (remaining.length) this.#handlers.set(event, remaining);
    else this.#handlers.delete(event);
    return this;
  }

  /**
   * Register a handler that removes itself after its first invocation.
   * @param {string} event Hook name from {@link HOOKS}.
   * @param {HookHandler} handler Function invoked once.
   * @returns {this} This bus for chaining.
   * @example
   * hooks.once(HOOKS.AFTER_DEPLOY, (result) => report(result));
   */
  once(event, handler) {
    /** @type {HookHandler & { listener?: HookHandler }} */
    const wrapped = async (payload) => {
      this.off(event, wrapped);
      return handler(payload);
    };
    wrapped.listener = handler;
    return this.on(event, wrapped);
  }

  /**
   * Invoke handlers sequentially and return each result.
   * @param {string} event Hook name.
   * @param {unknown} payload Value passed to each handler.
   * @returns {Promise<unknown[]>} Handler results in invocation order.
   * @example
   * const results = await hooks.emit(HOOKS.BEFORE_DEPLOY, { version: "1.2.3" });
   */
  async emit(event, payload) {
    const results = [];
    for (const handler of [...(this.#handlers.get(event) ?? [])]) {
      results.push(await handler(payload));
    }
    return results;
  }

  /**
   * Invoke handlers sequentially, collecting individual failures.
   * @param {string} event Hook name.
   * @param {unknown} payload Value passed to each handler.
   * @returns {Promise<{ results: unknown[], errors: unknown[] }>} Successful results and thrown errors.
   * @example
   * const { results, errors } = await hooks.emitSafe(HOOKS.ON_ERROR, error);
   */
  async emitSafe(event, payload) {
    const results = [];
    const errors = [];
    for (const handler of [...(this.#handlers.get(event) ?? [])]) {
      try {
        results.push(await handler(payload));
      } catch (error) {
        errors.push(error);
      }
    }
    return { results, errors };
  }

  /**
   * Remove all registered handlers.
   * @returns {void} No value.
   * @example
   * hooks.clear();
   */
  clear() {
    this.#handlers.clear();
  }

  /**
   * Count handlers registered for an event.
   * @param {string} event Hook name.
   * @returns {number} Number of registered handlers.
   * @example
   * const count = hooks.listenerCount(HOOKS.BEFORE_CHECK);
   */
  listenerCount(event) {
    return this.#handlers.get(event)?.length ?? 0;
  }
}
