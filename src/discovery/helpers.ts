import type { ProviderConfigEntry } from "../config/types.js";

export interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function buildUrl(baseUrl: string, endpointPath: string): string {
  if (/^https?:\/\//i.test(endpointPath)) return endpointPath;
  const base = baseUrl.replace(/\/+$/g, "");
  const path = trimSlashes(endpointPath);
  return path ? `${base}/${path}` : base;
}

export function buildDiscoveryHeaders(provider: ProviderConfigEntry): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...provider.headers,
    ...provider.discovery.headers,
  };
  if (provider.authHeader && !Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
    headers.authorization = `Bearer ${provider.apiKey}`;
  }
  return headers;
}

export async function safeFetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<FetchJsonResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/(^|[;\s])application\/json\b|\+json\b/.test(contentType)) {
      return { ok: false, status: response.status, error: `expected JSON response but received ${contentType}` };
    }
    return { ok: true, status: response.status, data: (await response.json()) as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    const isAbort = error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
    return { ok: false, status: 0, error: isAbort ? `request timed out after ${timeoutMs}ms` : message };
  } finally {
    clearTimeout(timeout);
  }
}

export function applyModelFilters(modelIds: string[], provider: ProviderConfigEntry): string[] {
  const allow = provider.discovery.allowModels;
  const block = provider.discovery.blockModels;
  const allowed = allow.length > 0 ? modelIds.filter((id) => allow.some((pattern) => id.includes(pattern))) : modelIds;
  const filtered = block.length > 0 ? allowed.filter((id) => !block.some((pattern) => id.includes(pattern))) : allowed;
  const unique = Array.from(new Set(filtered));
  return provider.maxModels !== undefined ? unique.slice(0, provider.maxModels) : unique;
}
