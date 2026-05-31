import assert from "node:assert/strict";
import { isRunnableIngestEntry, runnableIngestCount } from "../src/lib/ingestPlan";
import type { IngestPlan, IngestPlanEntry } from "../src/types";

function entry(overrides: Partial<IngestPlanEntry>): IngestPlanEntry {
  return {
    sourcePath: "/vault/raw/paper.pdf",
    fileName: "paper.pdf",
    sha256: "sha256",
    artifactSha256: null,
    artifactPath: "raw/paper_markdown/combined.md",
    status: "blocked",
    action: "parse_required",
    reason: "parser config required",
    parserHint: "Settings -> PaddleOCR-VL Document Parsing Skill",
    currentState: "paddleocr_config_required",
    nextActionLabel: "Configure parser first",
    command: ["Settings -> PaddleOCR-VL Document Parsing Skill"],
    inputs: ["raw/paper.pdf"],
    outputs: ["raw/paper_markdown/combined.md"],
    lastLogPath: null,
    requiresHumanApproval: false,
    usesNetwork: false,
    ...overrides,
  };
}

const blockedPaddleOcr = entry({});
const blockedCloudApproval = entry({
  currentState: "cloud_parser_approval_required",
  nextActionLabel: "Approve cloud parser first",
});
const configuredParser = entry({
  currentState: "parse_required",
  parserHint: "pdf_to_markdown.py --parser layout-api",
  usesNetwork: true,
});
const stageableMarkdown = entry({
  sourcePath: "/vault/raw/note.md",
  fileName: "note.md",
  status: "stageable",
  action: "stage_text_artifact",
  currentState: "imported",
});
const duplicateMarkdown = entry({
  sourcePath: "/vault/raw/duplicate.md",
  fileName: "duplicate.md",
  status: "stageable",
  action: "stage_text_artifact",
  currentState: "duplicate",
  requiresHumanApproval: true,
});

assert.equal(
  isRunnableIngestEntry(blockedPaddleOcr),
  false,
  "PDFs blocked on missing PaddleOCR config should not be shown as runnable",
);
assert.equal(
  isRunnableIngestEntry(blockedCloudApproval),
  false,
  "PDFs blocked on explicit cloud-parser approval should not be shown as runnable",
);
assert.equal(
  isRunnableIngestEntry(configuredParser),
  true,
  "PDFs with a configured parser should remain runnable from the parse_required state",
);
assert.equal(
  isRunnableIngestEntry(stageableMarkdown),
  true,
  "stageable local text/Markdown inputs should remain runnable",
);
assert.equal(
  isRunnableIngestEntry(duplicateMarkdown),
  false,
  "review-gated duplicate sources should not be runnable",
);

const plan = {
  entries: [
    blockedPaddleOcr,
    blockedCloudApproval,
    configuredParser,
    stageableMarkdown,
    duplicateMarkdown,
  ],
} as IngestPlan;

assert.equal(runnableIngestCount(plan), 2, "runnable count should match the actual pipeline gate");

console.log("Ingest plan helper checks passed.");
