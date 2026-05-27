import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

import type { DiscoveryDefaults, ProviderConfigEntry } from "../config/types.js";

export interface EndpointPricingMetadata {
  isFree?: boolean;
  isPremium?: boolean;
  requiredPlan?: string;
  minPlanTier?: number | string;
  multiplier?: number;
}

export interface EndpointTaskMetadata {
  id?: string;
  name?: string;
  description?: string;
}

export interface CloudflareEndpointMetadata {
  source?: number;
  task?: EndpointTaskMetadata;
  infoUrl?: string;
  termsUrl?: string;
  beta?: boolean;
  lora?: boolean;
  asyncQueue?: boolean;
  plannedDeprecationDate?: string;
  maxInputLength?: number;
  maxTotalTokens?: number;
  maxBatchPrefillTokens?: number;
}

export interface EndpointModelMetadata {
  object?: string;
  providerId?: string;
  routingGroup?: string;
  status?: string;
  type?: string;
  poolSize?: number;
  rateLimitRpm?: number;
  responseBaseUrl?: string;
  cloudflare?: CloudflareEndpointMetadata;
}

export interface RawDiscoveredModel {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  ownedBy?: string;
  tags?: string[];
  defaults?: DiscoveryDefaults;
  catalogLookupIds?: string[];
  endpointPricing?: EndpointPricingMetadata;
  endpointMetadata?: EndpointModelMetadata;
  providerModelConfig?: Pick<ProviderModelConfig, "id" | "name" | "api">;
}

export interface DiscoveryProviderContract {
  id: string;
  api: ProviderConfigEntry["api"];
  baseUrl: string;
  source: ProviderConfigEntry["source"];
  credentialRef: "extension-config" | "agent-auth-json";
}

export interface DiscoveryCompatibilityContract {
  providerModelConfig: "compatible";
  modelsJson: "compatible";
  piMultiAuth: "compatible";
}

export interface RawDiscoveryResult {
  contractVersion: 1;
  provider: DiscoveryProviderContract;
  sourceProvider: ProviderConfigEntry;
  models: RawDiscoveredModel[];
  authoritative: boolean;
  warnings: string[];
  compatibility: DiscoveryCompatibilityContract;
}
