# Lifecycle hooks and logging

**Imports:** `HookBus`, `HOOKS`, `createLogger`, `silentLogger` from `update-pilot`.

## HookBus public methods

| Signature | Behavior / errors |
| --- | --- |
| `new HookBus()` | creates empty event registry |
| `on(event: string, handler: HookHandler): this` | register canonical event; unknown name => `ConfigError`, nonfunction => `TypeError` |
| `once(event: string, handler: HookHandler): this` | removes handler before its first invocation |
| `off(event: string, handler: HookHandler): this` | unregisters handler (also matches original `once` handler) |
| `emit(event: string, payload: unknown): Promise<unknown[]>` | awaits handlers sequentially; a thrown error stops emission |
| `emitSafe(event: string, payload: unknown): Promise<{ results: unknown[]; errors: unknown[] }>` | awaits sequentially; collects individual failures |
| `clear(): void` | removes all handlers |
| `listenerCount(event: string): number` | returns registered count |

Canonical constants (read-only `HOOKS` mapping): `BEFORE_CHECK="beforeCheck"`, `AFTER_CHECK="afterCheck"`, `BEFORE_DEPLOY="beforeDeploy"`, `AFTER_DEPLOY="afterDeploy"`, `BEFORE_VERIFY="beforeVerify"`, `AFTER_VERIFY="afterVerify"`, `BEFORE_ROLLBACK="beforeRollback"`, `AFTER_ROLLBACK="afterRollback"`, `ON_ERROR="onError"`.

`UpdatePilot` registers configured hook functions on its active bus and emits using `emitSafe`. A hook exception is logged best-effort and does not abort deployment. The error hook is not a transactional rollback mechanism.

```js
import { HookBus, HOOKS } from "update-pilot";
const bus = new HookBus();
bus.once(HOOKS.AFTER_CHECK, async ({ result }) => result.updateAvailable);
const first = await bus.emitSafe(HOOKS.AFTER_CHECK, {
  result: { updateAvailable: true }
});
console.log(first.results); // [true]
console.log(bus.listenerCount(HOOKS.AFTER_CHECK)); // 0
```

## Logger

`createLogger(options?: LoggerConfig): Logger` accepts:

| Option | Default | Behavior |
| --- | --- | --- |
| `level` | `info` | `silent`, `error`, `warn`, `info`, `debug` |
| `prefix` | `[update-pilot]` | formatted label |
| `pretty` | `true` | readable text vs JSON-lines |
| `stream` | stdout for most logs, stderr for errors | object with `write(chunk: string)` |
| `redact` | `["token","password","authorization"]` | recursive, case-insensitive **exact key** redaction |

A logger has `error(message, meta?)`, `warn(message, meta?)`, `info(message, meta?)`, `debug(message, meta?)`, and `child(bindings?)` methods. Unknown log levels throw `TypeError`. `silentLogger` implements the same methods as no-ops.

```js
import { createLogger, silentLogger } from "update-pilot";
const logger = createLogger({ level: "debug", pretty: false });
logger.info("checking", { token: "secret" }); // token metadata key becomes "***"
silentLogger.debug("ignored");
```

Logger redaction is key-based and does not sanitize arbitrary string messages, URLs or error stacks. Protect secrets before logging, and redact error `context` before serializing into HTTP responses.