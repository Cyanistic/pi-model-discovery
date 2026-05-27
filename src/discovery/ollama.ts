import type { DiscoveryDefaults, ProviderConfigEntry } from "../config/types.js";
import { isRecord } from "../shared/validation.js";
import { applyModelFilters, buildDiscoveryHeaders, buildUrl, safeFetchJson } from "./helpers.js";
import type { RawDiscoveredModel } from "./types.js";

const OLLAMA_DETAILS_CONCURRENCY = 8;

interface OllamaTagsResponse {
  models?: Array<{
    name?: unknown;
    model?: unknown;
  }>;
}

interface OllamaShowResponse {
  model_info?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

function getNumber(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function mapShowDefaults(payload: OllamaShowResponse | undefined): DiscoveryDefaults | undefined {
  if (!payload) return undefined;
  const contextWindow = getNumber(payload.model_info, ["llama.context_length", "gemma3.context_length", "qwen2.context_length"]);
  return contextWindow ? { contextWindow } : undefined;
}

function readOllamaModelEntries(payload: unknown): NonNullable<OllamaTagsResponse["models"]> {
  if (!isRecord(payload)) {
    throw new Error("Malformed Ollama discovery payload: expected an object with models[].");
  }
  if (Array.isArray(payload.models)) return payload.models;
  throw new Error("Malformed Ollama discovery payload: expected models[] model list.");
}

export function parseOllamaTagsResponse(payload: OllamaTagsResponse, provider: ProviderConfigEntry): RawDiscoveredModel[] {
  const models = readOllamaModelEntries(payload);
  const ids = models
    .map((entry) => (isRecord(entry) && typeof entry.name === "string" ? entry.name : isRecord(entry) && typeof entry.model === "string" ? entry.model : undefined))
    .filter((id): id is string => Boolean(id));
  const allowedIds = new Set(applyModelFilters(ids, provider));
  return ids.filter((id) => allowedIds.has(id)).map((id) => ({ id }));
}

export async function discoverOllama(provider: ProviderConfigEntry): Promise<RawDiscoveredModel[]> {
  const endpointPath = provider.discovery.endpointPath ?? "/api/tags";
  const tagsResponse = await safeFetchJson<OllamaTagsResponse>(
    buildUrl(provider.baseUrl, endpointPath),
    { method: "GET", headers: buildDiscoveryHeaders(provider) },
    provider.discovery.timeoutMs,
  );
  if (!tagsResponse.ok || !tagsResponse.data) {
    throw new Error(tagsResponse.error ?? "Ollama tags discovery failed");
  }

  const models = parseOllamaTagsResponse(tagsResponse.data, provider);
  if (!provider.discovery.includeDetails) return models;

  const enriched: RawDiscoveredModel[] = [];
  for (let index = 0; index < models.length; index += OLLAMA_DETAILS_CONCURRENCY) {
    const batch = models.slice(index, index + OLLAMA_DETAILS_CONCURRENCY);
    enriched.push(
      ...(await Promise.all(
        batch.map(async (model) => {
          const showResponse = await safeFetchJson<OllamaShowResponse>(
            buildUrl(provider.baseUrl, "/api/show"),
            {
              method: "POST",
              headers: { "content-type": "application/json", ...buildDiscoveryHeaders(provider) },
              body: JSON.stringify({ model: model.id }),
            },
            provider.discovery.timeoutMs,
          );
          return { ...model, defaults: mapShowDefaults(showResponse.data) };
        }),
      )),
    );
  }
  return enriched;
}
