import assert from "node:assert/strict";
import { buildBacklinksPlusRelations } from "../src/lib/backlinksPlus";
import type { TraceabilityWarning, VaultFile } from "../src/types";

const activeConcept: VaultFile = {
  name: "strategy.md",
  path: "concepts/strategy.md",
  kind: "concept",
  title: "Strategy",
  sourceRefs: ["LLM-0001", "LLM-0002"],
  outboundLinks: ["concepts/runtime.md"],
  inboundLinks: ["Home.md"],
};

const files: VaultFile[] = [
  activeConcept,
  {
    name: "LLM-0001.md",
    path: "sources/LLM-0001.md",
    kind: "source",
    title: "Source One",
    sourceId: "LLM-0001",
  },
  {
    name: "runtime.md",
    path: "concepts/runtime.md",
    kind: "concept",
    title: "Runtime",
    sourceRefs: ["LLM-0002"],
  },
  {
    name: "unrelated.md",
    path: "concepts/unrelated.md",
    kind: "concept",
    title: "Unrelated",
    sourceRefs: ["LLM-9999"],
  },
];

const warnings: TraceabilityWarning[] = [
  {
    warningId: "tw-1",
    severity: "p1",
    claimId: "claim-1",
    claimText: "Needs an anchor.",
    sourceId: "LLM-0001",
    sourcePath: "sources/LLM-0001.md",
    claimPath: "claims/claims.jsonl",
    artifactPath: "artifacts/LLM-0001/manifest.json",
    missingAnchor: "page:2",
    missingHeading: "",
    summary: "Missing evidence anchor",
    suggestedAction: "Re-parse the source.",
    nextAction: "Open source",
  },
  {
    warningId: "tw-2",
    severity: "p2",
    claimId: "claim-2",
    claimText: "Unrelated.",
    sourceId: "LLM-9999",
    sourcePath: "sources/LLM-9999.md",
    claimPath: "claims/claims.jsonl",
    artifactPath: null,
    missingAnchor: "",
    missingHeading: "Methods",
    summary: "Unrelated warning",
    suggestedAction: "Ignore for this page.",
    nextAction: "Open source",
  },
];

const conceptRelations = buildBacklinksPlusRelations({
  file: activeConcept,
  files,
  traceabilityWarnings: warnings,
});

assert.deepEqual(
  conceptRelations.sharedSources.map((item) => item.path).sort(),
  ["concepts/runtime.md", "sources/LLM-0001.md"],
);
assert.equal(conceptRelations.warnings.length, 1);
assert.equal(conceptRelations.warnings[0]?.warningId, "tw-1");
assert.equal(conceptRelations.warnings[0]?.path, "sources/LLM-0001.md");
assert.ok(!conceptRelations.sharedSources.some((item) => item.path === activeConcept.path));

const sourceRelations = buildBacklinksPlusRelations({
  file: files[1],
  files,
  traceabilityWarnings: warnings,
});

assert.ok(sourceRelations.sharedSources.some((item) => item.path === "concepts/strategy.md"));
assert.equal(sourceRelations.warnings[0]?.severity, "p1");

console.log("Details backlinks-plus relation checks passed.");
