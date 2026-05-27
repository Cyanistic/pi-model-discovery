import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import type { DiscoveredModel } from "../src/cache/types.js";
import { loadConfig } from "../src/config/loader.js";
import type { ExtensionConfig, ProviderConfigEntry } from "../src/config/types.js";
import { discoverProviders } from "../src/discovery/engine.js";
import { ModelRegistrar } from "../src/registry/registrar.js";
import { createTestApiKey } from "./support/secrets.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value), "utf-8");
}

function authFirstConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providers: [],
    autoImport: {
      enabled: true,
      discovery: {
        timeoutMs: 1000,
        includeDetails: false,
      },
    },
    modelsDev: { enabled: false },
    ...extra,
  };
}

function loadWithFixtures(config: unknown, modelsRoot: unknown, authRoot: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "pi-model-discovery-red-profiles-dedupe-"));
  const configPath = join(dir, "config.json");
  const modelsJsonPath = join(dir, "models.json");
  const authJsonPath = join(dir, "auth.json");
  writeJson(configPath, config);
  writeJson(modelsJsonPath, modelsRoot);
  writeJson(authJsonPath, authRoot);
  return loadConfig({ extensionRoot: dir, configPath, modelsJsonPath, authJsonPath });
}

function providerById(config: ExtensionConfig, providerId: string): ProviderConfigEntry | undefined {
  return config.providers.find((provider) => provider.id === providerId);
}

function assertNoSecretLeak(label: string, value: unknown, secrets: string[]): void {
  const serialized = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(serialized.includes(secret), false, `${label} must not expose raw credential material`);
  }
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [key.toLowerCase(), value]));
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) result[key.toLowerCase()] = String(value);
  return result;
}

function discoveredModel(id: string, name: string): DiscoveredModel {
  return {
    id,
    name,
    api: "openai-completions" as DiscoveredModel["api"],
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
    sources: { dynamic: true },
  };
}

function registrationProvider(overrides: Partial<ProviderConfigEntry> = {}): ProviderConfigEntry {
  const base: ProviderConfigEntry = {
    id: "pi-model-discovery-shadow",
    baseUrl: "https://shadow.example.invalid/v1",
    apiKey: createTestApiKey("red-dedupe-provider"),
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
    source: "auto-import",
  };
  return { ...base, ...overrides, discovery: { ...base.discovery, ...overrides.discovery } };
}

