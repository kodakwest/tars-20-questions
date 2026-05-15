import { spawnSync } from "node:child_process";
import {
  validatePersistedDataset,
  type AliasConflictRow,
  type AssertionGroupRow,
  type AttributeApplicabilityRow,
  type AttributeValueCountRow,
  type CanonicalNameDuplicateRow,
  type ContradictionRow,
  type DatasetEntityRow,
  type DatasetValidationInput,
  type DatasetValidationReport,
  type EntityAssertionCountRow,
  type EntityRelationCountRow,
  type QuestionCoverageRow
} from "../src/dataset/validate-dataset";

type CliOptions = {
  version: string;
  json: boolean;
  save: boolean;
  verbose: boolean;
  remote: boolean;
  database: string;
};

type D1Value = string | number | null;
type D1Row = Record<string, D1Value>;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runDatasetValidation(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, options.verbose);
  }

  process.exit(exitCode(report.status));
}

export function runDatasetValidation(options: CliOptions): DatasetValidationReport {
  const datasetVersionId = resolveDatasetVersionId(options);
  const input = readValidationInput(options, datasetVersionId);
  const report = validatePersistedDataset(input);

  if (options.save) {
    saveValidationReport(options, datasetVersionId, report);
  }

  return report;
}

function readValidationInput(options: CliOptions, datasetVersionId: string): DatasetValidationInput {
  const version = literal(datasetVersionId);
  const entities = readRows(options, `
    SELECT id, canonical_name, domain
    FROM entities
    WHERE dataset_version_id = ${version}
    ORDER BY domain, canonical_name
  `).map(entityRow);

  const entityAssertionCounts = readRows(options, `
    SELECT e.id, e.canonical_name, e.domain, COUNT(aa.entity_id) AS assertions
    FROM entities e
    LEFT JOIN attribute_assertions aa
      ON e.id = aa.entity_id AND aa.dataset_version_id = e.dataset_version_id
    WHERE e.dataset_version_id = ${version}
    GROUP BY e.id, e.canonical_name, e.domain
    ORDER BY e.domain, e.canonical_name
  `).map(entityAssertionCountRow);

  const aliasCounts = readRows(options, `
    SELECT e.id, e.canonical_name, e.domain, COUNT(al.alias) AS count
    FROM entities e
    LEFT JOIN aliases al ON e.id = al.entity_id
    WHERE e.dataset_version_id = ${version}
    GROUP BY e.id, e.canonical_name, e.domain
  `).map(entityRelationCountRow);

  const categoryCounts = readRows(options, `
    SELECT e.id, e.canonical_name, e.domain, COUNT(ec.category_id) AS count
    FROM entities e
    LEFT JOIN entity_categories ec ON e.id = ec.entity_id
    WHERE e.dataset_version_id = ${version}
    GROUP BY e.id, e.canonical_name, e.domain
  `).map(entityRelationCountRow);

  const assertionsBySourceType = readRows(options, `
    SELECT source_type AS key, COUNT(*) AS count
    FROM attribute_assertions
    WHERE dataset_version_id = ${version}
    GROUP BY source_type
  `).map(assertionGroupRow);

  const assertionsByReviewStatus = readRows(options, `
    SELECT review_status AS key, COUNT(*) AS count
    FROM attribute_assertions
    WHERE dataset_version_id = ${version}
    GROUP BY review_status
  `).map(assertionGroupRow);

  const attributeValueCounts = readRows(options, `
    SELECT a.key AS attribute_key, aa.value, COUNT(*) AS count
    FROM attribute_assertions aa
    JOIN attributes a ON aa.attribute_id = a.id
    WHERE aa.dataset_version_id = ${version}
    GROUP BY a.key, aa.value
  `).map(attributeValueCountRow);

  const attributeApplicability = readRows(options, `
    SELECT key AS attribute_key, applies_to
    FROM attributes
    ORDER BY key
  `).map(attributeApplicabilityRow);

  const contradictions = readRows(options, `
    SELECT
      aa.entity_id,
      e.canonical_name AS entity_name,
      aa.attribute_id,
      a.key AS attribute_key,
      COUNT(DISTINCT aa.value) AS distinct_values,
      GROUP_CONCAT(DISTINCT aa.value) AS values_csv
    FROM attribute_assertions aa
    JOIN entities e ON aa.entity_id = e.id
    JOIN attributes a ON aa.attribute_id = a.id
    WHERE aa.value != 'unknown'
      AND aa.confidence >= 0.7
      AND aa.dataset_version_id = ${version}
      AND e.dataset_version_id = ${version}
    GROUP BY aa.entity_id, e.canonical_name, aa.attribute_id, a.key
    HAVING distinct_values > 1
  `).map(contradictionRow);

  const allAliases = readRows(options, `
    SELECT al.alias, e.id AS entity_id, e.canonical_name AS entity_name, e.domain
    FROM aliases al
    JOIN entities e ON al.entity_id = e.id
    WHERE e.dataset_version_id = ${version}
    ORDER BY LOWER(al.alias), e.domain, e.canonical_name
  `);

  const canonicalNameRows = readRows(options, `
    SELECT LOWER(canonical_name) AS canonical_key, canonical_name, id AS entity_id, canonical_name AS entity_name, domain
    FROM entities
    WHERE dataset_version_id = ${version}
    ORDER BY LOWER(canonical_name), domain, canonical_name
  `);

  const questionCoverage = readRows(options, `
    SELECT a.key AS attribute, COUNT(qt.id) AS template_count
    FROM attributes a
    LEFT JOIN question_templates qt ON a.id = qt.attribute_id
    GROUP BY a.key
    ORDER BY a.key
  `).map(questionCoverageRow);

  return {
    datasetVersionId,
    entities,
    entityAssertionCounts,
    aliasCounts,
    categoryCounts,
    assertionsBySourceType,
    assertionsByReviewStatus,
    attributeValueCounts,
    attributeApplicability,
    contradictions,
    aliasConflicts: aliasConflictRows(allAliases),
    canonicalNameDuplicates: canonicalNameDuplicateRows(canonicalNameRows),
    questionCoverage
  };
}

