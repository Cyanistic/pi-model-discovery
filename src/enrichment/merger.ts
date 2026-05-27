import type { CapabilityProvenance, DiscoveredModel } from "../cache/types.js";
import type { DiscoveryDefaults, ModelDefaults, ProviderConfigEntry } from "../config/types.js";
import { getBuiltInProviderProfile } from "../discovery/builtin-profiles.js";
import type { RawDiscoveredModel } from "../discovery/types.js";
import { catalogTrailingVariantLookupIds, normalizeCatalogIdentity, stripCatalogLookupPrefix } from "../shared/catalog-identity.js";
import { GLOBAL_DEFAULTS, mergeCost } from "./defaults.js";
import { classifyFreeModels } from "./free-classifier.js";
import type { ModelsDevLookup, ModelsDevMetadata } from "./models-dev.js";
import { recordCapabilityProvenance, valuesEqual } from "./provenance.js";

function displayNameFromId(id: string, providerId: string): string {
  const lastSegment = id.split("/").at(-1) ?? id;
  const title = lastSegment
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return `${title || id} (${providerId})`;
}

function withProvenance<T extends DiscoveredModel>(model: T, field: keyof CapabilityProvenance, nextValue: unknown, source: string, currentValue: unknown): T {
  if (nextValue === undefined || valuesEqual(currentValue, nextValue)) return model;
  return {
    ...model,
    capabilityProvenance: recordCapabilityProvenance(model.capabilityProvenance, field, source),
  };
}

export function applyModelDefaults(model: DiscoveredModel, defaults: DiscoveryDefaults | ModelDefaults | ModelsDevMetadata | undefined, source: string): DiscoveredModel {
  if (!defaults) return model;
  let next = { ...model, sources: { ...model.sources, [source]: true } };

  const name = "name" in defaults && defaults.name ? defaults.name : undefined;
  next = withProvenance(next, "name", name, source, next.name);
  if (name !== undefined) next.name = name;

  next = withProvenance(next, "baseUrl", defaults.baseUrl, source, next.baseUrl);
  if (defaults.baseUrl !== undefined) next.baseUrl = defaults.baseUrl;

  next = withProvenance(next, "reasoning", defaults.reasoning, source, next.reasoning);
  if (defaults.reasoning !== undefined) next.reasoning = defaults.reasoning;

  const thinkingLevelMap = defaults.thinkingLevelMap ? { ...defaults.thinkingLevelMap } : undefined;
  next = withProvenance(next, "thinkingLevelMap", thinkingLevelMap, source, next.thinkingLevelMap);
  if (thinkingLevelMap !== undefined) next.thinkingLevelMap = thinkingLevelMap;

  next = withProvenance(next, "input", defaults.input, source, next.input);
  if (defaults.input !== undefined) next.input = defaults.input;

  next = withProvenance(next, "output", defaults.output, source, next.output);
  if (defaults.output !== undefined) next.output = defaults.output;

  next = withProvenance(next, "capabilities", defaults.capabilities, source, next.capabilities);
  if (defaults.capabilities !== undefined) next.capabilities = defaults.capabilities;

  const cost = defaults.cost ? mergeCost(next.cost, defaults.cost) : undefined;
  next = withProvenance(next, "cost", cost, source, next.cost);
  if (cost !== undefined) next.cost = cost;

  next = withProvenance(next, "contextWindow", defaults.contextWindow, source, next.contextWindow);
  if (defaults.contextWindow !== undefined) next.contextWindow = defaults.contextWindow;

  next = withProvenance(next, "maxTokens", defaults.maxTokens, source, next.maxTokens);
  if (defaults.maxTokens !== undefined) next.maxTokens = defaults.maxTokens;

  next = withProvenance(next, "compat", defaults.compat, source, next.compat);
  if (defaults.compat !== undefined) next.compat = defaults.compat;

  return next;
}

function shouldUseCachedField(cached: DiscoveredModel, field: keyof ModelDefaults): boolean {
  const provenance = cached.capabilityProvenance?.[field as keyof NonNullable<DiscoveredModel["capabilityProvenance"]>];
  if (provenance === "globalDefaults") return false;
  if (provenance !== undefined) return true;
  return cached.sources.globalDefaults !== true;
}

