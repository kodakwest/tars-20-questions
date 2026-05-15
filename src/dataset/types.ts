export type Domain = "character" | "object" | "place";

export type AssertionValue = "yes" | "no" | "kind_of" | "unknown";

export type SourceType = "wikidata" | "llm_enriched" | "manual" | "gameplay";

export type AttributeDefinition = {
  id: string;
  key: string;
  displayName: string;
  description: string;
  appliesTo: Domain[];
  answerType: "yes_no_kind_of";
  ambiguityRisk: "low" | "medium" | "high";
  questionTemplates: string[];
};

export type Category = {
  id: string;
  name: string;
  parentId?: string;
  sourceRefs: Record<string, unknown>;
};

export type AttributeAssertion = {
  entityId: string;
  attributeId: string;
  attributeKey: string;
  value: AssertionValue;
  numericValue?: number;
  confidence: number;
  sourceType: SourceType;
  sourceRefs: Record<string, unknown>;
  reviewStatus: "unreviewed" | "approved" | "rejected";
  datasetVersionId?: string;
};

export type RawWikidataEntity = {
  qid: string;
  uri: string;
  label: string;
  description?: string;
  aliases: string[];
  sitelinks: number;
  instanceOf: Array<{
    id: string;
    label: string;
  }>;
};

export type NormalizedEntity = {
  id: string;
  wikidataQid: string;
  canonicalName: string;
  domain: Domain;
  description?: string;
  aliases: string[];
  popularityPrior: number;
  sourceRefs: Record<string, unknown>;
  categories: Category[];
  assertions: AttributeAssertion[];
};

export type EntityValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  entityId?: string;
};

export type DatasetValidationReport = {
  status: "passed" | "failed";
  issues: EntityValidationIssue[];
  entityCount: number;
  assertionCount: number;
};

export type DatasetBuildOptions = {
  domains: Domain[];
  limit: number;
  dryRun: boolean;
  remote: boolean;
  enrich: boolean;
  d1Database: string;
};

export type DatasetBuildResult = {
  datasetVersionId: string;
  entities: NormalizedEntity[];
  validationReport: DatasetValidationReport;
  errors: string[];
};