function resolveDatasetVersionId(options: CliOptions) {
  if (options.version !== "latest") return options.version;

  const rows = readRows(options, `
    SELECT id
    FROM dataset_versions
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const id = rows[0]?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("No dataset_versions rows found; cannot resolve --version latest.");
  }
  return id;
}

function saveValidationReport(options: CliOptions, datasetVersionId: string, report: DatasetValidationReport) {
  executeD1(options, `
    UPDATE dataset_versions
    SET validation_status = ${literal(report.status)},
        validation_report_json = ${literal(JSON.stringify(report))}
    WHERE id = ${literal(datasetVersionId)}
  `);
}

function readRows(options: CliOptions, command: string): D1Row[] {
  const output = executeD1(options, command, true);
  const parsed = JSON.parse(output) as unknown;
  return extractRows(parsed);
}

function executeD1(options: CliOptions, command: string, json = false) {
  const args = ["wrangler", "d1", "execute", options.database, "--command", command.trim()];
  if (json) args.push("--json");
  if (options.remote) args.push("--remote");

  let result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    result = spawnSync("npx", args, { stdio: "pipe", encoding: "utf8" });
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "D1 command failed");
  }
  return result.stdout;
}

function extractRows(value: unknown): D1Row[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const first = value[0] as { results?: unknown };
    if (Array.isArray(first.results)) return first.results as D1Row[];
    if (value.every((row) => row && typeof row === "object" && !("results" in row))) return value as D1Row[];
  }

  if (value && typeof value === "object" && "results" in value) {
    const results = (value as { results?: unknown }).results;
    if (Array.isArray(results)) return results as D1Row[];
  }

  throw new Error("Unexpected wrangler JSON output shape.");
}

function entityRow(row: D1Row): DatasetEntityRow {
  return {
    id: stringValue(row.id),
    canonicalName: stringValue(row.canonical_name),
    domain: stringValue(row.domain)
  };
}

function entityAssertionCountRow(row: D1Row): EntityAssertionCountRow {
  return {
    ...entityRow(row),
    assertions: numberValue(row.assertions)
  };
}

function entityRelationCountRow(row: D1Row): EntityRelationCountRow {
  return {
    ...entityRow(row),
    count: numberValue(row.count)
  };
}

function assertionGroupRow(row: D1Row): AssertionGroupRow {
  return {
    key: stringValue(row.key),
    count: numberValue(row.count)
  };
}

function attributeValueCountRow(row: D1Row): AttributeValueCountRow {
  return {
    attributeKey: stringValue(row.attribute_key),
    value: stringValue(row.value),
    count: numberValue(row.count)
  };
}

function attributeApplicabilityRow(row: D1Row): AttributeApplicabilityRow {
  return {
    attributeKey: stringValue(row.attribute_key),
    appliesTo: parseStringArray(stringValue(row.applies_to))
  };
}

function contradictionRow(row: D1Row): ContradictionRow {
  return {
    entityId: stringValue(row.entity_id),
    entityName: stringValue(row.entity_name),
    attributeId: stringValue(row.attribute_id),
    attributeKey: stringValue(row.attribute_key),
    values: stringValue(row.values_csv).split(",").filter(Boolean),
    distinctValues: numberValue(row.distinct_values)
  };
}

function aliasConflictRows(rows: D1Row[]): AliasConflictRow[] {
  const byAlias = new Map<string, AliasConflictRow>();
  for (const row of rows) {
    const alias = stringValue(row.alias);
    const key = alias.trim().toLowerCase();
    const conflict = byAlias.get(key) ?? { alias, entities: [] };
    conflict.entities.push({
      entityId: stringValue(row.entity_id),
      name: stringValue(row.entity_name),
      domain: stringValue(row.domain)
    });
    byAlias.set(key, conflict);
  }

  return [...byAlias.values()].filter((row) => new Set(row.entities.map((entity) => entity.entityId)).size > 1);
}

function canonicalNameDuplicateRows(rows: D1Row[]): CanonicalNameDuplicateRow[] {
  const byName = new Map<string, CanonicalNameDuplicateRow>();
  for (const row of rows) {
    const canonicalName = stringValue(row.canonical_name);
    const key = stringValue(row.canonical_key);
    const duplicate = byName.get(key) ?? { canonicalName, count: 0, entities: [] };
    duplicate.count += 1;
    duplicate.entities.push({
      entityId: stringValue(row.entity_id),
      name: stringValue(row.entity_name),
      domain: stringValue(row.domain)
    });
    byName.set(key, duplicate);
  }

  return [...byName.values()].filter((row) => row.count > 1);
}

function questionCoverageRow(row: D1Row): QuestionCoverageRow {
  return {
    attribute: stringValue(row.attribute),
    templateCount: numberValue(row.template_count)
  };
}

function printReport(report: DatasetValidationReport, verbose: boolean) {
  console.log("Dataset Validation Report");
  console.log("────────────────────────");
  console.log(`Dataset Version: ${report.datasetVersionId}`);
  console.log(`Status: ${report.status.toUpperCase()}`);
  console.log("");

  console.log(`Entities (${report.entities.total} total):`);
  for (const [domain, count] of Object.entries(report.entities.byDomain)) {
    console.log(`  ${domain}: ${count}`);
  }
  entitySummary("entities with < 5 assertions", report.entities.belowFailThreshold, "⚠");
  entitySummary("entities with < 10 assertions", report.entities.belowWarnThreshold, "⚠");
  entitySummary("entities with 0 aliases", report.entities.noAliases, "⚠");
  entitySummary("entities with 0 categories", report.entities.noCategories, "⚠");
  if (verbose) {
    verboseEntities("Below 5 assertions", report.entities.belowFailThreshold);
    verboseEntities("Below 10 assertions", report.entities.belowWarnThreshold);
    verboseEntities("No aliases", report.entities.noAliases);
    verboseEntities("No categories", report.entities.noCategories);
  }
  console.log("");

  console.log(`Assertions (${formatInteger(report.assertions.total)} total):`);
  for (const [source, count] of Object.entries(report.assertions.bySourceType)) {
    console.log(`  ${source}: ${formatInteger(count)} (${formatPercent(count, report.assertions.total)})`);
  }
  for (const [status, count] of Object.entries(report.assertions.byReviewStatus)) {
    console.log(`  ${status}: ${formatInteger(count)} (${formatPercent(count, report.assertions.total)})`);
  }
  console.log("");

  console.log(`Attribute Quality (${report.attributes.length} attributes):`);
  for (const attribute of report.attributes) {
    const icon = attribute.flagged ? "⚠" : "✅";
    const reason = attribute.reason ? ` (${attribute.reason.replace(/_/g, " ")})` : "";
    console.log(`  ${icon} ${attribute.key}: split=${attribute.splitQuality.toFixed(2)} coverage=${attribute.coverage.toFixed(2)}${reason}`);
  }
  console.log("");

  console.log(`Contradictions: ${report.contradictions.length}`);
  if (verbose || report.contradictions.length <= 10) {
    for (const contradiction of report.contradictions) {
      console.log(`  ✖ ${contradiction.entityName}: ${contradiction.attributeKey} = ${contradiction.values.join(", ")}`);
    }
  }
  console.log("");

  console.log(`Duplicates: ${report.duplicates.length} conflicts found`);
  for (const duplicate of report.duplicates.slice(0, verbose ? report.duplicates.length : 10)) {
    const label = duplicate.alias ? `"${duplicate.alias}"` : `canonical "${duplicate.canonicalName}"`;
    const entities = duplicate.entities.map((entity) => `${entity.name} (${entity.domain})`).join(", ");
    const scope = duplicate.sameDomain ? "same domain" : "cross-domain";
    console.log(`  ${duplicate.severity === "fail" ? "✖" : "⚠"} ${label} → ${entities} [${scope}]`);
  }
  if (!verbose && report.duplicates.length > 10) console.log(`  ...${report.duplicates.length - 10} more`);
  console.log("");

  console.log("Question Coverage:");
  for (const coverage of report.questionCoverage.filter((row) => row.flagged || verbose)) {
    const icon = coverage.severity === "fail" ? "✖" : coverage.severity === "warn" ? "⚠" : "✅";
    const suffix = coverage.severity ? ` (${coverage.severity.toUpperCase()})` : "";
    console.log(`  ${icon} ${coverage.attribute}: ${coverage.templateCount} templates${suffix}`);
  }
  console.log("");

  console.log(`Recommendation: ${report.recommendation.toUpperCase()} — ${recommendationText(report.status)}`);
}

function entitySummary(label: string, entities: unknown[], icon: string) {
  if (entities.length > 0) console.log(`  ${icon} ${entities.length} ${label}`);
}

function verboseEntities(label: string, entities: Array<{ name: string; domain: string; assertions?: number }>) {
  if (entities.length === 0) return;
  console.log(`  ${label}:`);
  for (const entity of entities) {
    const assertions = entity.assertions === undefined ? "" : `, ${entity.assertions} assertions`;
    console.log(`    - ${entity.name} (${entity.domain}${assertions})`);
  }
}

function recommendationText(status: DatasetValidationReport["status"]) {
  if (status === "fail") return "fix failing validation issues before gameplay use";
  if (status === "warn") return "review flagged items before gameplay use";
  return "dataset is ready for gameplay use";
}

function parseArgs(args: string[]): CliOptions {
  let version = "latest";
  let json = false;
  let save = false;
  let verbose = false;
  let remote = false;
  let database = process.env.D1_DATABASE_NAME ?? "tars-games";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--version") {
      version = requiredValue(args[++index], "--version");
    } else if (arg === "--json") json = true;
    else if (arg === "--save") save = true;
    else if (arg === "--verbose") verbose = true;
    else if (arg === "--remote") remote = true;
    else if (arg === "--database") database = requiredValue(args[++index], "--database");
    else if (arg === "--help") usageAndExit(0);
    else usageAndExit(1, `Unknown argument: ${arg}`);
  }

  return { version, json, save, verbose, remote, database };
}

function requiredValue(value: string | undefined, flag: string) {
  if (!value) usageAndExit(1, `${flag} requires a value.`);
  return value;
}

function usageAndExit(status: number, message?: string): never {
  if (message) console.error(message);
  console.log(`Usage:
  npx tsx scripts/validate-dataset.ts
  npx tsx scripts/validate-dataset.ts --version latest
  npx tsx scripts/validate-dataset.ts --version ds:20260515-xxx --json
  npx tsx scripts/validate-dataset.ts --save

Options:
  --version   Dataset version id (default: latest)
  --json      Print raw JSON report
  --save      Persist report to dataset_versions.validation_report_json
  --verbose   List all flagged entities and conflicts
  --remote    Read/write remote D1 instead of local D1
  --database  D1 database name (default: tars-games)`);
  process.exit(status);
}

function stringValue(value: D1Value | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value: D1Value | undefined) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function literal(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number, total: number) {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function exitCode(status: DatasetValidationReport["status"]) {
  if (status === "fail") return 2;
  if (status === "warn") return 1;
  return 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(2);
});
