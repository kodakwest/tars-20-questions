import type { DatasetValidationReport, NormalizedEntity } from "./types";

export function createDatasetVersionId() {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `ds:${timestamp}-${suffix}`;
}

export function datasetVersionRecord(
  id: string,
  entities: NormalizedEntity[],
  validationReport: DatasetValidationReport,
  notes?: string
) {
  return {
    id,
    createdAt: new Date().toISOString(),
    sourceSummary: JSON.stringify({
      sources: ["wikidata", "openrouter"],
      domains: Array.from(new Set(entities.map((entity) => entity.domain)))
    }),
    entityCount: entities.length,
    assertionCount: entities.reduce((total, entity) => total + entity.assertions.length, 0),
    questionCount: 0,
    validationStatus: validationReport.status,
    validationReportJson: JSON.stringify(validationReport),
    notes
  };
}
