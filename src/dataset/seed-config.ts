import type { Domain } from "./types";

export type DomainSeedConfig = {
  domain: Domain;
  sparql: (limit: number) => string;
};

const wikibasePrefix = `
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
`;

export const DOMAIN_CONFIGS: Record<Domain, DomainSeedConfig> = {
  character: {
    domain: "character",
    sparql: (limit) => `${wikibasePrefix}
SELECT ?item ?itemLabel ?itemDescription ?sitelinks
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?instanceOf; separator="|") AS ?instanceOfValues)
       (GROUP_CONCAT(DISTINCT ?instanceOfLabel; separator="|") AS ?instanceOfLabels)
WHERE {
  {
    SELECT ?item ?sitelinks WHERE {
      VALUES ?type { wd:Q95074 wd:Q188784 wd:Q21083345 wd:Q15632617 }
      ?item wdt:P31 ?type.
      ?item wikibase:sitelinks ?sitelinks.
    }
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P31 ?instanceOf. }
  OPTIONAL { ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?itemDescription. FILTER(LANG(?itemDescription) = "en") }
  OPTIONAL { ?instanceOf rdfs:label ?instanceOfLabel. FILTER(LANG(?instanceOfLabel) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias. FILTER(LANG(?alias) = "en") }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks`
  },
  object: {
    domain: "object",
    sparql: (limit) => `${wikibasePrefix}
SELECT ?item ?itemLabel ?itemDescription ?sitelinks
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?instanceOf; separator="|") AS ?instanceOfValues)
       (GROUP_CONCAT(DISTINCT ?instanceOfLabel; separator="|") AS ?instanceOfLabels)
WHERE {
  {
    SELECT ?item ?sitelinks WHERE {
      VALUES ?type { wd:Q3966 wd:Q42889 wd:Q7366 wd:Q39546 wd:Q11470 wd:Q11641 }
      ?item wdt:P31 ?type.
      ?item wikibase:sitelinks ?sitelinks.
    }
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P31 ?instanceOf. }
  OPTIONAL { ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?itemDescription. FILTER(LANG(?itemDescription) = "en") }
  OPTIONAL { ?instanceOf rdfs:label ?instanceOfLabel. FILTER(LANG(?instanceOfLabel) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias. FILTER(LANG(?alias) = "en") }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks`
  },
  place: {
    domain: "place",
    sparql: (limit) => `${wikibasePrefix}
SELECT ?item ?itemLabel ?itemDescription ?sitelinks
       (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?instanceOf; separator="|") AS ?instanceOfValues)
       (GROUP_CONCAT(DISTINCT ?instanceOfLabel; separator="|") AS ?instanceOfLabels)
WHERE {
  {
    SELECT ?item ?sitelinks WHERE {
      VALUES ?type { wd:Q5107 wd:Q515 wd:Q7075 wd:Q23442 wd:Q9259 }
      ?item wdt:P31 ?type.
      ?item wikibase:sitelinks ?sitelinks.
    }
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P31 ?instanceOf. }
  OPTIONAL { ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?itemDescription. FILTER(LANG(?itemDescription) = "en") }
  OPTIONAL { ?instanceOf rdfs:label ?instanceOfLabel. FILTER(LANG(?instanceOfLabel) = "en") }
  OPTIONAL { ?item skos:altLabel ?alias. FILTER(LANG(?alias) = "en") }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks`
  }
};

export const ALL_DOMAINS: Domain[] = ["character", "object", "place"];
