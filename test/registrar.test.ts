import test from "node:test";
import assert from "node:assert/strict";

import type { DiscoveredModel } from "../src/cache/types.js";
import type { ProviderConfigEntry } from "../src/config/types.js";
import { createTestApiKey } from "./support/secrets.js";
import { ModelRegistrar } from "../src/registry/registrar.js";

const TEST_API_KEY = createTestApiKey("registrar");

const provider: ProviderConfigEntry = {
  id: "providerx",
  baseUrl: "http://127.0.0.1:8000/v1",
  apiKey: TEST_API_KEY,
  api: "openai-completions" as ProviderConfigEntry["api"],
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
  source: "explicit",
};

const model: DiscoveredModel = {
  id: "raw-model",
  name: "Raw Model",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
  isFree: true,
  sources: {},
};

test("registrar is idempotent unless forced for reload/resource discovery", () => {
  const calls: Array<{ name: string; modelCount: number }> = [];
  const unregistered: string[] = [];
  const pi = {
    registerProvider(name: string, config: { models?: unknown[] }) {
      calls.push({ name, modelCount: config.models?.length ?? 0 });
    },
    unregisterProvider(name: string) {
      unregistered.push(name);
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  assert.equal(registrar.register({ provider, models: [model] }), true);
  assert.equal(registrar.register({ provider, models: [model] }), false);
  assert.equal(registrar.register({ provider, models: [model] }, { force: true }), true);
  assert.deepEqual(calls, [
    { name: "providerx", modelCount: 1 },
    { name: "providerx", modelCount: 1 },
  ]);
  assert.deepEqual(registrar.unregisterMissing(new Set()), ["providerx"]);
  assert.deepEqual(unregistered, ["providerx"]);
});

test("registrar omits inactive endpoint models from provider registration", () => {
  const capturedModels: Array<{ id?: string }> = [];
  const pi = {
    registerProvider(_name: string, config: { models?: Array<{ id?: string }> }) {
      capturedModels.push(...(config.models ?? []));
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  const healthyModel: DiscoveredModel = {
    ...model,
    id: "healthy-model",
    endpointMetadata: { status: "healthy" },
  };
  const deadModel: DiscoveredModel = {
    ...model,
    id: "dead-model",
    endpointMetadata: { status: "dead" },
  };
  const legacyModel: DiscoveredModel = {
    ...model,
    id: "legacy-model",
    endpointMetadata: { status: "legacy" },
  };

  assert.equal(registrar.register({ provider, models: [healthyModel, deadModel, legacyModel] }), true);
  assert.deepEqual(capturedModels.map((entry) => entry.id), ["healthy-model"]);
});

test("registrar omits likely non-chat OpenAI-compatible utility and generation models", () => {
  const capturedModels: Array<{ id?: string }> = [];
  const pi = {
    registerProvider(_name: string, config: { models?: Array<{ id?: string }> }) {
      capturedModels.push(...(config.models ?? []));
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  const chatModel: DiscoveredModel = { ...model, id: "gpt-5.5" };
  const imageModel: DiscoveredModel = { ...model, id: "gpt-image-2" };
  const embeddingModel: DiscoveredModel = { ...model, id: "bge-large-zh-v1.5" };
  const imageOnlyOutputModel: DiscoveredModel = { ...model, id: "catalog-image-model", output: ["image"] };

  assert.equal(registrar.register({ provider, models: [chatModel, imageModel, embeddingModel, imageOnlyOutputModel] }), true);
  assert.deepEqual(capturedModels.map((entry) => entry.id), ["gpt-5.5"]);
});

test("registrar keeps degraded and metadata-less models while filtering inactive status and type markers case-insensitively", () => {
  const capturedModels: Array<{ id?: string }> = [];
  const pi = {
    registerProvider(_name: string, config: { models?: Array<{ id?: string }> }) {
      capturedModels.push(...(config.models ?? []));
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  const metadataLessModel: DiscoveredModel = { ...model, id: "metadata-less-model" };
  const degradedModel: DiscoveredModel = {
    ...model,
    id: "degraded-model",
    endpointMetadata: { status: " degraded " },
  };
  const retiredTypeModel: DiscoveredModel = {
    ...model,
    id: "retired-type-model",
    endpointMetadata: { type: " RETIRED " },
  };
  const unavailableStatusModel: DiscoveredModel = {
    ...model,
    id: "unavailable-status-model",
    endpointMetadata: { status: "Unavailable" },
  };

  assert.equal(
    registrar.register({ provider, models: [metadataLessModel, degradedModel, retiredTypeModel, unavailableStatusModel] }),
    true,
  );
  assert.deepEqual(capturedModels.map((entry) => entry.id), ["metadata-less-model", "degraded-model"]);
});

test("registrar does not preserve stale pi-model-discovery-owned inactive models during merge registration", () => {
  const capturedModels: Array<{ id?: string; importOwnership?: string }> = [];
  const pi = {
    registerProvider(_name: string, config: { models?: Array<{ id?: string; importOwnership?: string }> }) {
      capturedModels.push(...(config.models ?? []));
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  };
  const registrar = new ModelRegistrar(pi as never);
  const deadModel: DiscoveredModel = {
    ...model,
    id: "dead-stale-model",
    endpointMetadata: { status: "dead" },
  };
  const healthyModel: DiscoveredModel = {
    ...model,
    id: "healthy-model",
    endpointMetadata: { status: "healthy" },
  };

  assert.equal(
    registrar.register(
      { provider, models: [deadModel, healthyModel] },
      {
        importMode: "merge",
        existingModels: [
          { id: "dead-stale-model", importOwnership: "pi-model-discovery" },
          { id: "manual-model", importOwnership: "manual" },
        ],
      },
    ),
    true,
  );
  assert.deepEqual(capturedModels.map((entry) => entry.id), ["manual-model", "healthy-model"]);
});
