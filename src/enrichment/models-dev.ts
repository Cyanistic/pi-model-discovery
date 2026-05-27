import type { DiscoveryDefaults } from "../config/types.js";
import { safeFetchJson } from "../discovery/helpers.js";
import { readStringArray } from "../shared/arrays.js";
import { isRecord } from "../shared/validation.js";
import { buildAliasIndex, type AliasAmbiguity, type AliasTarget } from "./aliases.js";
import { mapModelsDevRecordToPiMetadata } from "./models-dev-pi-mapper.js";

const CATALOG_SOURCE = "models.dev";

export type ModelsDevLookup = Map<string, ModelsDevMetadata> & {
  ambiguities?: AliasAmbiguity[];
};

export interface ModelsDevProviderMapping {
  provider: string;
  id?: string;
}

export interface ModelsDevMetadata extends DiscoveryDefaults {
  id: string;
  name?: string;
  canonicalId?: string;
  equivalentIds?: string[];
  providerMapping?: ModelsDevProviderMapping;
  catalogSources?: string[];
}

function readProviderMappings(value: unknown): ModelsDevProviderMapping[] {
  if (!isRecord(value)) return [];
  const mappings: ModelsDevProviderMapping[] = [];
  for (const [provider, rawMapping] of Object.entries(value)) {
    if (typeof rawMapping === "string" && rawMapping.length > 0) {
      mappings.push({ provider, id: rawMapping });
      continue;
    }
    if (isRecord(rawMapping) && typeof rawMapping.id === "string" && rawMapping.id.length > 0) {
      mappings.push({ provider, id: rawMapping.id });
    }
  }
  return mappings;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function toMetadata(candidate: unknown, fallbackId: string | undefined, source: string): ModelsDevMetadata | undefined {
  if (!isRecord(candidate)) return undefined;
  const mapped = mapModelsDevRecordToPiMetadata(candidate, fallbackId);
  if (!mapped) return undefined;
  return { ...mapped, canonicalId: mapped.id, catalogSources: [source] };
}

interface CatalogRecord {
  metadata: ModelsDevMetadata;
  aliases: string[];
  providerMappings: ModelsDevProviderMapping[];
}

function toCatalogRecord(candidate: unknown, fallbackId: string | undefined, source: string): CatalogRecord | undefined {
  const metadata = toMetadata(candidate, fallbackId, source);
  if (!metadata || !isRecord(candidate)) return undefined;
  const aliases = readStringArray(candidate.aliases);
  const providerMappings = readProviderMappings(candidate.providers);
  const providerKeys = providerMappings.flatMap((mapping) => (mapping.id ? [`${mapping.provider}:${mapping.id}`] : []));
  metadata.equivalentIds = unique([...aliases, ...providerKeys]);
  return { metadata, aliases, providerMappings };
}

function addRecord(records: CatalogRecord[], candidate: unknown, fallbackId: string | undefined, source: string): void {
  const record = toCatalogRecord(candidate, fallbackId, source);
  if (record) records.push(record);
}

function scanModelsContainer(records: CatalogRecord[], container: unknown, source: string): void {
  if (Array.isArray(container)) {
    for (const entry of container) addRecord(records, entry, undefined, source);
    return;
  }
  if (isRecord(container)) {
    for (const [id, entry] of Object.entries(container)) addRecord(records, entry, id, source);
  }
}

function collectRecords(payload: unknown, source: string): CatalogRecord[] {
  const records: CatalogRecord[] = [];
  if (Array.isArray(payload)) {
    scanModelsContainer(records, payload, source);
    return records;
  }
  if (!isRecord(payload)) return records;

  if (isRecord(payload.models) || Array.isArray(payload.models)) {
    scanModelsContainer(records, payload.models, source);
  }
  const providers = isRecord(payload.providers) ? payload.providers : payload;
  for (const provider of Object.values(providers)) {
    if (isRecord(provider) && (isRecord(provider.models) || Array.isArray(provider.models))) {
      scanModelsContainer(records, provider.models, source);
    }
  }
  return records;
}

function metadataForAlias(record: CatalogRecord, alias?: string, providerMapping?: ModelsDevProviderMapping): ModelsDevMetadata {
  return {
    ...record.metadata,
    id: alias ?? record.metadata.id,
    canonicalId: record.metadata.canonicalId ?? record.metadata.id,
    equivalentIds: record.metadata.equivalentIds ? [...record.metadata.equivalentIds] : undefined,
    providerMapping,
    catalogSources: record.metadata.catalogSources ? [...record.metadata.catalogSources] : [CATALOG_SOURCE],
  };
}

function uniqueCatalogValues<T>(values: Array<T | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined)));
}

function mergeMetadata(existing: ModelsDevMetadata, incoming: ModelsDevMetadata): ModelsDevMetadata {
  return {
    ...incoming,
    ...existing,
    cost: incoming.cost || existing.cost ? { ...(incoming.cost ?? {}), ...(existing.cost ?? {}) } : undefined,
    capabilities: incoming.capabilities || existing.capabilities ? { ...(incoming.capabilities ?? {}), ...(existing.capabilities ?? {}) } : undefined,
    equivalentIds: uniqueCatalogValues([...(existing.equivalentIds ?? []), ...(incoming.equivalentIds ?? [])]),
    catalogSources: uniqueCatalogValues([...(existing.catalogSources ?? []), ...(incoming.catalogSources ?? [])]),
  };
}

export function mergeModelsDevLookups(lookups: ModelsDevLookup[]): ModelsDevLookup {
  const merged = new Map<string, ModelsDevMetadata>() as ModelsDevLookup;
  const ambiguities: NonNullable<ModelsDevLookup["ambiguities"]> = [];

  for (const lookup of lookups) {
    for (const [key, metadata] of lookup) {
      const existing = merged.get(key);
      merged.set(key, existing ? mergeMetadata(existing, metadata) : metadata);
    }
    if (lookup.ambiguities) ambiguities.push(...lookup.ambiguities);
  }

  if (ambiguities.length > 0) merged.ambiguities = ambiguities;
  return merged;
}

export function buildModelsDevLookup(payload: unknown, source = CATALOG_SOURCE): ModelsDevLookup {
  const lookup = new Map<string, ModelsDevMetadata>() as ModelsDevLookup;
  const records = collectRecords(payload, source);
  const aliasTargets: Array<AliasTarget<ModelsDevMetadata>> = [];

  for (const record of records) {
    lookup.set(record.metadata.id, record.metadata);
    for (const alias of record.aliases) {
      aliasTargets.push({ key: alias, canonicalId: record.metadata.id, metadata: metadataForAlias(record, alias) });
    }
    for (const providerMapping of record.providerMappings) {
      if (!providerMapping.id) continue;
      const key = `${providerMapping.provider}:${providerMapping.id}`;
      aliasTargets.push({ key, canonicalId: record.metadata.id, metadata: metadataForAlias(record, key, providerMapping) });
    }
  }

  const aliasIndex = buildAliasIndex(aliasTargets, source);
  for (const [alias, target] of aliasIndex.aliases) lookup.set(alias, target.metadata);
  lookup.ambiguities = aliasIndex.ambiguities;
  return lookup;
}

export async function fetchModelsDevLookup(url: string, timeoutMs: number): Promise<ModelsDevLookup> {
  const response = await safeFetchJson<unknown>(url, { method: "GET", headers: { accept: "application/json" } }, timeoutMs);
  if (!response.ok || response.data === undefined) {
    throw new Error(`models.dev catalog fetch failed: ${response.error ?? `HTTP ${response.status}`}`);
  }
  return buildModelsDevLookup(response.data);
}
