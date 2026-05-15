import { ATTRIBUTE_BY_KEY } from "./attribute-taxonomy";
import type { AttributeAssertion, Category, Domain, NormalizedEntity, RawWikidataEntity } from "./types";

const FICTIONAL_INSTANCE_IDS = new Set(["Q95074", "Q188784", "Q21083345", "Q15632617"]);
const CITY_INSTANCE_IDS = new Set(["Q515", "Q5119", "Q3957"]);
const NATURAL_PLACE_INSTANCE_IDS = new Set(["Q5107", "Q8502", "Q46831", "Q23442", "Q9259"]);
const OBJECT_INSTANCE_IDS = new Set(["Q3966", "Q42889", "Q7366", "Q39546", "Q11470", "Q11641"]);

export function normalizeEntity(raw: RawWikidataEntity, domain: Domain): NormalizedEntity {
  const id = `wd:${raw.qid}`;
  const categories = raw.instanceOf.map((instance): Category => ({
    id: `cat:${slugify(instance.label || instance.id)}`,
    name: instance.label || instance.id,
    sourceRefs: { wikidataId: instance.id }
  }));

  return {
    id,
    wikidataQid: raw.qid,
    canonicalName: raw.label,
    domain,
    description: raw.description,
    aliases: raw.aliases.filter((alias) => alias !== raw.label).slice(0, 20),
    popularityPrior: popularityPrior(raw.sitelinks),
    sourceRefs: {
      wikidata: raw.uri,
      qid: raw.qid,
      sitelinks: raw.sitelinks
    },
    categories,
    assertions: directAssertions(id, domain, raw)
  };
}

function directAssertions(entityId: string, domain: Domain, raw: RawWikidataEntity): AttributeAssertion[] {
  const instanceIds = new Set(raw.instanceOf.map((instance) => instance.id));
  const assertions: AttributeAssertion[] = [];
  const isFictional = intersects(instanceIds, FICTIONAL_INSTANCE_IDS) || textHas((raw.description ?? "").toLowerCase(), ["fictional", "mythical"]);

  if (domain === "character") {
    push(assertions, entityId, "is_character", "yes", 0.95, raw);
    push(assertions, entityId, "is_fictional", isFictional ? "yes" : "unknown", 0.9, raw);
    push(assertions, entityId, "is_real", isFictional ? "no" : "unknown", 0.75, raw);
  }

  if (domain === "object") {
    push(assertions, entityId, "is_object", "yes", 0.95, raw);
    push(assertions, entityId, "is_real", isFictional ? "no" : "yes", isFictional ? 0.7 : 0.6, raw);
    push(assertions, entityId, "is_fictional", isFictional ? "yes" : "unknown", 0.7, raw);
    push(assertions, entityId, "is_tool_or_device", intersects(instanceIds, OBJECT_INSTANCE_IDS) ? "kind_of" : "unknown", 0.65, raw);
  }

  if (domain === "place") {
    push(assertions, entityId, "is_place", "yes", 0.95, raw);
    push(assertions, entityId, "is_real", isFictional ? "no" : "yes", isFictional ? 0.7 : 0.7, raw);
    push(assertions, entityId, "is_fictional", isFictional ? "yes" : "unknown", 0.7, raw);
    push(assertions, entityId, "is_city_or_settlement", intersects(instanceIds, CITY_INSTANCE_IDS) ? "yes" : "unknown", 0.85, raw);
    push(assertions, entityId, "is_natural_place", intersects(instanceIds, NATURAL_PLACE_INSTANCE_IDS) ? "yes" : "unknown", 0.8, raw);
  }

  if (raw.description) {
    const description = raw.description.toLowerCase();
    push(assertions, entityId, "is_fictional", textHas(description, ["fictional", "mythical"]) ? "yes" : "unknown", 0.7, raw);
    push(assertions, entityId, "from_video_game", textHas(description, ["video game", "game character"]) ? "yes" : "unknown", 0.75, raw);
    push(assertions, entityId, "from_movie", textHas(description, ["film", "movie"]) ? "yes" : "unknown", 0.65, raw);
    push(assertions, entityId, "from_tv", textHas(description, ["television", "tv series"]) ? "yes" : "unknown", 0.65, raw);
    push(assertions, entityId, "from_book", textHas(description, ["novel", "book", "literary"]) ? "yes" : "unknown", 0.65, raw);
    push(assertions, entityId, "from_comic", textHas(description, ["comic"]) ? "yes" : "unknown", 0.65, raw);
  }

  return dedupeAssertions(assertions).filter((assertion) => assertion.value !== "unknown");
}

function push(
  assertions: AttributeAssertion[],
  entityId: string,
  attributeKey: string,
  value: AttributeAssertion["value"],
  confidence: number,
  raw: RawWikidataEntity
) {
  const definition = ATTRIBUTE_BY_KEY.get(attributeKey);
  if (!definition) return;
  assertions.push({
    entityId,
    attributeId: definition.id,
    attributeKey,
    value,
    confidence,
    sourceType: "wikidata",
    sourceRefs: {
      qid: raw.qid,
      wikidata: raw.uri
    },
    reviewStatus: "unreviewed"
  });
}

function dedupeAssertions(assertions: AttributeAssertion[]) {
  const byKey = new Map<string, AttributeAssertion>();
  for (const assertion of assertions) {
    const previous = byKey.get(assertion.attributeKey);
    if (!previous || assertion.confidence > previous.confidence) {
      byKey.set(assertion.attributeKey, assertion);
    }
  }
  return Array.from(byKey.values());
}

function popularityPrior(sitelinks: number) {
  return Math.max(0.05, Math.min(0.99, Math.log10(sitelinks + 1) / 3));
}

function intersects(values: Set<string>, targets: Set<string>) {
  for (const value of values) {
    if (targets.has(value)) return true;
  }
  return false;
}

function textHas(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
