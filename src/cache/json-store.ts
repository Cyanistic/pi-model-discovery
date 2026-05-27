import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CacheSchema } from "./types.js";

export const CACHE_SCHEMA_VERSION = 5;

export function createEmptyCache(now = new Date()): CacheSchema {
  return {
    version: CACHE_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    providers: {},
  };
}

function isCacheSchema(value: unknown): value is CacheSchema {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CacheSchema>;
  return candidate.version === CACHE_SCHEMA_VERSION && Boolean(candidate.providers) && typeof candidate.providers === "object";
}

export function readCacheFile(cachePath: string): CacheSchema {
  if (!existsSync(cachePath)) return createEmptyCache();
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8")) as unknown;
    return isCacheSchema(parsed) ? parsed : createEmptyCache();
  } catch {
    try {
      rmSync(cachePath, { force: true });
    } catch {
      // Cache invalidation failure should not block discovery.
    }
    return createEmptyCache();
  }
}

export async function writeCacheFile(cachePath: string, cache: CacheSchema): Promise<void> {
  const tempPath = `${cachePath}.${randomUUID()}.tmp`;
  const content = `${JSON.stringify({ ...cache, updatedAt: new Date().toISOString() }, null, 2)}\n`;
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(tempPath, content, { encoding: "utf-8", mode: 0o600 });
    await rename(tempPath, cachePath);
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Temporary cache cleanup failure should not hide the original write failure.
    }
    throw error;
  }
}

export function invalidateCacheFile(cachePath: string): void {
  rmSync(cachePath, { force: true });
}
