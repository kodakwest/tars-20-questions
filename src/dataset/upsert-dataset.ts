import { spawnSync } from "node:child_process";
import { ATTRIBUTE_DEFINITIONS } from "./attribute-taxonomy";
import { datasetVersionRecord } from "./dataset-version";
import type { DatasetValidationReport, NormalizedEntity } from "./types";

export type UpsertOptions = {
  database: string;
  remote: boolean;
  dryRun: boolean;
  datasetVersionId: string;
  validationReport: DatasetValidationReport;
};

const CHUNK_SIZE = 25;

export async function upsertDataset(entities: NormalizedEntity[], options: UpsertOptions) {
  const statements = [
    ...attributeStatements(),
    ...questionTemplateStatements(),
    ...entities.flatMap((entity) => entityStatements(entity, options.datasetVersionId)),
    datasetVersionStatement(datasetVersionRecord(options.datasetVersionId, entities, options.validationReport))
  ];

  if (options.dryRun) {
    console.log(`[dry-run] Would execute ${statements.length} D1 statements in ${Math.ceil(statements.length / CHUNK_SIZE)} chunks.`);
    return;
  }

  for (let index = 0; index < statements.length; index += CHUNK_SIZE) {
    const chunk = statements.slice(index, index + CHUNK_SIZE);
    executeD1(options.database, options.remote, wrapTransaction(chunk));
  }
}

function attributeStatements() {
  return ATTRIBUTE_DEFINITIONS.map((attribute) => sql`
    INSERT INTO attributes (id, key, display_name, applies_to, answer_type, ambiguity_risk)
    VALUES (${attribute.id}, ${attribute.key}, ${attribute.displayName}, ${JSON.stringify(attribute.appliesTo)}, ${attribute.answerType}, ${attribute.ambiguityRisk})
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      display_name = excluded.display_name,
      applies_to = excluded.applies_to,
      answer_type = excluded.answer_type,
      ambiguity_risk = excluded.ambiguity_risk
  `);
}

function questionTemplateStatements() {
  return ATTRIBUTE_DEFINITIONS.flatMap((attribute) =>
    attribute.questionTemplates.map((template, index) => sql`
      INSERT INTO question_templates (id, attribute_id, template, ask_stage, quality_score)
      VALUES (${`qt:${attribute.key}:${index + 1}`}, ${attribute.id}, ${template}, ${JSON.stringify(["mid_game"])}, ${0.7})
      ON CONFLICT(id) DO UPDATE SET
        attribute_id = excluded.attribute_id,
        template = excluded.template,
        ask_stage = excluded.ask_stage,
        quality_score = excluded.quality_score
    `)
  );
}

function entityStatements(entity: NormalizedEntity, datasetVersionId: string) {
  return [
    sql`
      INSERT INTO entities (id, canonical_name, domain, description, popularity_prior, source_refs_json, dataset_version_id, updated_at)
      VALUES (${entity.id}, ${entity.canonicalName}, ${entity.domain}, ${entity.description ?? null}, ${entity.popularityPrior}, ${JSON.stringify(entity.sourceRefs)}, ${datasetVersionId}, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        canonical_name = excluded.canonical_name,
        domain = excluded.domain,
        description = excluded.description,
        popularity_prior = excluded.popularity_prior,
        source_refs_json = excluded.source_refs_json,
        dataset_version_id = excluded.dataset_version_id,
        updated_at = datetime('now')
    `,
    ...entity.aliases.map((alias) => sql`
      INSERT INTO aliases (entity_id, alias, language, source)
      VALUES (${entity.id}, ${alias}, ${"en"}, ${"wikidata"})
      ON CONFLICT(entity_id, alias) DO UPDATE SET
        language = excluded.language,
        source = excluded.source
    `),
    ...entity.categories.flatMap((category) => [
      sql`
        INSERT INTO categories (id, name, parent_id, source_refs_json)
        VALUES (${category.id}, ${category.name}, ${category.parentId ?? null}, ${JSON.stringify(category.sourceRefs)})
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          parent_id = excluded.parent_id,
          source_refs_json = excluded.source_refs_json
      `,
      sql`
        INSERT INTO entity_categories (entity_id, category_id, confidence)
        VALUES (${entity.id}, ${category.id}, ${1})
        ON CONFLICT(entity_id, category_id) DO UPDATE SET
          confidence = excluded.confidence
      `
    ]),
    ...entity.assertions.map((assertion) => sql`
      INSERT INTO attribute_assertions (
        entity_id,
        attribute_id,
        value,
        numeric_value,
        confidence,
        source_type,
        source_refs_json,
        review_status,
        dataset_version_id,
        updated_at
      )
      VALUES (
        ${assertion.entityId},
        ${assertion.attributeId},
        ${assertion.value},
        ${assertion.numericValue ?? null},
        ${assertion.confidence},
        ${assertion.sourceType},
        ${JSON.stringify(assertion.sourceRefs)},
        ${assertion.reviewStatus},
        ${datasetVersionId},
        datetime('now')
      )
      ON CONFLICT(entity_id, attribute_id, source_type) DO UPDATE SET
        value = excluded.value,
        numeric_value = excluded.numeric_value,
        confidence = excluded.confidence,
        source_refs_json = excluded.source_refs_json,
        review_status = excluded.review_status,
        dataset_version_id = excluded.dataset_version_id,
        updated_at = datetime('now')
    `)
  ];
}

function datasetVersionStatement(record: ReturnType<typeof datasetVersionRecord>) {
  return sql`
    INSERT INTO dataset_versions (
      id,
      created_at,
      source_summary,
      entity_count,
      assertion_count,
      question_count,
      validation_status,
      validation_report_json,
      notes
    )
    VALUES (
      ${record.id},
      ${record.createdAt},
      ${record.sourceSummary},
      ${record.entityCount},
      ${record.assertionCount},
      ${record.questionCount},
      ${record.validationStatus},
      ${record.validationReportJson},
      ${record.notes ?? null}
    )
    ON CONFLICT(id) DO UPDATE SET
      source_summary = excluded.source_summary,
      entity_count = excluded.entity_count,
      assertion_count = excluded.assertion_count,
      question_count = excluded.question_count,
      validation_status = excluded.validation_status,
      validation_report_json = excluded.validation_report_json,
      notes = excluded.notes
  `;
}

function executeD1(database: string, remote: boolean, command: string) {
  const args = ["wrangler", "d1", "execute", database, "--command", command];
  if (remote) args.push("--remote");

  let result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "D1 write failed");
  }
}

function wrapTransaction(statements: string[]) {
  return `BEGIN TRANSACTION;\n${statements.join(";\n")};\nCOMMIT;`;
}

function sql(strings: TemplateStringsArray, ...values: Array<string | number | null>) {
  return strings.reduce((result, fragment, index) => {
    const value = values[index];
    return `${result}${fragment}${index < values.length ? literal(value) : ""}`;
  }, "").trim();
}

function literal(value: string | number | null) {
  if (value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}
