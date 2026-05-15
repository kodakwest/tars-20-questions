import { spawnSync } from "node:child_process";
import { createDatasetVersionId } from "../src/dataset/dataset-version";
import { enrichEntity } from "../src/dataset/enrich-entity";
import { normalizeEntity } from "../src/dataset/normalize-entity";
import { ALL_DOMAINS } from "../src/dataset/seed-config";
import type { DatasetBuildOptions, Domain, NormalizedEntity } from "../src/dataset/types";
import { upsertDataset } from "../src/dataset/upsert-dataset";
import { validateDataset, validEntities } from "../src/dataset/validate-entity";
import { fetchWikidataEntities } from "../src/dataset/wikidata-client";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const datasetVersionId = createDatasetVersionId();
  const errors: string[] = [];
  const entities: NormalizedEntity[] = [];

  console.log(`Dataset version: ${datasetVersionId}`);
  console.log(`Domains: ${options.domains.join(", ")}; limit: ${options.limit}; dry-run: ${options.dryRun}`);

  for (const domain of options.domains) {
    try {
      console.log(`Fetching ${domain} entities from Wikidata...`);
      const rawEntities = await fetchWikidataEntities(domain, options.limit);
      console.log(`Fetched ${rawEntities.length} ${domain} entities.`);

      for (const raw of rawEntities) {
        const entity = normalizeEntity(raw, domain);
        if (options.enrich) {
          const enriched = await enrichEntity(entity);
          entity.assertions.push(...enriched);
        }
        entities.push(entity);
      }
    } catch (error) {
      const message = `${domain}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error(message);
    }
  }

  const report = validateDataset(entities);
  printValidationSummary(report);

  const writableEntities = validEntities(entities).map((entity) => ({
    ...entity,
    assertions: entity.assertions.map((assertion) => ({ ...assertion, datasetVersionId }))
  }));

  console.log(`Writing ${writableEntities.length}/${entities.length} valid entities to D1...`);
  await upsertDataset(writableEntities, {
    database: options.d1Database,
    remote: options.remote,
    dryRun: options.dryRun,
    datasetVersionId,
    validationReport: report
  });

  if (!options.dryRun) {
    runPersistedDatasetValidation({
      datasetVersionId,
      database: options.d1Database,
      remote: options.remote
    });
  }

  console.log("Dataset build complete.");
  console.log(`Entities processed: ${entities.length}`);
  console.log(`Entities written: ${options.dryRun ? 0 : writableEntities.length}`);
  console.log(`Assertions written: ${options.dryRun ? 0 : writableEntities.reduce((total, entity) => total + entity.assertions.length, 0)}`);
  console.log(`Errors: ${errors.length}`);
  for (const error of errors) console.log(`- ${error}`);
}

function parseArgs(args: string[]): DatasetBuildOptions {
  let domains: Domain[] = [];
  let limit = 200;
  let dryRun = false;
  let remote = false;
  let enrich = true;
  let d1Database = process.env.D1_DATABASE_NAME ?? "tars-games";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") domains = ALL_DOMAINS;
    else if (arg === "--domain") domains = [parseDomain(args[++index])];
    else if (arg === "--limit") limit = Number(args[++index]);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--remote") remote = true;
    else if (arg === "--no-enrich") enrich = false;
    else if (arg === "--database") d1Database = args[++index];
    else if (arg === "--help") usageAndExit(0);
    else usageAndExit(1, `Unknown argument: ${arg}`);
  }

  if (domains.length === 0) domains = ["character"];
  if (!Number.isInteger(limit) || limit < 1) usageAndExit(1, "--limit must be a positive integer.");

  return { domains, limit, dryRun, remote, enrich, d1Database };
}

function parseDomain(value: string | undefined): Domain {
  if (value === "character" || value === "object" || value === "place") return value;
  usageAndExit(1, "--domain must be character, object, or place.");
}

function printValidationSummary(report: ReturnType<typeof validateDataset>) {
  const errors = report.issues.filter((issue) => issue.severity === "error");
  const warnings = report.issues.filter((issue) => issue.severity === "warning");
  console.log(`Validation: ${report.status}; ${errors.length} errors; ${warnings.length} warnings.`);
  for (const issue of report.issues.slice(0, 25)) {
    console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
  }
  if (report.issues.length > 25) console.log(`- ...${report.issues.length - 25} more issues`);
}

function runPersistedDatasetValidation(options: { datasetVersionId: string; database: string; remote: boolean }) {
  console.log("Running persisted dataset validation...");
  const args = [
    "tsx",
    "scripts/validate-dataset.ts",
    "--version",
    options.datasetVersionId,
    "--save",
    "--database",
    options.database
  ];
  if (options.remote) args.push("--remote");

  const result = spawnSync("npx", args, { stdio: "inherit", encoding: "utf8" });
  if (result.status === 2) {
    throw new Error("Persisted dataset validation failed.");
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Persisted dataset validation exited with status ${result.status ?? "unknown"}.`);
  }
}

function usageAndExit(status: number, message?: string): never {
  if (message) console.error(message);
  console.log(`Usage:
  npx tsx scripts/build-dataset.ts --domain character --limit 200
  npx tsx scripts/build-dataset.ts --domain object --limit 200
  npx tsx scripts/build-dataset.ts --all --limit 750
  npx tsx scripts/build-dataset.ts --dry-run

Options:
  --remote       Write to remote D1 instead of local D1
  --no-enrich    Skip OpenRouter enrichment
  --database     D1 database name (default: tars-games)`);
  process.exit(status);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
