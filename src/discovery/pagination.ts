import type { DiscoveryPaginationConfig } from "../config/types.js";
import { isRecord } from "../shared/validation.js";

export interface PaginationState {
  hasMore: boolean;
  nextCursor?: string;
}

function readPath(payload: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function appendPaginationCursor(url: string, cursorParam: string, cursor: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(cursorParam, cursor);
  return parsed.toString();
}

export function readPaginationState(payload: unknown, pagination: DiscoveryPaginationConfig): PaginationState {
  const rawHasMore = readPath(payload, pagination.hasMoreField);
  const rawNextCursor = readPath(payload, pagination.nextCursorField);
  const nextCursor = typeof rawNextCursor === "string" && rawNextCursor.length > 0 ? rawNextCursor : undefined;

  if (typeof rawHasMore === "boolean") {
    return { hasMore: rawHasMore, nextCursor };
  }

  return { hasMore: nextCursor !== undefined, nextCursor };
}