test("auth-only credentials import non-Pi-Mono profiles and skip Pi Mono managed providers", async (t) => {
  const secrets = {
    cerebras: createTestApiKey("red-cerebras"),
    qwen: createTestApiKey("red-qwen"),
    xiaomi: createTestApiKey("red-xiaomi"),
  };
  const expectedProfiles = {
    qwen: {
      baseUrl: "https://portal.qwen.ai/v1",
      endpoint: "https://portal.qwen.ai/v1/models",
      api: "openai-completions",
    },
  } as const;
  const loaded = loadWithFixtures(
    authFirstConfig(),
    { providers: {} },
    {
      cerebras: { type: "api_key", key: secrets.cerebras },
      qwen: { type: "api_key", key: secrets.qwen, request: { baseUrl: expectedProfiles.qwen.baseUrl } },
      xiaomi: { type: "api_key", key: secrets.xiaomi },
    },
  );

  assertNoSecretLeak("requested provider profile warnings", loaded.warnings, Object.values(secrets));
  assert.equal(providerById(loaded.config, "cerebras"), undefined, "cerebras is Pi Mono managed when auth.json has user credentials");
  assert.equal(providerById(loaded.config, "xiaomi"), undefined, "xiaomi is Pi Mono managed when auth.json has user credentials");
  const missingProviders = Object.keys(expectedProfiles).filter((providerId) => !providerById(loaded.config, providerId));
  assert.deepEqual(missingProviders, [], "non-Pi-Mono supported auth-only providers should use built-in read-only profile metadata");

  const requested: Array<{ providerId: string; url: string; method?: string; headers: Record<string, string> }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const providerId = Object.entries(expectedProfiles).find(([, profile]) => profile.endpoint === url)?.[0] ?? "unknown";
    requested.push({ providerId, url, method: init?.method, headers: headersToRecord(init?.headers) });
    return new Response(JSON.stringify({ data: [{ id: `${providerId}/safe-live-model`, name: `${providerId} safe live model` }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const providers = Object.keys(expectedProfiles).map((providerId) => providerById(loaded.config, providerId)!);
  for (const provider of providers) {
    const expected = expectedProfiles[provider.id as keyof typeof expectedProfiles];
    assert.equal(provider.source, "auto-import");
    assert.equal(provider.baseUrl, expected.baseUrl);
    assert.equal(provider.api, expected.api);
    assert.equal(provider.discovery.type, "openai-compat");
    assert.equal(provider.authHeader, true);
  }
  const discoveries = await discoverProviders({ ...loaded.config, providers });
  assert.deepEqual(
    requested.map((request) => ({ providerId: request.providerId, url: request.url, method: request.method })),
    [{ providerId: "qwen", url: expectedProfiles.qwen.endpoint, method: "GET" }],
  );
  assert.equal(requested[0]?.headers.authorization, `Bearer ${secrets.qwen}`, "qwen model-list request should use only its auth.json credential");
  assert.equal(requested.some((request) => /chat|completion/i.test(request.url.replace(/\/models(?:\?.*)?$/i, ""))), false);
  assertNoSecretLeak("requested provider discovery contracts", discoveries, Object.values(secrets));
});

test("Pi Mono managed Xiaomi token-plan provider IDs are skipped when user credentials exist", () => {
  const secret = `tp-${createTestApiKey("red-xiaomi-token-plan")}`;
  const loaded = loadWithFixtures(authFirstConfig(), { providers: {} }, { xiaomi: { type: "api_key", key: secret }, "xiaomi-token-plan-ams": { type: "api_key", key: secret } });

  assert.equal(providerById(loaded.config, "xiaomi"), undefined, "xiaomi credentials should stay with Pi Mono");
  assert.equal(providerById(loaded.config, "xiaomi-token-plan-ams"), undefined, "xiaomi token-plan credentials should stay with Pi Mono");
  assertNoSecretLeak("xiaomi token-plan skip warnings", loaded.warnings, [secret]);
});

test("qwen OAuth credentials are approved only for read-only built-in model-list discovery", async (t) => {
  const secret = createTestApiKey("red-qwen-oauth");
  const loaded = loadWithFixtures(
    authFirstConfig(),
    { providers: {} },
    { qwen: { type: "oauth", key: secret, request: { baseUrl: "https://portal.qwen.ai/v1" } } },
  );
  const provider = providerById(loaded.config, "qwen");
  assert.ok(provider, "qwen OAuth should be imported because its profile approves read-only model-list discovery");
  assert.equal(loaded.config.registrationOwnership?.managedProviderIds.has("qwen"), true, "qwen must be treated as pi-multi-auth managed for registration");

  const requested: Array<{ url: string; headers: Record<string, string> }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    requested.push({ url: String(input), headers: headersToRecord(init?.headers) });
    return new Response(JSON.stringify({ data: [{ id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const [discovery] = await discoverProviders({ ...loaded.config, providers: [provider] });
  assert.equal(requested[0]?.url, "https://portal.qwen.ai/v1/models");
  assert.equal(requested[0]?.headers.authorization, `Bearer ${secret}`);
  assert.equal(discovery?.models[0]?.providerModelConfig?.api, "openai-completions");
  assertNoSecretLeak("qwen OAuth discovery contract", discovery, [secret]);
});

test("registrar filters Pi built-in exact and canonical model duplicates while keeping unique discovered models eligible", () => {
  const registrations: Array<{ providerId: string; models: Array<{ id?: string; name?: string }> }> = [];
  const registrar = new ModelRegistrar({
    registerProvider(providerId: string, config: { models?: Array<{ id?: string; name?: string }> }) {
      registrations.push({ providerId, models: config.models ?? [] });
    },
    unregisterProvider() {
      throw new Error("unregisterProvider should not be called by this test");
    },
  } as never);

  const provider = registrationProvider({ id: "pi-model-discovery-xiaomi-qwen" });
  const discoveredModels = [
    discoveredModel("mimo-v2.5-pro", "Duplicate exact Xiaomi MiMo Pro"),
    discoveredModel("qwen3-coder-plus", "Duplicate canonical Qwen Coder Plus"),
    discoveredModel("mimo-v2.5-flash", "Unique Xiaomi MiMo Flash"),
  ];

  registrar.register(
    { provider, models: discoveredModels },
    {
      force: true,
      importMode: "replace",
      builtInProviderIds: new Set(["xiaomi", "qwen"]),
      builtInModels: [
        { providerId: "xiaomi", id: "mimo-v2.5-pro", importOwnership: "pi-built-in" },
        { providerId: "qwen", id: "qwen/qwen3-coder-plus", importOwnership: "pi-built-in" },
      ],
    },
  );

  assert.deepEqual(registrations.map((registration) => registration.providerId), ["pi-model-discovery-xiaomi-qwen"]);
  assert.deepEqual(
    registrations[0]?.models.map((model) => model.id),
    ["mimo-v2.5-flash"],
    "exact duplicate IDs and provider-prefixed canonical equivalents already supplied by Pi built-ins must not be registered twice",
  );
});
