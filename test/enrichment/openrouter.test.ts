import test from "node:test";
import assert from "node:assert/strict";

import { buildOpenRouterLookup } from "../../src/enrichment/openrouter.js";
import { buildModelsDevLookup, mergeModelsDevLookups, type ModelsDevLookup } from "../../src/enrichment/models-dev.js";

test("OpenRouter lookup maps catalog pricing, modalities, capabilities, and provider aliases", () => {
  const lookup = buildOpenRouterLookup({
    data: [
      {
        id: "anthropic/claude-3.5-sonnet",
        canonical_slug: "claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        context_length: 200_000,
        architecture: {
          input_modalities: ["text", "image", "file", "audio", "video"],
          output_modalities: ["text", "image", "audio", "unknown"],
        },
        supported_parameters: ["tools", "structured_outputs", "temperature", "include_reasoning"],
        pricing: {
          prompt: "0.000003",
          completion: "0.000015",
          input_cache_read: "0.0000003",
          input_cache_write: "0.00000375",
        },
        top_provider: {
          max_completion_tokens: 8192,
        },
      },
    ],
  });

  const canonical = lookup.get("anthropic/claude-3.5-sonnet");
  const providerAlias = lookup.get("anthropic:claude-3.5-sonnet");

  assert.deepEqual(
    {
      name: canonical?.name,
      input: canonical?.input,
      output: canonical?.output,
      capabilities: canonical?.capabilities,
      cost: canonical?.cost,
      contextWindow: canonical?.contextWindow,
      maxTokens: canonical?.maxTokens,
      providerAliasCanonicalId: providerAlias?.canonicalId,
      providerAliasProvider: providerAlias?.providerMapping?.provider,
      catalogSources: canonical?.catalogSources,
    },
    {
      name: "Claude 3.5 Sonnet",
      input: ["text", "image"],
      output: ["text", "image", "audio"],
      capabilities: {
        attachments: true,
        audioInput: true,
        reasoningControls: true,
        structuredOutputs: true,
        temperature: true,
        toolCalling: true,
        videoInput: true,
      },
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200_000,
      maxTokens: 8192,
      providerAliasCanonicalId: "anthropic/claude-3.5-sonnet",
      providerAliasProvider: "anthropic",
      catalogSources: ["openrouter"],
    },
  );
});

test("merged catalog lookups preserve existing metadata while combining sources and equivalents", () => {
  const primary = buildModelsDevLookup(
    {
      models: {
        "provider/model": {
          id: "provider/model",
          name: "Primary Name",
          aliases: ["model-primary"],
          cost: { input: 1 },
          capabilities: { tool_calling: true },
        },
      },
    },
    "models.dev",
  );
  const secondary = buildModelsDevLookup(
    {
      models: {
        "provider/model": {
          id: "provider/model",
          name: "Secondary Name",
          aliases: ["model-secondary"],
          cost: { output: 2 },
          capabilities: { streaming: true },
        },
      },
    },
    "openrouter",
  );

  const merged = mergeModelsDevLookups([primary, secondary]) as ModelsDevLookup;
  const metadata = merged.get("provider/model");

  assert.deepEqual(
    {
      name: metadata?.name,
      cost: metadata?.cost,
      capabilities: metadata?.capabilities,
      equivalentIds: metadata?.equivalentIds,
      catalogSources: metadata?.catalogSources,
    },
    {
      name: "Primary Name",
      cost: { input: 1, output: 2 },
      capabilities: { streaming: true, toolCalling: true },
      equivalentIds: ["model-primary", "model-secondary"],
      catalogSources: ["models.dev", "openrouter"],
    },
  );
});
