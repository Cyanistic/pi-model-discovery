# pi-model-discovery

`pi-model-discovery` is a Pi extension that discovers provider models, enriches metadata, caches results, and registers them dynamically with `pi.registerProvider()` for `/scoped-models` and the `/pi-model-discovery` catalog.

## Features

- Auto-imports eligible provider definitions from `agent/models.json` and active API-key credentials from `agent/auth.json`.
- Uses built-in read-only discovery profiles for supported auth-only providers such as NVIDIA, Cloudflare Workers AI, Cerebras, Qwen, Xiaomi, Cline, and Kilo.
- Discovers OpenAI-compatible, Ollama, Anthropic-compatible, OpenAI Responses, LM Studio, llama.cpp, and static provider catalogs.
- Enriches discovered models with metadata from supported catalog sources and preserves free/paid classification as best-effort metadata.
- Registers cached models synchronously on startup/reload, then refreshes stale providers in the background.
- Writes optional debug logs only to `debug/debug.log` under this extension directory when `debug` is enabled.

## Installation

### npm package

```bash
pi install npm:pi-model-discovery
```

### Git repository

```bash
pi install git:github.com/MasuRii/pi-model-discovery
```

### Local extension folder

Place this folder in one of Pi's extension discovery paths:

```text
~/.pi/agent/extensions/pi-model-discovery
.pi/extensions/pi-model-discovery
```

Pi discovers the extension through the root `index.ts` entry listed in `package.json`.

## Usage

Open the cached/discovered model catalog in interactive TUI mode:

```text
/pi-model-discovery
```

The catalog shows provider cache freshness, authoritative fallback state, search/filter controls, and discovered model metadata. Models registered by other runtime providers can appear alongside models known to `pi-model-discovery`.

## Configuration

Runtime configuration lives in `config.json` at the extension root. A starter template is included at `config/config.example.json`.

By default, `config.json` can leave `providers` empty. With `autoImport.enabled` set to `true` (the default), the extension reads active credentials from `agent/auth.json`, reuses provider metadata from `agent/models.json` when available, falls back to built-in read-only model-list profiles, and skips unsupported/OAuth/missing-auth entries with redacted debug diagnostics only when `debug` is enabled.

Manual `providers` remain supported for custom endpoints or overrides. Explicit providers take precedence over auto-imported providers with the same ID. Keep manual secrets in environment variables with `${ENV_VAR}` references; do not place raw keys in config files. `debug` defaults to `false`; when enabled, logs are written only to `debug/debug.log` in this extension directory.

`baseUrl` values are validated before any network request. Use `https:` for remote providers; `http:` is accepted only for localhost/127.x development endpoints such as Ollama, LM Studio, or local proxies. URLs with credentials, query strings, fragments, or known metadata-service hosts are rejected.

Use `providers[].discovery.allowModels` and `providers[].discovery.blockModels` as substring filters on discovered model IDs. Discovery is uncapped by default; set top-level `maxModels` or `providers[].maxModels` only when you want an explicit positive model limit. Use `providers[].modelDefaults` for explicit per-model metadata overrides and `providers[].fallbackModelIds` when a provider should still register known models after discovery fails and no cache exists.

Provider IDs are a compatibility decision:

- Provider IDs with user credentials owned by Pi Mono remain Pi Mono-managed and are not auto-imported for duplicate ownership. Explicit providers still use this extension config.
- New provider IDs are isolated and use the API key supplied in this extension config.

Discovered model IDs are preserved exactly as returned by endpoints, so enabled model patterns use `providerId/modelId`. Before dynamic registration, optional Pi built-in model data is filtered by exact and provider-canonical IDs so `pi-model-discovery` does not register duplicate models already supplied by Pi built-ins.

`registration.importMode` defaults to `replace` for backward compatibility on non-managed providers. Providers owned by pi-multi-auth default to merge behavior during explicit ownership conflicts so credential ownership remains with pi-multi-auth. Advanced callers can use `merge` to preserve stale `pi-model-discovery` entries and manual model overrides, or `sync` to remove stale `pi-model-discovery` entries while still preserving manual entries and overrides.

## Runtime behavior

- Registers fresh cached models synchronously on `session_start` and `resources_discover` (`/reload`).
- Suppresses live discovery while an authoritative cache entry is within its provider TTL, and backs off for five minutes after non-authoritative discovery failures.
- Debounces concurrent background refreshes and re-registers changed providers after discovery.
- Honors `PI_MODEL_DISCOVERY_CACHE_ONLY=1` for delegated/cache-only runtimes: cached entries, including stale entries, can register without starting background discovery or catalog HTTP requests.
- Uses `cache.json` in this extension directory and never writes `agent/models.json`.
- Never calls `ModelRegistry.refresh()` because that would clear dynamically registered models.

## Development

```bash
npm install
npm run check
npm run package:dry-run
```

`config.schema.json` documents the supported configuration surface. `cache.json`, `config.json`, `debug/`, `dist/`, and `node_modules/` are intentionally excluded from release packaging.

## Compatibility notes

Pi extension discovery uses `fs.readdirSync()` in the local Pi loader without an explicit sort. On common filesystems this is usually alphabetical, but synchronous cache-first registration avoids relying solely on load order. Discovered models that match pi-fast-mode globs are eligible for fast-mode.
