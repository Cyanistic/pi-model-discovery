import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL_DISCOVERY_CACHE_ONLY_ENV,
  resolveModelDiscoveryStartupPolicy,
} from "../src/index.js";

test("pi-model-discovery startup policy allows network refresh by default", () => {
  const policy = resolveModelDiscoveryStartupPolicy({} as NodeJS.ProcessEnv);

  assert.deepEqual(policy, {
    networkRefreshDisabled: false,
    registerStaleCache: false,
  });
});

test("pi-model-discovery startup policy enables cache-only mode from router env", () => {
  const policy = resolveModelDiscoveryStartupPolicy({
    [MODEL_DISCOVERY_CACHE_ONLY_ENV]: "1",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(policy, {
    networkRefreshDisabled: true,
    registerStaleCache: true,
    reason: MODEL_DISCOVERY_CACHE_ONLY_ENV,
  });
});
