import assert from "node:assert/strict";
import { buildVaultFileTree } from "../src/lib/vaultTree";
import { findVaultFileForOpen, vaultRelativeOpenPath } from "../src/lib/vaultPath";
import type { VaultFile } from "../src/types";

function file(path: string, kind: VaultFile["kind"] = "note", title?: string): VaultFile {
  return {
    name: path.split(/[\\/]/).pop() || path,
    path,
    kind,
    title,
    status: "ready",
  };
}

const tree = buildVaultFileTree([
  file("raw/deepseek_paper/deepseek-v3.pdf", "inbox"),
  file("sources/LLM-0002-deepseek-r1.md", "source"),
  file("concepts/deepseek-research-strategy.md", "concept", "DeepSeek research strategy"),
  file("index.md", "note", "Home"),
  file("reviews/query-writeback/deepseek-research-insights.md", "report"),
  file("\\sources\\LLM-0001-deepseek-v3.md", "source"),
]);

assert.deepEqual(
  tree.map((node) => node.path),
  ["index.md", "concepts", "sources", "reviews", "raw"],
  "root tree should preserve Obsidian-oriented folder order",
);

const sources = tree.find((node) => node.path === "sources");
assert.ok(sources, "sources folder should exist");
assert.equal(sources.fileCount, 2, "sources folder should count nested files");
assert.deepEqual(
  sources.children.map((node) => node.path),
  ["sources/LLM-0001-deepseek-v3.md", "sources/LLM-0002-deepseek-r1.md"],
  "sources should sort files naturally after path normalization",
);

const raw = tree.find((node) => node.path === "raw");
assert.ok(raw, "raw folder should exist");
assert.equal(raw.fileCount, 1, "raw folder should count descendants");
assert.equal(raw.children[0]?.path, "raw/deepseek_paper", "raw should expose nested corpus folders");
assert.equal(raw.children[0]?.children[0]?.path, "raw/deepseek_paper/deepseek-v3.pdf");

const reviews = tree.find((node) => node.path === "reviews");
assert.ok(reviews, "reviews folder should exist");
assert.equal(reviews.children[0]?.path, "reviews/query-writeback");

const vaultPath = "/Users/demo/DeepSeek LLM Wiki";
const files = [
  file("Home.md", "note"),
  file("concepts/deepseek-research-strategy.md", "concept"),
  file("\\sources\\LLM-0001-deepseek-v3.md", "source"),
];

assert.equal(
  vaultRelativeOpenPath(vaultPath, "/Users/demo/DeepSeek LLM Wiki/concepts/deepseek-research-strategy.md#Evidence"),
  "concepts/deepseek-research-strategy.md",
  "vault-internal absolute links should resolve to vault-relative paths",
);
assert.equal(
  vaultRelativeOpenPath(vaultPath, "sources%2FLLM-0001-deepseek-v3.md?view=preview"),
  "sources/LLM-0001-deepseek-v3.md",
  "encoded Markdown links should resolve before internal file lookup",
);
assert.equal(
  findVaultFileForOpen(vaultPath, files, "/Users/demo/DeepSeek LLM Wiki/concepts/deepseek-research-strategy.md")?.kind,
  "concept",
  "opening a vault-internal absolute path should select the existing file",
);
assert.equal(
  findVaultFileForOpen(vaultPath, files, "sources/LLM-0001-deepseek-v3.md")?.kind,
  "source",
  "opening a normalized path should match files stored with Windows separators",
);
assert.equal(
  findVaultFileForOpen(vaultPath, files, "../outside.md"),
  null,
  "outside traversal paths should not match vault files",
);
assert.equal(
  findVaultFileForOpen(vaultPath, [file("tmp/outside.md", "note")], "/tmp/outside.md"),
  null,
  "absolute paths outside the selected vault should not be treated as internal files",
);

console.log("Vault file tree checks passed.");
