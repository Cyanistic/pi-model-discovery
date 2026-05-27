import type { CapabilityProvenance } from "../cache/types.js";

export function recordCapabilityProvenance(
  provenance: CapabilityProvenance | undefined,
  field: keyof CapabilityProvenance,
  source: string,
): CapabilityProvenance {
  return {
    ...(provenance ?? {}),
    [field]: source,
  };
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
