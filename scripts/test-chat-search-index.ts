import assert from "node:assert/strict";
import { buildSearchIndex, filterSearchResults, searchRelationCopy } from "../src/components/search/ChatSearchPage";
import type { ArtifactContractSummary, ReviewQueueItem, VaultStatus, WritebackProposal } from "../src/types";

const status = {
  files: [
    {
      name: "LLM-0001.md",
      path: "sources/LLM-0001.md",
      kind: "source",
      title: "Source One",
      excerpt: "A source page excerpt about parser evidence.",
      status: "published",
    },
    {
      name: "strategy.md",
      path: "concepts/strategy.md",
      kind: "concept",
      title: "Strategy Concept",
      excerpt: "Concept synthesis excerpt.",
      status: "synthesis",
    },
  ],
} as VaultStatus;

const reviewItems: ReviewQueueItem[] = [
  {
    itemId: "review-1",
    kind: "science_review",
    severity: "p2",
    title: "Review evidence anchor",
    body: "Check the source anchor before writeback.",
    status: "open",
    targetPath: "reviews/science-review-queue.md",
    sourceId: "LLM-0001",
    claimId: "claim-1",
    evidencePath: "artifacts/LLM-0001/chunks.jsonl",
    recommendedAction: "Open traceability",
  },
];

const writebacks: WritebackProposal[] = [
  {
    proposalId: "proposal-1",
    targetPath: "reviews/query-writeback/strategy.md",
    title: "Strategy writeback",
    status: "proposed",
    diff: "+ Evidence backed strategy",
    content: "Proposal body with citation to sources/LLM-0001.md",
    createdAt: "2026-06-09T00:00:00Z",
    updatedAt: "2026-06-09T00:00:00Z",
  },
];

const artifacts: ArtifactContractSummary[] = [
  {
    sourcePath: "sources/LLM-0001.md",
    sourceId: "LLM-0001",
    sourceUuid: "source-uuid-1",
    artifactPath: "artifacts/LLM-0001/markdown.md",
    manifestPath: "artifacts/LLM-0001/manifest.json",
    chunksPath: "artifacts/LLM-0001/chunks.jsonl",
    parser: "PaddleOCR-VL",
    parserModel: "PaddleOCR-VL-1.6",
    parserVersion: "2026.06",
    schemaVersion: "1",
    sourceSha256: "source-sha",
    artifactSha256: "artifact-sha",
    status: "stale",
    contractValid: false,
    pageCount: 8,
    chunkCount: 42,
    latencyMs: 1234,
    anchorsLines: true,
    anchorsPages: true,
    anchorsTables: true,
    anchorsFigures: false,
    anchorsEquations: false,
    limitations: ["figures pending"],
    lintErrors: ["artifact hash mismatch"],
  },
];

const index = buildSearchIndex({
  status,
  claims: [],
  evidencePaths: [],
  reviewItems,
  writebacks,
  artifacts,
  traceabilityWarnings: [],
  labels: searchRelationCopy.en,
  language: "en",
});

for (const type of ["source", "concept", "review", "writeback", "artifact"]) {
  assert.ok(index.some((item) => item.type === type), `missing ${type} search result`);
}

const artifact = index.find((item) => item.type === "artifact");
assert.ok(artifact, "artifact result should be indexed");
assert.equal(artifact.path, "artifacts/LLM-0001/manifest.json");
assert.equal(artifact.severity, "p1");
assert.ok(artifact.searchText.includes("PaddleOCR-VL-1.6"));
assert.ok(artifact.searchText.includes("artifact hash mismatch"));
assert.ok(artifact.relations.some((relation) => relation.includes("manifest")));
assert.ok(artifact.relations.some((relation) => relation.includes("chunks")));

const filtered = filterSearchResults(index, "all", "artifact hash mismatch");
assert.equal(filtered[0]?.type, "artifact", "artifact metadata should be directly searchable");

console.log("Chat search index checks passed.");
