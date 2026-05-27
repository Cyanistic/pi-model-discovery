import test from "node:test";
import assert from "node:assert/strict";

import type { DiscoveredModel } from "../src/cache/types.js";
import type { ProviderConfigEntry } from "../src/config/types.js";
import { ModelRegistrar } from "../src/registry/registrar.js";
import { createTestApiKey } from "./support/secrets.js";

const TEST_API_KEY = createTestApiKey("now-registrar-conflicts");

const baseProvider: ProviderConfigEntry = {
  id: "anthropic",
  baseUrl: "https://anthropic.example.invalid/v1",
  apiKey: TEST_API_KEY,
  api: "anthropic-messages" as ProviderConfigEntry["api"],
  authHeader: true,
  headers: {},
  discovery: {
    type: "openai-compat",
    enabled: true,
    headers: {},
    timeoutMs: 1000,
    ttlMs: 60_000,
    includeDetails: false,
    allowModels: [],
    blockModels: [],
  },
  defaults: {},
  modelDefaults: {},
  source: "auto-import",
};

const model: DiscoveredModel = {
  id: "claude-3-5-sonnet-20241022",
  name: "Claude 3.5 Sonnet",
  api: "anthropic-messages" as DiscoveredModel["api"],
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200000,
  maxTokens: 8192,
  sources: { test: true },
};

interface RegistrationOutcome {
  registered: boolean;
  skipped: boolean;
  owner: "pi-model-discovery" | "pi-multi-auth";
  reason?: string;
}

test("registrar augments provider IDs managed by pi-multi-auth and reports ownership", () => {
  const registerCalls: string[] = [];
  const pi = {
    registerProvider(providerId: string) {
      registerCalls.push(providerId);
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);

  const outcome = registrar.register(
    { provider: baseProvider, models: [model] },
    {
      ownership: {
        managedProviderIds: new Set(["anthropic"]),
        manager: "pi-multi-auth",
        onConflict: "merge",
      },
    } as never,
  ) as unknown as RegistrationOutcome;

  assert.deepEqual(registerCalls, ["anthropic"], "pi-model-discovery should register discovered models for pi-multi-auth managed providers");
  assert.equal(outcome.registered, true);
  assert.equal(outcome.skipped, false);
  assert.equal(outcome.owner, "pi-multi-auth");
});

test("registrar keeps explicit skip behavior for pi-multi-auth managed provider IDs", () => {
  const registerCalls: string[] = [];
  const pi = {
    registerProvider(providerId: string) {
      registerCalls.push(providerId);
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);

  const outcome = registrar.register(
    { provider: baseProvider, models: [model] },
    {
      ownership: {
        managedProviderIds: new Set(["anthropic"]),
        manager: "pi-multi-auth",
        onConflict: "skip",
      },
    } as never,
  ) as unknown as RegistrationOutcome;

  assert.deepEqual(registerCalls, []);
  assert.equal(outcome.registered, false);
  assert.equal(outcome.skipped, true);
  assert.equal(outcome.owner, "pi-multi-auth");
  assert.match(outcome.reason ?? "", /explicit conflict policy/i);
});

test("registrar marks isolated provider IDs as pi-model-discovery owned when no pi-multi-auth conflict exists", () => {
  const registerCalls: string[] = [];
  const pi = {
    registerProvider(providerId: string) {
      registerCalls.push(providerId);
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  const isolatedProvider = { ...baseProvider, id: "pi-model-discovery-anthropic", source: "explicit" as const };

  const outcome = registrar.register(
    { provider: isolatedProvider, models: [model] },
    {
      ownership: {
        managedProviderIds: new Set(["anthropic"]),
        manager: "pi-multi-auth",
        onConflict: "merge",
      },
    } as never,
  ) as unknown as RegistrationOutcome;

  assert.deepEqual(registerCalls, ["pi-model-discovery-anthropic"]);
  assert.equal(outcome.registered, true);
  assert.equal(outcome.skipped, false);
  assert.equal(outcome.owner, "pi-model-discovery");
});
