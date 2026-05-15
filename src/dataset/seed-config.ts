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
PREFIX hint: <http://www.bigdata.com/queryHints#>
SELECT ?item ?itemLabel ?itemDescription ?sitelinks
       (SAMPLE("") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?instanceOf; separator="|") AS ?instanceOfValues)
       (GROUP_CONCAT(DISTINCT ?instanceOfLabel; separator="|") AS ?instanceOfLabels)
WHERE {
  hint:Query hint:optimizer "None".
  VALUES ?item {
    wd:Q6607 wd:Q5994 wd:Q8355 wd:Q11404 wd:Q8338
    wd:Q11442 wd:Q197 wd:Q870 wd:Q35872 wd:Q15783
    wd:Q18545 wd:Q5372 wd:Q571 wd:Q14674 wd:Q127956 wd:Q25294
    wd:Q8075 wd:Q208103 wd:Q17240 wd:Q203788 wd:Q476850
  }
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks > 50)
  OPTIONAL { ?item wdt:P31 ?instanceOf. }
  OPTIONAL { ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?itemDescription. FILTER(LANG(?itemDescription) = "en") }
  OPTIONAL { ?instanceOf rdfs:label ?instanceOfLabel. FILTER(LANG(?instanceOfLabel) = "en") }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks
LIMIT ${limit}`
  },
  place: {
    domain: "place",
    sparql: (limit) => `${wikibasePrefix}
PREFIX hint: <http://www.bigdata.com/queryHints#>
SELECT ?item ?itemLabel ?itemDescription ?sitelinks
       (SAMPLE("") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?instanceOf; separator="|") AS ?instanceOfValues)
       (GROUP_CONCAT(DISTINCT ?instanceOfLabel; separator="|") AS ?instanceOfLabels)
WHERE {
  hint:Query hint:optimizer "None".
  VALUES ?item {
    wd:Q84 wd:Q90 wd:Q60 wd:Q1490 wd:Q220 wd:Q956 wd:Q85 wd:Q3130 wd:Q649 wd:Q8678
    wd:Q513 wd:Q43512 wd:Q7296 wd:Q1374 wd:Q3392 wd:Q3783 wd:Q1497 wd:Q5413 wd:Q1653
    wd:Q1019 wd:Q223 wd:Q189 wd:Q782 wd:Q351 wd:Q180402 wd:Q220289
    wd:Q243 wd:Q12501 wd:Q9141 wd:Q10285 wd:Q676203 wd:Q39671 wd:Q12495 wd:Q44440 wd:Q45178 wd:Q43473
    wd:Q142 wd:Q183 wd:Q17 wd:Q155 wd:Q668 wd:Q79 wd:Q30 wd:Q16 wd:Q408
    wd:Q5505 wd:Q1066 wd:Q5484 wd:Q4918 wd:Q97 wd:Q98 wd:Q39231
  }
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks > 50)
  OPTIONAL { ?item wdt:P31 ?instanceOf. }
  OPTIONAL { ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en") }
  OPTIONAL { ?item schema:description ?itemDescription. FILTER(LANG(?itemDescription) = "en") }
  OPTIONAL { ?instanceOf rdfs:label ?instanceOfLabel. FILTER(LANG(?instanceOfLabel) = "en") }
}
GROUP BY ?item ?itemLabel ?itemDescription ?sitelinks
LIMIT ${limit}`
  }
};

export const ALL_DOMAINS: Domain[] = ["character", "object", "place"];