function cacheDefaults(cached: DiscoveredModel | undefined): ModelDefaults | undefined {
  if (!cached) return undefined;
  const defaults: ModelDefaults = {};
  if (shouldUseCachedField(cached, "name")) defaults.name = cached.name;
  if (shouldUseCachedField(cached, "baseUrl")) defaults.baseUrl = cached.baseUrl;
  if (shouldUseCachedField(cached, "reasoning")) defaults.reasoning = cached.reasoning;
  if (shouldUseCachedField(cached, "thinkingLevelMap")) defaults.thinkingLevelMap = cached.thinkingLevelMap ? { ...cached.thinkingLevelMap } : undefined;
  if (shouldUseCachedField(cached, "input")) defaults.input = cached.input;
  if (shouldUseCachedField(cached, "output")) defaults.output = cached.output;
  if (shouldUseCachedField(cached, "capabilities")) defaults.capabilities = cached.capabilities;
  if (shouldUseCachedField(cached, "cost")) defaults.cost = cached.cost;
  if (shouldUseCachedField(cached, "contextWindow")) defaults.contextWindow = cached.contextWindow;
  if (shouldUseCachedField(cached, "maxTokens")) defaults.maxTokens = cached.maxTokens;
  if (shouldUseCachedField(cached, "compat")) defaults.compat = cached.compat;
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

function applyEndpointField<K extends keyof DiscoveredModel>(
  model: DiscoveredModel,
  field: K,
  value: DiscoveredModel[K] | undefined,
  source: string,
): DiscoveredModel {
  if (value === undefined) return model;
  const next = withProvenance(model, field as keyof CapabilityProvenance, value, source, model[field]);
  return { ...next, [field]: value, sources: { ...next.sources, [source]: true } };
}

const BLAZEAPI_PROVIDER_ID = "blazeapi";
const OLLAMA_PROVIDER_ID = "ollama";
const PROVIDER_QUIRK_SOURCE = "providerQuirk";
const OLLAMA_CLOUD_FREE_SOURCE = "ollamaCloudHardcoded";

/**
 * Hard-coded free/premium classification for Ollama Cloud models based on
 * live curl-test results (May 2026). Free models accept the basic ollama
 * API key; premium models require a subscription/tier upgrade.
 */
const OLLAMA_CLOUD_FREE_MODELS = new Set([
  "gpt-oss:120b",
  "gemma3:4b",
  "ministral-3:8b",
  "devstral-2:123b",
  "gemma3:27b",
  "glm-4.7",
  "gpt-oss:20b",
  "ministral-3:14b",
  "nemotron-3-super",
  "qwen3-coder:480b",
  "nemotron-3-nano:30b",
  "ministral-3:3b",
  "devstral-small-2:24b",
  "rnj-1:8b",
  "qwen3-coder-next",
  "qwen3-vl:235b-instruct",
  "minimax-m2.1",
  "gemma4:31b",
  "qwen3-vl:235b",
  "minimax-m2",
  "cogito-2.1:671b",
  "minimax-m2.5",
  "qwen3-next:80b",
  "gemma3:12b",
  "glm-4.6",
]);

const OLLAMA_CLOUD_PREMIUM_MODELS = new Set([
  "glm-5",
  "kimi-k2.6",
  "qwen3.5:397b",
  "kimi-k2-thinking",
  "deepseek-v3.1:671b",
  "mistral-large-3:675b",
  "gemini-3-flash-preview",
  "glm-5.1",
  "deepseek-v4-flash",
  "minimax-m2.7",
  "kimi-k2:1t",
  "deepseek-v3.2",
  "kimi-k2.5",
  "deepseek-v4-pro",
]);

function isOllamaCloudProvider(provider: ProviderConfigEntry): boolean {
  return provider.id === OLLAMA_PROVIDER_ID;
}

export function applyOllamaCloudFreePremium(model: DiscoveredModel): DiscoveredModel {
  if (!OLLAMA_CLOUD_FREE_MODELS.has(model.id) && !OLLAMA_CLOUD_PREMIUM_MODELS.has(model.id)) {
    return model;
  }
  const isFree = OLLAMA_CLOUD_FREE_MODELS.has(model.id);
  const next = withProvenance(model, "isFree", isFree, OLLAMA_CLOUD_FREE_SOURCE, model.isFree);
  return { ...next, isFree, sources: { ...next.sources, [OLLAMA_CLOUD_FREE_SOURCE]: true } };
}


function isBlazeApiClaudeRouteIdentifier(value: unknown): boolean {
  return typeof value === "string" && /^route:claude-|^claude-/i.test(value.trim());
}

function isBlazeApiClaudeRoute(provider: ProviderConfigEntry, model: DiscoveredModel): boolean {
  if (provider.id !== BLAZEAPI_PROVIDER_ID) return false;
  return [
    model.endpointMetadata?.routingGroup,
    model.endpointMetadata?.providerId,
    model.id,
  ].some(isBlazeApiClaudeRouteIdentifier);
}

export function applyProviderModelQuirks(provider: ProviderConfigEntry, model: DiscoveredModel): DiscoveredModel {
  if (!isBlazeApiClaudeRoute(provider, model)) return model;

  const nextCompat = {
    ...model.compat,
    supportsReasoningEffort: false,
  };
  const next = withProvenance(model, "compat", nextCompat, PROVIDER_QUIRK_SOURCE, model.compat);
  return {
    ...next,
    compat: nextCompat,
    sources: { ...next.sources, [PROVIDER_QUIRK_SOURCE]: true },
  };
}

export interface CatalogIdentityMatch {
  key: string;
  metadata: ModelsDevMetadata;
}

export interface CatalogIdentityIndex {
  normalizedKeys: Map<string, CatalogIdentityMatch[]>;
}

export function buildCatalogIdentityIndex(lookup: ModelsDevLookup): CatalogIdentityIndex {
  const normalizedKeys = new Map<string, CatalogIdentityMatch[]>();
  for (const [key, metadata] of lookup) {
    const normalized = normalizeCatalogIdentity(key);
    if (!normalized) continue;
    const matches = normalizedKeys.get(normalized) ?? [];
    matches.push({ key, metadata });
    normalizedKeys.set(normalized, matches);
  }
  return { normalizedKeys };
}

function dedupeCatalogMatches(matches: CatalogIdentityMatch[]): CatalogIdentityMatch[] {
  const byIdentity = new Map<string, CatalogIdentityMatch>();
  for (const match of matches) {
    const identity = match.metadata.canonicalId ?? match.metadata.id;
    if (!byIdentity.has(identity)) byIdentity.set(identity, match);
  }
  return [...byIdentity.values()];
}

function resolveNormalizedCatalogMatch(candidate: string, index: CatalogIdentityIndex): ModelsDevMetadata | undefined {
  const normalized = normalizeCatalogIdentity(candidate);
  if (!normalized) return undefined;
  const matches = index.normalizedKeys.get(normalized);
  if (!matches) return undefined;
  const uniqueMatches = dedupeCatalogMatches(matches);
  if (uniqueMatches.length === 1) return uniqueMatches[0]?.metadata;

  const lowerCandidate = candidate.trim().toLowerCase();
  const exactKeyMatches = uniqueMatches.filter((match) => match.key.trim().toLowerCase() === lowerCandidate);
  return exactKeyMatches.length === 1 ? exactKeyMatches[0]?.metadata : undefined;
}

function addCatalogLookupCandidate(candidates: string[], value: string | undefined): void {
  const candidate = value ? stripCatalogLookupPrefix(value) : "";
  if (candidate) candidates.push(candidate);
}

function addVariantStrippedCatalogCandidates(candidates: string[], value: string | undefined): void {
  if (!value) return;
  candidates.push(...catalogTrailingVariantLookupIds(value));
}

function isPreferredOriginLookupId(value: string): boolean {
  return /^anthropic\//i.test(stripCatalogLookupPrefix(value));
}

export function catalogLookupCandidates(rawModel: RawDiscoveredModel): string[] {
  const candidates: string[] = [];
  const catalogLookupIds = rawModel.catalogLookupIds ?? [];
  for (const lookupId of catalogLookupIds) {
    if (isPreferredOriginLookupId(lookupId)) addCatalogLookupCandidate(candidates, lookupId);
  }
  addCatalogLookupCandidate(candidates, rawModel.id);
  for (const lookupId of catalogLookupIds) {
    if (!isPreferredOriginLookupId(lookupId)) addCatalogLookupCandidate(candidates, lookupId);
  }
  addCatalogLookupCandidate(candidates, rawModel.endpointMetadata?.providerId);
  addCatalogLookupCandidate(candidates, rawModel.endpointMetadata?.routingGroup);

  for (const candidate of [...candidates]) addVariantStrippedCatalogCandidates(candidates, candidate);
  return Array.from(new Set(candidates));
}

function applyRawEndpointMetadata(model: DiscoveredModel, rawModel: RawDiscoveredModel): DiscoveredModel {
  let next = model;
  next = applyEndpointField(next, "description", rawModel.description, "endpointMetadata");
  next = applyEndpointField(next, "created", rawModel.created, "endpointMetadata");
  next = applyEndpointField(next, "ownedBy", rawModel.ownedBy, "endpointMetadata");
  next = applyEndpointField(next, "tags", rawModel.tags ? [...rawModel.tags] : undefined, "endpointMetadata");
  next = applyEndpointField(next, "endpointPricing", rawModel.endpointPricing ? { ...rawModel.endpointPricing } : undefined, "endpointPricing");
  next = applyEndpointField(next, "endpointMetadata", rawModel.endpointMetadata ? { ...rawModel.endpointMetadata } : undefined, "endpointMetadata");
  return next;
}

function modelsDevDefaults(
  provider: ProviderConfigEntry,
  rawModel: RawDiscoveredModel,
  modelsDevLookup: ModelsDevLookup,
  catalogIdentityIndex: CatalogIdentityIndex,
): ModelsDevMetadata | undefined {
  const seen = new Set<string>();
  for (const lookupId of catalogLookupCandidates(rawModel)) {
    for (const key of [`${provider.id}:${lookupId}`, lookupId]) {
      if (seen.has(key)) continue;
      seen.add(key);
      const metadata = modelsDevLookup.get(key) ?? resolveNormalizedCatalogMatch(key, catalogIdentityIndex);
      if (metadata) return metadata;
    }
  }
  return undefined;
}


export function resolveModelsDevDefaults(
  provider: ProviderConfigEntry,
  rawModel: RawDiscoveredModel,
  modelsDevLookup: ModelsDevLookup,
  catalogIdentityIndex: CatalogIdentityIndex = buildCatalogIdentityIndex(modelsDevLookup),
): ModelsDevMetadata | undefined {
  return modelsDevDefaults(provider, rawModel, modelsDevLookup, catalogIdentityIndex);
}

export function enrichProviderModels(
  provider: ProviderConfigEntry,
  rawModels: RawDiscoveredModel[],
  modelsDevLookup: ModelsDevLookup,
  cachedModels: DiscoveredModel[] = [],
): DiscoveredModel[] {
  const cacheById = new Map(cachedModels.map((model) => [model.id, model]));
  const catalogIdentityIndex = buildCatalogIdentityIndex(modelsDevLookup);
  const enriched = rawModels.map((rawModel) => {
    let model: DiscoveredModel = {
      id: rawModel.id,
      name: rawModel.name ?? displayNameFromId(rawModel.id, provider.id),
      reasoning: GLOBAL_DEFAULTS.reasoning,
      input: GLOBAL_DEFAULTS.input,
      cost: GLOBAL_DEFAULTS.cost,
      contextWindow: GLOBAL_DEFAULTS.contextWindow,
      maxTokens: GLOBAL_DEFAULTS.maxTokens,
      compat: GLOBAL_DEFAULTS.compat,
      sources: { dynamic: true, globalDefaults: true },
      capabilityProvenance: { id: "dynamic" },
    };

    const catalogDefaults = modelsDevDefaults(provider, rawModel, modelsDevLookup, catalogIdentityIndex);
    if (provider.source === "auto-import") {
      model = applyModelDefaults(model, cacheDefaults(cacheById.get(rawModel.id)), "cache");
      model = applyModelDefaults(model, catalogDefaults, "modelsDev");
      model = applyModelDefaults(model, provider.modelDefaults[rawModel.id], "modelsJsonDefaults");
    } else {
      model = applyModelDefaults(model, catalogDefaults, "modelsDev");
      model = applyModelDefaults(model, cacheDefaults(cacheById.get(rawModel.id)), "cache");
    }
    model = applyModelDefaults(model, rawModel.defaults, "endpointDetails");
    model = applyRawEndpointMetadata(model, rawModel);
    if (rawModel.endpointPricing?.isFree !== undefined) {
      model = applyEndpointField(model, "isFree", rawModel.endpointPricing.isFree, "endpointPricing");
    }
    if (provider.source !== "auto-import") {
      model = applyModelDefaults(model, provider.modelDefaults[rawModel.id], "modelsJsonDefaults");
    }
    model = applyModelDefaults(model, provider.defaults, "providerDefaults");
    model = applyProviderModelQuirks(provider, model);
    if (isOllamaCloudProvider(provider)) {
      model = applyOllamaCloudFreePremium(model);
    }
    model = { ...model, id: rawModel.id, sources: { ...model.sources, dynamic: true } };
    return model;
  });
  return classifyFreeModels(enriched, {
    providerId: provider.id,
    wholeProviderFree: getBuiltInProviderProfile(provider.id)?.allDiscoveredModelsFree,
  });
}
