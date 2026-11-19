# Router provider conformance test helper

**Import:** `import { defineTrafficRouterContractTests } from "update-pilot/testing/traffic-router-contract";`
**Implementation:** `testing/traffic-router-contract.js`; declarations in `src/types/index.d.ts`.

**Signature:** `defineTrafficRouterContractTests(options: TrafficRouterContractTestOptions): void`

| Option | Type | Required |
| --- | --- | --- |
| `providerName` | nonempty string | Yes |
| `createScenario` | `() => TrafficRouterContractScenario \| Promise<TrafficRouterContractScenario>` | Yes |

`TrafficRouterContractScenario` must provide:

| Member | Purpose |
| --- | --- |
| `trafficRouter` | actual `prepare`, `switch`, `rollback` provider |
| `deployment` | Docker candidate/live deployment metadata |
| `verifyCandidateHealth(preparation, deployment)` | assert candidate reachability and isolation |
| `assertOldRouteActive()` | assert current live routing |
| `assertCandidateRouteActive()` | assert switched routing |
| `assertPreparationCleaned()` | assert temporary resource cleanup |
| `cleanup()` | release scenario resources |

The helper registers six `node:test` scenarios (the suite runs when the surrounding test runner executes it): candidate-only health, switch/restore, simulated health failure rollback, no-context cleanup, simulated switch failure and rollback, and repeated rollback idempotency. It does not spin up a provider on its own. It checks the observable route state only through assertions supplied by the provider scenario; implement meaningful real checks, not no-ops.

```js
import { defineTrafficRouterContractTests } from "update-pilot/testing/traffic-router-contract";

// This is the contract registration shape. Your provider test infrastructure
// MUST implement createIsolatedScenario() with real router/route assertions.
defineTrafficRouterContractTests({
  providerName: "my-router",
  createScenario: () => createIsolatedScenario()
});
```

This is an **integration template**, not a standalone executable example; `createIsolatedScenario` is an application-owned function not included in UpdatePilot. Run from your provider's Node test file with `node --test`. Invalid `providerName` or `createScenario` throws `TypeError` at registration. Scenario assertions execute inside a `try/finally` cleanup path. Successful generic package CI does not certify any specific router/version/topology.