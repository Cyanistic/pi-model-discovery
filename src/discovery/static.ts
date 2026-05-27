import type { ProviderConfigEntry } from "../config/types.js";
import { applyModelFilters } from "./helpers.js";
import type { RawDiscoveredModel } from "./types.js";

export async function discoverStaticModels(provider: ProviderConfigEntry): Promise<RawDiscoveredModel[]> {
  const modelIds = applyModelFilters(provider.fallbackModelIds ?? [], provider);
  if (modelIds.length === 0) {
    throw new Error(`Static discovery provider '${provider.id}' has no static model IDs configured.`);
  }
  return modelIds.map((id) => ({ id }));
}
