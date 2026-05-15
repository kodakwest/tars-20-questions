import { attributesForDomain } from "./attribute-taxonomy";
import type { AttributeAssertion, NormalizedEntity } from "./types";

type LLMResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type EnrichmentPayload = {
  assertions?: Array<{
    attribute_key?: string;
    value?: string;
    confidence?: number;
  }>;
};

// Provider-agnostic config: set env vars to point at any OpenAI-compatible API
//   LLM_BASE_URL  — default: https://opencode.ai/zen/go/v1/chat/completions
//   LLM_API_KEY   — your API key
//   LLM_MODEL     — default: deepseek-v4-flash
const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";

export function enrichConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.LLM_API_KEY || "",
    model: process.env.LLM_MODEL || DEFAULT_MODEL
  };
}

export async function enrichEntity(entity: NormalizedEntity): Promise<AttributeAssertion[]> {
  const config = enrichConfig();
  if (!config.apiKey) return [];

  const missingAttributes = attributesForDomain(entity.domain).filter(
    (definition) => !entity.assertions.some((assertion) => assertion.attributeKey === definition.key)
  );
  if (missingAttributes.length === 0) return [];

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "You enrich 20 Questions datasets. Return JSON only — no markdown, no code fences."
          },
          {
            role: "user",
            content: buildPrompt(entity, missingAttributes)
          }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`LLM enrichment API returned ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as LLMResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];

    const cleaned = stripMarkdownFences(content);
    return parseEnrichment(entity, cleaned, config.model);
  } catch (error) {
    console.warn(`LLM enrichment skipped for ${entity.id}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function stripMarkdownFences(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  return jsonMatch?.[1]?.trim() || content.trim();
}

function buildPrompt(entity: NormalizedEntity, attributes: ReturnType<typeof attributesForDomain>) {
  return `You are enriching a 20 Questions dataset. For each entity, infer gameplay attribute values.

Domain: ${entity.domain}
Entity: ${entity.canonicalName}
Description: ${entity.description ?? "No description"}

Answer with JSON only:
{
  "assertions": [
    {"attribute_key": "is_fictional", "value": "yes"|"no"|"kind_of", "confidence": 0.0-1.0}
  ]
}

Available attributes for ${entity.domain}:
${attributes.map((attribute) => `- ${attribute.key}: ${attribute.description}`).join("\n")}`;
}

function parseEnrichment(entity: NormalizedEntity, content: string, modelName: string): AttributeAssertion[] {
  const parsed = JSON.parse(content) as EnrichmentPayload;
  const definitions = new Map(attributesForDomain(entity.domain).map((definition) => [definition.key, definition]));
  const existing = new Set(entity.assertions.map((assertion) => assertion.attributeKey));
  const assertions: AttributeAssertion[] = [];

  for (const assertion of parsed.assertions ?? []) {
    if (!assertion.attribute_key || existing.has(assertion.attribute_key)) continue;
    const definition = definitions.get(assertion.attribute_key);
    if (!definition) continue;
    if (!isAssertionValue(assertion.value)) continue;

    assertions.push({
      entityId: entity.id,
      attributeId: definition.id,
      attributeKey: definition.key,
      value: assertion.value,
      confidence: Math.min(0.7, Math.max(0.35, assertion.confidence ?? 0.55)),
      sourceType: "llm_enriched",
      sourceRefs: {
        model: modelName,
        provider: configProvider()
      },
      reviewStatus: "unreviewed"
    });
  }

  return assertions;
}

function configProvider(): string {
  const url = process.env.LLM_BASE_URL || "";
  if (url.includes("opencode")) return "opencode";
  if (url.includes("openrouter")) return "openrouter";
  return "custom";
}

function isAssertionValue(value: unknown): value is AttributeAssertion["value"] {
  return value === "yes" || value === "no" || value === "kind_of" || value === "unknown";
}
