export const CATALOG_LOOKUP_PREFIX_PATTERN = /^(route:|scanner\/)/i;
export const CATALOG_VARIANT_SUFFIX_SEGMENTS = new Set(["fast", "highspeed", "image", "search", "test", "thinking", "video"]);

export function stripCatalogLookupPrefix(value: string): string {
  return value.trim().replace(CATALOG_LOOKUP_PREFIX_PATTERN, "");
}

export function normalizeCatalogIdentity(value: string): string {
  return stripCatalogLookupPrefix(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function catalogVariantCombinationLookupIds(id: string): string[] {
  const segments = id.split("-");
  let variantStart = segments.length;
  while (variantStart > 0 && CATALOG_VARIANT_SUFFIX_SEGMENTS.has(segments[variantStart - 1]?.toLowerCase() ?? "")) {
    variantStart -= 1;
  }
  if (variantStart === segments.length || variantStart === 0) return [];

  const baseSegments = segments.slice(0, variantStart);
  const variantSegments = segments.slice(variantStart);
  const aliases: string[] = [];
  const totalMasks = 1 << variantSegments.length;

  for (let mask = 0; mask < totalMasks - 1; mask += 1) {
    const keptVariants = variantSegments.filter((_segment, index) => (mask & (1 << index)) !== 0);
    const alias = [...baseSegments, ...keptVariants].join("-");
    if (alias && alias !== id) aliases.push(alias);
  }
  return aliases;
}

export function catalogTrailingVariantLookupIds(value: string): string[] {
  const segments = stripCatalogLookupPrefix(value).split(/[-_\s]+/).filter(Boolean);
  const aliases: string[] = [];
  while (segments.length > 1 && CATALOG_VARIANT_SUFFIX_SEGMENTS.has(segments.at(-1)?.toLowerCase() ?? "")) {
    segments.pop();
    aliases.push(segments.join("-"));
  }
  return aliases;
}
