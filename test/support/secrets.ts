import { randomUUID } from "node:crypto";

export function createTestApiKey(label: string): string {
  return `${label}-${randomUUID()}`;
}
