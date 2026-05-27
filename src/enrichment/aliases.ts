export interface AliasAmbiguity {
  alias: string;
  candidates: string[];
  source: string;
}

export interface AliasTarget<T> {
  key: string;
  canonicalId: string;
  metadata: T;
}

export interface AliasIndex<T> {
  aliases: Map<string, AliasTarget<T>>;
  ambiguities: AliasAmbiguity[];
}

export function buildAliasIndex<T>(targets: AliasTarget<T>[], source: string): AliasIndex<T> {
  const candidatesByAlias = new Map<string, AliasTarget<T>[]>();
  for (const target of targets) {
    const existing = candidatesByAlias.get(target.key) ?? [];
    existing.push(target);
    candidatesByAlias.set(target.key, existing);
  }

  const aliases = new Map<string, AliasTarget<T>>();
  const ambiguities: AliasAmbiguity[] = [];
  for (const [alias, candidates] of candidatesByAlias) {
    const uniqueCanonicalIds = Array.from(new Set(candidates.map((candidate) => candidate.canonicalId)));
    if (uniqueCanonicalIds.length > 1) {
      ambiguities.push({ alias, candidates: uniqueCanonicalIds, source });
      continue;
    }
    const [candidate] = candidates;
    if (candidate) aliases.set(alias, candidate);
  }

  return { aliases, ambiguities };
}
