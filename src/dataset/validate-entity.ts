import type { DatasetValidationReport, EntityValidationIssue, NormalizedEntity } from "./types";

export function validateDataset(entities: NormalizedEntity[]): DatasetValidationReport {
  const issues: EntityValidationIssue[] = [];
  const names = new Map<string, string>();

  for (const entity of entities) {
    const actionableAssertions = entity.assertions.filter((assertion) => assertion.value !== "unknown");
    if (actionableAssertions.length < 3) {
      issues.push({
        severity: "error",
        code: "too_few_assertions",
        message: `${entity.canonicalName} has fewer than 3 assertions.`,
        entityId: entity.id
      });
    }

    if (!entity.domain) {
      issues.push({
        severity: "error",
        code: "missing_domain",
        message: `${entity.canonicalName} has no domain.`,
        entityId: entity.id
      });
    }

    const normalizedName = entity.canonicalName.trim().toLowerCase();
    const existing = names.get(normalizedName);
    if (existing) {
      issues.push({
        severity: "warning",
        code: "duplicate_name",
        message: `${entity.canonicalName} duplicates ${existing}.`,
        entityId: entity.id
      });
    } else {
      names.set(normalizedName, entity.id);
    }

    for (const issue of conflictingAssertions(entity)) {
      issues.push(issue);
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    status: hasErrors ? "failed" : "passed",
    issues,
    entityCount: entities.length,
    assertionCount: entities.reduce((total, entity) => total + entity.assertions.length, 0)
  };
}

export function validEntities(entities: NormalizedEntity[]) {
  return entities.filter((entity) => {
    const report = validateDataset([entity]);
    return !report.issues.some((issue) => issue.severity === "error");
  });
}

function conflictingAssertions(entity: NormalizedEntity): EntityValidationIssue[] {
  const issues: EntityValidationIssue[] = [];
  const byAttribute = new Map<string, Set<string>>();

  for (const assertion of entity.assertions) {
    if (assertion.value === "unknown") continue;
    const values = byAttribute.get(assertion.attributeKey) ?? new Set<string>();
    values.add(assertion.value);
    byAttribute.set(assertion.attributeKey, values);
  }

  for (const [attributeKey, values] of byAttribute) {
    if (values.has("yes") && values.has("no")) {
      issues.push({
        severity: "warning",
        code: "conflicting_assertions",
        message: `${entity.canonicalName} has conflicting ${attributeKey} assertions.`,
        entityId: entity.id
      });
    }
  }

  return issues;
}
