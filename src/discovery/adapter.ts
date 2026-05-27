import type { DiscoveryType, ProviderConfigEntry } from "../config/types.js";
import type { RawDiscoveredModel } from "./types.js";

export interface DiscoveryAdapter {
  readonly type: DiscoveryType;
  discover(provider: ProviderConfigEntry): Promise<RawDiscoveredModel[]>;
}

const adapters = new Map<DiscoveryType, DiscoveryAdapter>();

export function registerDiscoveryAdapter(adapter: DiscoveryAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getDiscoveryAdapter(type: DiscoveryType): DiscoveryAdapter | undefined {
  return adapters.get(type);
}
