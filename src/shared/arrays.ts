export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function readPositiveNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}
