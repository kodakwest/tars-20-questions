import type { Domain } from "./types";

export type PersistedDatasetStatus = "pass" | "warn" | "fail";
export type PersistedDatasetIssueSeverity = "warn" | "fail";

export type DatasetEntityRow = {
  id: string;
  canonicalName: string;
  domain: Domain | string;
};

export type EntityAssertionCountRow = DatasetEntityRow & {
  assertions: number;
};

export type EntityRelationCountRow = DatasetEntityRow & {
  count: number;
};

export type AssertionGroupRow = {
  key: string;
  count: number;
};

export type AttributeValueCountRow = {
  attributeKey: string;
  value: string;
  count: number;
};

export type AttributeApplicabilityRow = {
  attributeKey: string;
  appliesTo: string[];
};

export type ContradictionRow = {
  entityId: string;
  entityName: string;
  attributeId: string;
  attributeKey: string;
  values: string[];
  distinctValues: number;
};

export type AliasConflictEntity = {
  entityId: string;
  name: string;
  domain: string;
};

export type AliasConflictRow = {
  alias: string;
  entities: AliasConflictEntity[];
};

export type CanonicalNameDuplicateRow = {
  canonicalName: string;
  count: number;
  entities: AliasConflictEntity[];
};

export type QuestionCoverageRow = {
  attribute: string;
  templateCount: number;
};

export type DatasetValidationInput = {
  datasetVersionId: string;
  entities: DatasetEntityRow[];
  entityAssertionCounts: EntityAssertionCountRow[];
  aliasCounts: EntityRelationCountRow[];
  categoryCounts: EntityRelationCountRow[];
  assertionsBySourceType: AssertionGroupRow[];
  assertionsByReviewStatus: AssertionGroupRow[];
  attributeValueCounts: AttributeValueCountRow[];
  attributeApplicability: AttributeApplicabilityRow[];
  contradictions: ContradictionRow[];
  aliasConflicts: AliasConflictRow[];
  canonicalNameDuplicates: CanonicalNameDuplicateRow[];
  questionCoverage: QuestionCoverageRow[];
};

export type DatasetValidationIssue = {
  severity: PersistedDatasetIssueSeverity;
  code: string;
  message: string;
  subject?: string;
};

export type EntityFlag = {
  id: string;
  name: string;
  domain: string;
  assertions?: number;
  count?: number;
  threshold?: number;
};

export type AttributeQuality = {
  key: string;
  coverage: number;
  yesRatio: number;
  noRatio: number;
  kindOfRatio: number;
  unknownRatio: number;
  splitQuality: number;
  flagged: boolean;
  reason: string | null;
};

export type DuplicateReport = {
  alias?: string;
  canonicalName?: string;
  entityIds: string[];
  entities: AliasConflictEntity[];
  sameDomain: boolean;
  severity: PersistedDatasetIssueSeverity;
};

export type QuestionCoverageReport = {
  attribute: string;
  templateCount: number;
  flagged: boolean;
  severity: PersistedDatasetIssueSeverity | null;
};

export type DatasetValidationReport = {
  datasetVersionId: string;
  status: PersistedDatasetStatus;
  issues: DatasetValidationIssue[];
  entities: {
    total: number;
    byDomain: Record<string, number>;
    belowFailThreshold: EntityFlag[];
    belowWarnThreshold: EntityFlag[];
    belowThreshold: EntityFlag[];
    noAliases: EntityFlag[];
    noCategories: EntityFlag[];
  };
  assertions: {
    total: number;
    avgPerEntity: number;
    bySourceType: Record<string, number>;
    byReviewStatus: Record<string, number>;
  };
  attributes: AttributeQuality[];
  contradictions: ContradictionRow[];
  duplicates: DuplicateReport[];
  questionCoverage: QuestionCoverageReport[];
  recommendation: PersistedDatasetStatus;
};

