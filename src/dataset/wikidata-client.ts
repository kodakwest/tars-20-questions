import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Domain, RawWikidataEntity } from "./types";
import { DOMAIN_CONFIGS } from "./seed-config";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const CACHE_DIR = join(process.cwd(), ".cache", "wikidata");

type SparqlBinding = {
  item?: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  alias?: { value: string };
  aliases?: { value: string };
  instanceOf?: { value: string };
  instanceOfLabel?: { value: string };
  instanceOfValues?: { value: string };
  instanceOfLabels?: { value: string };
  sitelinks?: { value: string };
};

export async function fetchWikidataEntities(domain: Domain, limit: number): Promise<RawWikidataEntity[]> {
  const config = DOMAIN_CONFIGS[domain];
  const query = config.sparql(limit);
  const cachePath = join(CACHE_DIR, `${domain}-${limit}.json`);

  try {
    const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url, {
      headers: {
        accept: "application/sparql-results+json",
        "user-agent": "tars-20-questions-dataset-builder/0.1 (local script)"
      },
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      throw new Error(`Wikidata returned ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { results?: { bindings?: SparqlBinding[] } };
    const entities = normalizeBindings(json.results?.bindings ?? []);
    await writeJson(cachePath, entities);
    return entities;
  } catch (error) {
    const cached = await readCached(cachePath);
    if (cached) {
      console.warn(`Wikidata fetch failed for ${domain}; using cache ${cachePath}.`);
      console.warn(error instanceof Error ? error.message : String(error));
      return cached;
    }

    throw error;
  }
}

function normalizeBindings(bindings: SparqlBinding[]): RawWikidataEntity[] {
  const byQid = new Map<string, RawWikidataEntity>();

  for (const binding of bindings) {
    if (!binding.item?.value || !binding.itemLabel?.value) continue;

    const qid = binding.item.value.split("/").pop();
    if (!qid) continue;

    const current = byQid.get(qid) ?? {
      qid,
      uri: binding.item.value,
      label: binding.itemLabel.value,
      description: binding.itemDescription?.value,
      aliases: [],
      sitelinks: Number(binding.sitelinks?.value ?? 0),
      instanceOf: []
    };

    const aliases = binding.aliases?.value ? binding.aliases.value.split("|") : [binding.alias?.value].filter(Boolean);
    for (const alias of aliases) {
      if (alias && !current.aliases.includes(alias)) current.aliases.push(alias);
    }

    const instanceValues = binding.instanceOfValues?.value ? binding.instanceOfValues.value.split("|") : [binding.instanceOf?.value].filter(Boolean);
    const instanceLabels = binding.instanceOfLabels?.value ? binding.instanceOfLabels.value.split("|") : [binding.instanceOfLabel?.value].filter(Boolean);
    for (let index = 0; index < instanceValues.length; index += 1) {
      const id = instanceValues[index]?.split("/").pop();
      const label = instanceLabels[index] ?? id;
      if (id && label && !current.instanceOf.some((instance) => instance.id === id)) {
        current.instanceOf.push({ id, label });
      }
    }

    byQid.set(qid, current);
  }

  return Array.from(byQid.values());
}

async function readCached(cachePath: string) {
  try {
    return JSON.parse(await readFile(cachePath, "utf8")) as RawWikidataEntity[];
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
