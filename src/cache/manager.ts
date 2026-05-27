import type { ProviderConfigEntry } from "../config/types.js";
import { createEmptyCache, readCacheFile, writeCacheFile } from "./json-store.js";
import type { CacheEntry, CacheSchema, DiscoveredModel } from "./types.js";

export const NON_AUTHORITATIVE_RETRY_MS = 5 * 60 * 1000;

function hasLegacyGlobalDefaultOnlyMetadata(entry: CacheEntry): boolean {
  return entry.models.some((model) => {
    if (model.sources.globalDefaults !== true) return false;
    const provenanceEntries = Object.entries(model.capabilityProvenance ?? {}).filter(([field]) => field !== "id");
    return provenanceEntries.length === 0 || provenanceEntries.every(([_field, source]) => source === "globalDefaults");
  });
}

function hasLegacyBlazeApiClaudeAnthropicOverrides(providerId: string | undefined, entry: CacheEntry): boolean {
  if (providerId !== "blazeapi") return false;
  return entry.models.some((model) => {
    const routeId = model.endpointMetadata?.routingGroup ?? model.endpointMetadata?.providerId ?? model.id;
    if (!/^route:claude-|^claude-/i.test(routeId)) return false;
    return model.api === "anthropic-messages" || /\/anthropic\/?$/i.test(model.baseUrl ?? "");
  });
}

export function isCacheEntryFresh(entry: CacheEntry, now = new Date(), providerId?: string): boolean {
  if (!entry.authoritative && entry.models.length === 0) return false;
  if (hasLegacyGlobalDefaultOnlyMetadata(entry)) return false;
  if (hasLegacyBlazeApiClaudeAnthropicOverrides(providerId, entry)) return false;
  const fetchedAtMs = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return false;
  const maxAge = entry.authoritative ? entry.ttlMs : NON_AUTHORITATIVE_RETRY_MS;
  return now.getTime() - fetchedAtMs < maxAge;
}

export function isProviderCacheEntryFresh(providerId: string, entry: CacheEntry, now = new Date()): boolean {
  return isCacheEntryFresh(entry, now, providerId);
}

export interface CacheProviderWrite {
  provider: ProviderConfigEntry;
  models: DiscoveredModel[];
  authoritative: boolean;
}

export class CacheManager {
  constructor(private readonly cachePath: string) {}

  read(): CacheSchema {
    return readCacheFile(this.cachePath);
  }

  getFreshEntry(providerId: string, now = new Date()): CacheEntry | undefined {
    const entry = this.read().providers[providerId];
    if (!entry) return undefined;
    return isProviderCacheEntryFresh(providerId, entry, now) ? entry : undefined;
  }

  getAnyEntry(providerId: string): CacheEntry | undefined {
    return this.read().providers[providerId];
  }

  async writeProvider(provider: ProviderConfigEntry, models: DiscoveredModel[], authoritative: boolean, now = new Date()): Promise<void> {
    await this.writeProviders([{ provider, models, authoritative }], now);
  }

  async writeProviderEntry(providerId: string, entry: CacheEntry): Promise<void> {
    const cache = this.read();
    cache.providers[providerId] = entry;
    await writeCacheFile(this.cachePath, cache);
  }

  async writeProviders(entries: CacheProviderWrite[], now = new Date()): Promise<void> {
    if (entries.length === 0) return;
    const cache = this.read();
    const fetchedAt = now.toISOString();
    for (const { provider, models, authoritative } of entries) {
      cache.providers[provider.id] = {
        fetchedAt,
        ttlMs: provider.discovery.ttlMs ?? 2 * 60 * 60 * 1000,
        authoritative,
        models,
      };
    }
    await writeCacheFile(this.cachePath, cache);
  }

  async pruneProviders(activeProviderIds: ReadonlySet<string>): Promise<string[]> {
    const cache = this.read();
    const removed: string[] = [];
    for (const providerId of Object.keys(cache.providers)) {
      if (activeProviderIds.has(providerId)) continue;
      delete cache.providers[providerId];
      removed.push(providerId);
    }
    if (removed.length > 0) await writeCacheFile(this.cachePath, cache);
    return removed;
  }

  async pruneProviderIds(providerIds: ReadonlySet<string>): Promise<string[]> {
    if (providerIds.size === 0) return [];
    const cache = this.read();
    const removed: string[] = [];
    for (const providerId of providerIds) {
      if (!(providerId in cache.providers)) continue;
      delete cache.providers[providerId];
      removed.push(providerId);
    }
    if (removed.length > 0) await writeCacheFile(this.cachePath, cache);
    return removed;
  }

  async replaceAll(entries: Record<string, CacheEntry>, now = new Date()): Promise<void> {
    await writeCacheFile(this.cachePath, {
      ...createEmptyCache(now),
      providers: entries,
    });
  }
}