export function validatePersistedDataset(input: DatasetValidationInput): DatasetValidationReport {
  const issues: DatasetValidationIssue[] = [];
  const entitiesByDomain = countEntitiesByDomain(input.entities);
  const assertionCountByEntity = new Map(input.entityAssertionCounts.map((row) => [row.id, row]));

  const belowFailThreshold = input.entities
    .map((entity) => entityFlag(entity, assertionCountByEntity.get(entity.id)?.assertions ?? 0, 5))
    .filter((entity) => (entity.assertions ?? 0) < 5);
  const belowWarnThreshold = input.entities
    .map((entity) => entityFlag(entity, assertionCountByEntity.get(entity.id)?.assertions ?? 0, 10))
    .filter((entity) => (entity.assertions ?? 0) >= 5 && (entity.assertions ?? 0) < 10);

  for (const entity of belowFailThreshold) {
    issues.push({
      severity: "fail",
      code: "entity_assertions_below_minimum",
      message: `${entity.name} has ${entity.assertions ?? 0} assertions; minimum is 5.`,
      subject: entity.id
    });
  }
  for (const entity of belowWarnThreshold) {
    issues.push({
      severity: "warn",
      code: "entity_assertions_below_recommended",
      message: `${entity.name} has ${entity.assertions ?? 0} assertions; recommended minimum is 10.`,
      subject: entity.id
    });
  }

  const noAliases = missingRelationFlags(input.entities, input.aliasCounts);
  const noCategories = missingRelationFlags(input.entities, input.categoryCounts);
  for (const entity of noAliases) {
    issues.push({ severity: "warn", code: "entity_has_no_aliases", message: `${entity.name} has no aliases.`, subject: entity.id });
  }
  for (const entity of noCategories) {
    issues.push({ severity: "warn", code: "entity_has_no_categories", message: `${entity.name} has no categories.`, subject: entity.id });
  }

  const assertionsBySourceType = groupRowsToRecord(input.assertionsBySourceType);
  const assertionsByReviewStatus = groupRowsToRecord(input.assertionsByReviewStatus);
  const assertionTotal = sumValues(assertionsBySourceType);
  const unreviewedRatio = ratio(assertionsByReviewStatus.unreviewed ?? 0, assertionTotal);
  const wikidataRatio = ratio(assertionsBySourceType.wikidata ?? 0, assertionTotal);
  if (assertionTotal > 0 && unreviewedRatio > 0.8) {
    issues.push({
      severity: "warn",
      code: "assertions_mostly_unreviewed",
      message: `${formatPercent(unreviewedRatio)} of assertions are unreviewed.`
    });
  }
  if (assertionTotal > 0 && wikidataRatio < 0.1) {
    issues.push({
      severity: "warn",
      code: "assertions_low_wikidata_share",
      message: `${formatPercent(wikidataRatio)} of assertions are from wikidata.`
    });
  }

  const attributes = attributeQuality(input.attributeValueCounts, input.attributeApplicability, entitiesByDomain);
  for (const attribute of attributes) {
    if (attribute.splitQuality < 0.2) {
      issues.push({
        severity: "warn",
        code: "attribute_dead_split",
        message: `${attribute.key} has low split quality (${formatDecimal(attribute.splitQuality)}).`,
        subject: attribute.key
      });
    }
    if (attribute.coverage < 0.3) {
      issues.push({
        severity: "warn",
        code: "attribute_sparse",
        message: `${attribute.key} has sparse coverage (${formatPercent(attribute.coverage)}).`,
        subject: attribute.key
      });
    }
    if (attribute.unknownRatio > 0.6) {
      issues.push({
        severity: "warn",
        code: "attribute_mostly_unknown",
        message: `${attribute.key} is ${formatPercent(attribute.unknownRatio)} unknown.`,
        subject: attribute.key
      });
    }
  }

  for (const contradiction of input.contradictions) {
    issues.push({
      severity: "fail",
      code: "high_confidence_contradiction",
      message: `${contradiction.entityName} has conflicting high-confidence values for ${contradiction.attributeKey}: ${contradiction.values.join(", ")}.`,
      subject: `${contradiction.entityId}:${contradiction.attributeId}`
    });
  }

  const duplicates = duplicateReports(input.aliasConflicts, input.canonicalNameDuplicates);
  for (const duplicate of duplicates) {
    issues.push({
      severity: duplicate.severity,
      code: duplicate.alias ? "alias_conflict" : "canonical_name_duplicate",
      message: duplicate.alias
        ? `${duplicate.alias} is shared by ${duplicate.entities.length} entities.`
        : `${duplicate.canonicalName} is used by ${duplicate.entities.length} entities.`,
      subject: duplicate.alias ?? duplicate.canonicalName
    });
  }

  const questionCoverage = input.questionCoverage.map((row) => {
    const severity = row.templateCount === 0 ? "fail" : row.templateCount === 1 ? "warn" : null;
    return {
      attribute: row.attribute,
      templateCount: row.templateCount,
      flagged: severity !== null,
      severity
    } satisfies QuestionCoverageReport;
  });
  for (const row of questionCoverage) {
    if (row.severity === "fail") {
      issues.push({
        severity: "fail",
        code: "attribute_has_no_question_templates",
        message: `${row.attribute} has no question templates.`,
        subject: row.attribute
      });
    } else if (row.severity === "warn") {
      issues.push({
        severity: "warn",
        code: "attribute_has_one_question_template",
        message: `${row.attribute} has only one question template.`,
        subject: row.attribute
      });
    }
  }

  const status = reportStatus(issues);
  return {
    datasetVersionId: input.datasetVersionId,
    status,
    issues,
    entities: {
      total: input.entities.length,
      byDomain: entitiesByDomain,
      belowFailThreshold,
      belowWarnThreshold,
      belowThreshold: [...belowFailThreshold, ...belowWarnThreshold],
      noAliases,
      noCategories
    },
    assertions: {
      total: assertionTotal,
      avgPerEntity: round(assertionTotal / Math.max(input.entities.length, 1), 1),
      bySourceType: assertionsBySourceType,
      byReviewStatus: assertionsByReviewStatus
    },
    attributes,
    contradictions: input.contradictions,
    duplicates,
    questionCoverage,
    recommendation: status
  };
}

