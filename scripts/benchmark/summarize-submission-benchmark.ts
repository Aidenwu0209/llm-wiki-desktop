#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

type Args = {
  input?: string;
  out?: string;
};

function usage() {
  return `Usage:
  npm run benchmark:submission:summary -- --in benchmarks/results/run.json --out benchmarks/results/report.md`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--in") {
      args.input = next;
      i += 1;
    } else if (arg === "--out") {
      args.out = next;
      i += 1;
    } else {
      throw new Error(`Unknown summary argument: ${arg}\n${usage()}`);
    }
  }
  if (!args.input) throw new Error(`Missing --in <path>.\n${usage()}`);
  return args;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value)} ms`;
}

function value(value: unknown) {
  if (value === null || typeof value === "undefined") return "N/A";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function renderReport(run: any) {
  const metrics = run.metrics ?? {};
  const questions = Array.isArray(run.questions) ? run.questions : [];
  const failed = questions.filter((question: any) =>
    question.unsupported_claim || question.traceability_break_count > 0 || question.citation_coverage < 1,
  );
  const successCount = questions.length - failed.length;
  const ernieStatus = run.ernie?.status ?? "unknown";
  const failureRows = failed.slice(0, 10).map((question: any) =>
    `| ${question.question_id} | ${question.category} | ${pct(question.citation_coverage)} | ${question.unsupported_claim ? "yes" : "no"} | ${question.traceability_break_count ?? 0} |`,
  );
  const nextSteps = [
    metrics.parse_success_rate < 1 ? "- Improve OCR/PDF parser coverage for samples that did not produce artifacts." : "",
    metrics.citation_coverage < 1 ? "- Add stronger evidence-id propagation from OCR chunks into answer citations." : "",
    metrics.traceability_break_count > 0 ? "- Repair artifacts missing source_id/source_path before using them for synthesis." : "",
    metrics.unsupported_claim_count > 0 ? "- Tighten refusal behavior for questions without sufficient evidence." : "",
    ernieStatus !== "attempted" ? "- Re-run with AI_STUDIO_API_KEY to capture live ERNIE latency and answer quality." : "",
  ].filter(Boolean);

  return `# OCR + ERNIE + Evidence Wiki Benchmark Report

## Run Environment

| Field | Value |
|---|---|
| Run ID | ${value(run.run_id)} |
| Generated at | ${value(run.generated_at)} |
| Commit hash | ${value(run.commit_hash)} |
| Node | ${value(run.environment?.node)} |
| Platform | ${value(run.environment?.platform)} ${value(run.environment?.arch)} |
| Vault | \`${value(run.config?.vault_path)}\` |

## Benchmark Configuration

| Field | Value |
|---|---|
| OCR parser | ${value(run.ocr?.parser)} |
| OCR artifact count | ${value(run.ocr?.artifact_count)} |
| ERNIE model | ${value(run.ernie?.model)} |
| ERNIE status | ${value(ernieStatus)} |
| Questions | ${questions.length} |

## Metrics

| Metric | Value |
|---|---:|
| parse_success_rate | ${pct(metrics.parse_success_rate)} |
| markdown_generated | ${value(metrics.markdown_generated)} |
| json_generated | ${value(metrics.json_generated)} |
| manifest_valid | ${value(metrics.manifest_valid)} |
| chunk_count | ${value(metrics.chunk_count)} |
| citation_coverage | ${pct(metrics.citation_coverage)} |
| unsupported_claim_count | ${value(metrics.unsupported_claim_count)} |
| traceability_break_count | ${value(metrics.traceability_break_count)} |
| ernie_answer_latency_ms | ${ms(metrics.ernie_answer_latency_ms)} |
| ocr_latency_ms | ${ms(metrics.ocr_latency_ms)} |
| end_to_end_latency_ms | ${ms(metrics.end_to_end_latency_ms)} |
| no_evidence_refusal_rate | ${pct(metrics.no_evidence_refusal_rate)} |

## Outcome

- Total questions: ${questions.length}
- Successful local evidence checks: ${successCount}
- Failed or partial checks: ${failed.length}
- Citation coverage: ${pct(metrics.citation_coverage)}
- Unsupported claims: ${value(metrics.unsupported_claim_count)}
- Traceability breaks: ${value(metrics.traceability_break_count)}

## Failure Samples

${failureRows.length ? `| Question | Category | Citation coverage | Unsupported claim | Traceability breaks |
|---|---|---:|---|---:|
${failureRows.join("\n")}` : "No failure samples were recorded."}

## Next Optimization Suggestions

${nextSteps.length ? nextSteps.join("\n") : "- Keep the benchmark in CI or release smoke to prevent regressions."}
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input as string);
  const run = JSON.parse(await fs.readFile(input, "utf8"));
  const report = renderReport(run);
  if (args.out) {
    const outPath = path.resolve(args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, report, "utf8");
    console.log(`Wrote benchmark report: ${outPath}`);
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error(`Benchmark summary error: ${String(err?.stack || err)}`);
  process.exit(1);
});
