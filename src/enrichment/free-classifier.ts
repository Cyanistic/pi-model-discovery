import type { DiscoveredModel } from "../cache/types.js";

export interface FreeClassificationOptions {
  providerId?: string;
  wholeProviderFree?: boolean;
}

function hasPositiveCost(model: DiscoveredModel): boolean {
  return (model.cost.input ?? 0) > 0 || (model.cost.output ?? 0) > 0;
}

function hasZeroCost(model: DiscoveredModel): boolean {
  return model.cost.input === 0 && model.cost.output === 0;
}

function hasFreeNameOrIdSignal(model: DiscoveredModel): boolean {
  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  return id.endsWith(":free") || id.includes(":free/") || id.includes("free") || name.includes("free");
}

function hasKnownPricing(model: DiscoveredModel): boolean {
  if (model.endpointPricing?.isFree !== undefined) return true;
  const costProvenance = model.capabilityProvenance?.cost;
  if (costProvenance !== undefined && costProvenance !== "globalDefaults") return true;
  return model.sources.endpointPricing === true || model.sources.endpointDetails === true || model.sources.modelsDev === true;
}

function hasDefaultedUnknownPricing(model: DiscoveredModel): boolean {
  return model.sources.globalDefaults === true && model.capabilityProvenance?.cost === undefined && !hasKnownPricing(model);
}

function isKnownWholeProviderFree(options: FreeClassificationOptions): boolean {
  return options.wholeProviderFree === true;
}

/**
 * Self-contained adaptive free/paid heuristic inspired by C:\Repository\pi-free\lib\registry.ts
 * (`detectPricingExposed` + Route A/Route B concept). This extension intentionally does not
 * import or depend on pi-free at runtime.
 */
export function classifyFreeModels(models: DiscoveredModel[], options: FreeClassificationOptions = {}): DiscoveredModel[] {
  const pricingExposed = models.some(hasPositiveCost);
  const wholeProviderFree = isKnownWholeProviderFree(options);
  return models.map((model) => {
    if (model.isFree !== undefined) return model;
    const nameOrIdFree = hasFreeNameOrIdSignal(model);
    const zeroCost = hasZeroCost(model);
    const trustedZeroCost = zeroCost && (wholeProviderFree || !hasDefaultedUnknownPricing(model));
    const isFree = pricingExposed ? trustedZeroCost || nameOrIdFree : nameOrIdFree || (wholeProviderFree && zeroCost);
    return { ...model, isFree };
  });
}