function countEntitiesByDomain(entities: DatasetEntityRow[]) {
  const result: Record<string, number> = {};
  for (const entity of entities) result[entity.domain] = (result[entity.domain] ?? 0) + 1;
  return result;
}

function entityFlag(entity: DatasetEntityRow, assertions: number, threshold: number): EntityFlag {
  return {
    id: entity.id,
    name: entity.canonicalName,
    domain: entity.domain,
    assertions,
    threshold
  };
}

function missingRelationFlags(entities: DatasetEntityRow[], relationCounts: EntityRelationCountRow[]) {
  const counts = new Map(relationCounts.map((row) => [row.id, row.count]));
  return entities
    .filter((entity) => (counts.get(entity.id) ?? 0) === 0)
    .map((entity) => ({
      id: entity.id,
      name: entity.canonicalName,
      domain: entity.domain,
      count: 0
    }));
}

function groupRowsToRecord(rows: AssertionGroupRow[]) {
  const result: Record<string, number> = {};
  for (const row of rows) result[row.key] = row.count;
  return result;
}

function attributeQuality(
  rows: AttributeValueCountRow[],
  applicabilityRows: AttributeApplicabilityRow[],
  entitiesByDomain: Record<string, number>
) {
  const byAttribute = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const values = byAttribute.get(row.attributeKey) ?? new Map<string, number>();
    values.set(row.value, (values.get(row.value) ?? 0) + row.count);
    byAttribute.set(row.attributeKey, values);
  }

  const attributeKeys = new Set([...applicabilityRows.map((row) => row.attributeKey), ...byAttribute.keys()]);
  const applicability = new Map(applicabilityRows.map((row) => [row.attributeKey, row.appliesTo]));

  return [...attributeKeys].sort().map((key) => {
    const values = byAttribute.get(key) ?? new Map<string, number>();
    const yes = values.get("yes") ?? 0;
    const no = values.get("no") ?? 0;
    const kindOf = values.get("kind_of") ?? 0;
    const unknown = values.get("unknown") ?? 0;
    const known = yes + no + kindOf;
    const total = known + unknown;
    const denominator = Math.max(applicableEntityCount(applicability.get(key), entitiesByDomain), 1);
    const coverage = known / denominator;
    const yesRatio = ratio(yes, known);
    const noRatio = ratio(no, known);
    const kindOfRatio = ratio(kindOf, known);
    const unknownRatio = ratio(unknown, total);
    const splitQuality = coverage * (1 - Math.abs(yesRatio - noRatio)) * (1 - kindOfRatio * 0.35);
    const reasons = [
      splitQuality < 0.2 ? "dead" : null,
      coverage < 0.3 ? "sparse" : null,
      unknownRatio > 0.6 ? "mostly_unknown" : null
    ].filter((reason): reason is string => reason !== null);

    return {
      key,
      coverage: round(coverage, 4),
      yesRatio: round(yesRatio, 4),
      noRatio: round(noRatio, 4),
      kindOfRatio: round(kindOfRatio, 4),
      unknownRatio: round(unknownRatio, 4),
      splitQuality: round(splitQuality, 4),
      flagged: reasons.length > 0,
      reason: reasons.length > 0 ? reasons.join(" + ") : null
    };
  });
}

function applicableEntityCount(appliesTo: string[] | undefined, entitiesByDomain: Record<string, number>) {
  if (!appliesTo || appliesTo.length === 0) return sumValues(entitiesByDomain);
  return appliesTo.reduce((total, domain) => total + (entitiesByDomain[domain] ?? 0), 0);
}

function duplicateReports(aliasConflicts: AliasConflictRow[], canonicalDuplicates: CanonicalNameDuplicateRow[]): DuplicateReport[] {
  const aliasReports = aliasConflicts.map((row) => {
    const sameDomain = new Set(row.entities.map((entity) => entity.domain)).size === 1;
    return {
      alias: row.alias,
      canonicalName: undefined,
      entityIds: row.entities.map((entity) => entity.entityId),
      entities: row.entities,
      sameDomain,
      severity: sameDomain ? "fail" : "warn"
    } satisfies DuplicateReport;
  });

  const canonicalReports = canonicalDuplicates.map((row) => {
    const sameDomain = new Set(row.entities.map((entity) => entity.domain)).size === 1;
    return {
      alias: undefined,
      canonicalName: row.canonicalName,
      entityIds: row.entities.map((entity) => entity.entityId),
      entities: row.entities,
      sameDomain,
      severity: "fail"
    } satisfies DuplicateReport;
  });

  return [...aliasReports, ...canonicalReports];
}

function reportStatus(issues: DatasetValidationIssue[]): PersistedDatasetStatus {
  if (issues.some((issue) => issue.severity === "fail")) return "fail";
  if (issues.some((issue) => issue.severity === "warn")) return "warn";
  return "pass";
}

function sumValues(record: Record<string, number>) {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value: number, precision: number) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function formatPercent(value: number) {
  return `${round(value * 100, 1)}%`;
}

function formatDecimal(value: number) {
  return value.toFixed(2);
}
