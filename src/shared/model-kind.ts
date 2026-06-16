import type { DiscoveredModel } from "../cache/types.js";
import type { ProviderConfigEntry } from "../config/types.js";

const NON_TEXT_GENERATION_MODEL_PATTERNS = [
  /(^|[\s/:_.-])gpt-image(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])dall-e(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])imagen(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])nano-banana(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])(?:flux|kolors|seedream|hidream|recraft|ideogram|midjourney|cogview|sora)(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])grok-imagine(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])(?:embed|embedding|rerank|reranker|bge)(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])bce-(?:embedding|reranker)(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])(?:ocr|paddleocr|parse)(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])(?:tts|stt|whisper|audio|music|translate)(?:$|[\s/:_.-]|\d)/i,
  /(^|[\s/:_.-])(?:video|cogvideo)(?:$|[\s/:_.-]|\d)/i,
];

function modelIdentity(model: Pick<DiscoveredModel, "id" | "name">): string {
  return `${model.id} ${model.name ?? ""}`;
}

export function isLikelyNonTextGenerationModel(model: Pick<DiscoveredModel, "id" | "name">): boolean {
  const identity = modelIdentity(model);
  return NON_TEXT_GENERATION_MODEL_PATTERNS.some((pattern) => pattern.test(identity));
}

export function isTextCompletionModel(provider: ProviderConfigEntry, model: DiscoveredModel): boolean {
  if (provider.api !== "openai-completions") return true;
  if (model.output !== undefined && !model.output.includes("text")) return false;
  return !isLikelyNonTextGenerationModel(model);
}
