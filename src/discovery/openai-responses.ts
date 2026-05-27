import type { ProviderConfigEntry } from "../config/types.js";
import { discoverOpenAICompat } from "./openai-compat.js";
import type { RawDiscoveredModel } from "./types.js";

export async function discoverOpenAIResponses(provider: ProviderConfigEntry): Promise<RawDiscoveredModel[]> {
  return discoverOpenAICompat(provider);
}
