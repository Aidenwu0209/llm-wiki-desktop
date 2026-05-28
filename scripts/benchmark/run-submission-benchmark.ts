#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

type BenchmarkQuestion = {
  id: string;
  category: string;
  question: string;
  expected_answerable?: boolean;
  required_evidence_ids?: string[];
  evidence_keywords?: string[];
};

type EvidenceDoc = {
  evidence_id: string;
  path: string;
  text: string;
  kind: "markdown" | "json" | "jsonl" | "text";
  source_path?: string | null;
  latency_ms?: number | null;
  parser?: string | null;
};

type OcrArtifactMetadata = {
  artifact_path: string;
  manifest_path?: string | null;
  source_path?: string | null;
  source_id?: string | null;
  parser?: string | null;
  parser_model?: string | null;
  parser_version?: string | null;
  page_count?: number | null;
  chunk_count?: number | null;
  source_sha256?: string | null;
  artifact_sha256?: string | null;
  latency_ms?: number | null;
  limitations: string[];
  fixture?: boolean;
};

type Args = {
  vault?: string;
  questions: string;
  manifest: string;
  out: string;
  ernieModel: string;
  noErnie: boolean;
  maxEvidence: number;
};

const DEFAULT_QUESTIONS = "benchmarks/submission-ocr-qa/questions.jsonl";
const DEFAULT_MANIFEST = "benchmarks/submission-ocr-qa/sample-manifest.json";
const DEFAULT_OUT = "benchmarks/results/run.json";
const ERNIE_BASE_URL = "https://aistudio.baidu.com/llm/lmapi/v3";

class BenchmarkError extends Error {}

function usage() {
  return `Usage:
  npm run benchmark:submission -- --vault <path> --questions ${DEFAULT_QUESTIONS} --out ${DEFAULT_OUT}

Options:
  --vault <path>          Required generated LLM Wiki vault path.
  --questions <path>      JSONL question file. Defaults to ${DEFAULT_QUESTIONS}.
  --manifest <path>       Benchmark sample manifest. Defaults to ${DEFAULT_MANIFEST}.
  --out <path>            JSON result path. Defaults to ${DEFAULT_OUT}.
  --ernie-model <name>    ERNIE model for optional live answers. Defaults to ernie-5.1.
  --no-ernie             Skip ERNIE even when AI_STUDIO_API_KEY is present.
  --max-evidence <n>      Retrieved evidence snippets per question. Defaults to 5.`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    questions: DEFAULT_QUESTIONS,
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_OUT,
    ernieModel: "ernie-5.1",
    noErnie: false,
    maxEvidence: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--vault") {
      args.vault = next;
      i += 1;
    } else if (arg === "--questions") {
      args.questions = next;
      i += 1;
    } else if (arg === "--manifest") {
      args.manifest = next;
      i += 1;
    } else if (arg === "--out") {
      args.out = next;
      i += 1;
    } else if (arg === "--ernie-model") {
      args.ernieModel = next;
      i += 1;
    } else if (arg === "--no-ernie") {
      args.noErnie = true;
    } else if (arg === "--max-evidence") {
      args.maxEvidence = Number(next);
      i += 1;
    } else {
      throw new BenchmarkError(`Unknown benchmark argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function assertDirectory(label: string, value?: string): Promise<string> {
  if (!value?.trim()) {
    throw new BenchmarkError(`Missing --${label} <path>. The submission benchmark must run against a generated LLM Wiki vault.`);
  }
  const resolved = path.resolve(value);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new BenchmarkError(`Benchmark ${label} path does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new BenchmarkError(`Benchmark ${label} path is not a directory: ${resolved}`);
  }
  return resolved;
}

async function readJsonFile(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readQuestions(filePath: string): Promise<BenchmarkQuestion[]> {
  const resolved = path.resolve(filePath);
  const text = await fs.readFile(resolved, "utf8");
  const questions = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as BenchmarkQuestion;
      } catch (err) {
        throw new BenchmarkError(`Invalid JSONL at ${resolved}:${index + 1}: ${String(err)}`);
      }
    });
  if (questions.length === 0) throw new BenchmarkError(`Question file is empty: ${resolved}`);
  return questions;
}

function validateManifest(value: any) {
  const errors: string[] = [];
  if (!value || typeof value !== "object") errors.push("manifest is not an object");
  if (!value.schema_version) errors.push("schema_version is required");
  if (!Array.isArray(value.samples)) errors.push("samples[] is required");
  for (const [index, sample] of (value.samples ?? []).entries()) {
    if (!sample.sample_id) errors.push(`samples[${index}].sample_id is required`);
    if (!sample.source_path) errors.push(`samples[${index}].source_path is required`);
    if (!Array.isArray(sample.expected_artifacts)) errors.push(`samples[${index}].expected_artifacts[] is required`);
  }
  return { valid: errors.length === 0, errors };
}

async function walk(root: string, current = root): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "target", "dist"].includes(entry.name)) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(root, fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readTextSafe(filePath: string, maxBytes = 1_500_000) {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  try {
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function relative(vault: string, filePath: string) {
  return path.relative(vault, filePath).split(path.sep).join("/");
}

function firstString(value: any, fields: string[]) {
  for (const field of fields) {
    const candidate = value?.[field];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function numberFrom(value: any, fields: string[]) {
  for (const field of fields) {
    const candidate = value?.[field];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function stringArrayFrom(value: any, field: string) {
  const items = value?.[field];
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractLatencyMs(value: any): number[] {
  const values: number[] = [];
  const visit = (item: any) => {
    if (!item || typeof item !== "object") return;
    for (const [key, candidate] of Object.entries(item)) {
      const normalized = key.toLowerCase();
      if (typeof candidate === "number" && Number.isFinite(candidate) && (normalized.includes("latency_ms") || normalized.includes("duration_ms"))) {
        values.push(candidate);
      } else if (typeof candidate === "object") {
        visit(candidate);
      }
    }
  };
  visit(value);
  return values;
}

function collectJsonEvidence(value: any, relPath: string, docs: EvidenceDoc[], parentSource?: string | null, parentParser?: string | null) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonEvidence(item, relPath, docs, parentSource, parentParser));
    return;
  }
  const evidenceId = firstString(value, ["evidence_id", "evidenceId", "id", "chunk_id", "chunkId"]);
  const text = firstString(value, ["text", "content", "markdown", "ocr_text", "page_text", "table_text", "caption", "answer"]);
  const sourcePath = firstString(value, ["source_path", "sourcePath", "raw_source_path", "rawSourcePath"]) || parentSource || null;
  const parser = firstString(value, ["ocr_parser", "parser", "engine"]) || parentParser || null;
  const latency = numberFrom(value, ["ocr_latency_ms", "latency_ms", "duration_ms"]);
  if (text) {
    docs.push({
      evidence_id: evidenceId || `${relPath}#${docs.length + 1}`,
      path: relPath,
      text,
      kind: relPath.endsWith(".jsonl") ? "jsonl" : "json",
      source_path: sourcePath,
      latency_ms: latency,
      parser,
    });
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectJsonEvidence(child, relPath, docs, sourcePath, parser);
  }
}

async function loadEvidenceCorpus(vault: string) {
  const files = await walk(vault);
  const docs: EvidenceDoc[] = [];
  const markdownFiles = files.filter((file) => /\.(md|markdown)$/i.test(file));
  const jsonFiles = files.filter((file) => /\.(json|jsonl)$/i.test(file));
  const textFiles = files.filter((file) => /\.(txt|csv)$/i.test(file));
  for (const file of markdownFiles) {
    const rel = relative(vault, file);
    const text = await readTextSafe(file);
    const sourcePath = firstFrontmatterSource(text);
    docs.push({
      evidence_id: rel.replace(/\.(md|markdown)$/i, ""),
      path: rel,
      text,
      kind: "markdown",
      source_path: sourcePath,
    });
    docs.push(...extractInlineEvidenceDocs(text, rel, sourcePath));
  }
  for (const file of textFiles) {
    const rel = relative(vault, file);
    docs.push({ evidence_id: rel, path: rel, text: await readTextSafe(file), kind: "text", source_path: rel });
  }
  for (const file of jsonFiles) {
    const rel = relative(vault, file);
    const text = await readTextSafe(file);
    if (rel.endsWith(".jsonl")) {
      text.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        try {
          const value = JSON.parse(line);
          const before = docs.length;
          collectJsonEvidence(value, `${rel}#L${index + 1}`, docs);
          if (docs.length === before) {
            docs.push({
              evidence_id: `${rel}#L${index + 1}`,
              path: rel,
              text: JSON.stringify(value).slice(0, 4000),
              kind: "jsonl",
              source_path: firstString(value, ["source_path", "sourcePath"]) || null,
            });
          }
        } catch {
          docs.push({ evidence_id: `${rel}#L${index + 1}`, path: rel, text: line, kind: "jsonl", source_path: null });
        }
      });
    } else {
      try {
        collectJsonEvidence(JSON.parse(text), rel, docs);
      } catch {
        docs.push({ evidence_id: rel, path: rel, text, kind: "json", source_path: null });
      }
    }
  }
  return { files, docs, markdownFiles, jsonFiles };
}

function firstFrontmatterSource(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const sourceMatch = match[1].match(/(?:source|source_path|raw_source|raw_path):\s*["']?([^"'\n]+)["']?/i);
  return sourceMatch?.[1]?.trim() || null;
}

function extractInlineEvidenceDocs(text: string, relPath: string, sourcePath: string | null) {
  const docs: EvidenceDoc[] = [];
  const evidenceIdPattern = /\b[A-Za-z][A-Za-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.:-]*/g;
  text.split(/\r?\n/).forEach((line, index) => {
    const ids = Array.from(new Set(line.match(evidenceIdPattern) ?? []));
    for (const id of ids) {
      docs.push({
        evidence_id: id,
        path: `${relPath}#L${index + 1}`,
        text: line.trim(),
        kind: "markdown",
        source_path: sourcePath,
      });
    }
  });
  return docs;
}

function tokens(value: string) {
  const normalized = value.toLowerCase();
  const ascii = normalized.match(/[a-z0-9_./:-]{2,}/g) ?? [];
  const cjk = normalized.match(/[\u3400-\u9fff]/g) ?? [];
  const bigrams = cjk.slice(0, -1).map((char, index) => `${char}${cjk[index + 1]}`);
  return new Set([...ascii, ...bigrams]);
}

function searchEvidence(question: BenchmarkQuestion, docs: EvidenceDoc[], limit: number) {
  const queryTokens = tokens([question.question, ...(question.evidence_keywords ?? [])].join(" "));
  const required = new Set(question.required_evidence_ids ?? []);
  return docs
    .map((doc) => {
      const haystack = `${doc.evidence_id} ${doc.path} ${doc.text}`;
      const docTokens = tokens(haystack);
      let score = 0;
      for (const token of queryTokens) if (docTokens.has(token)) score += 1;
      if (required.has(doc.evidence_id)) score += 12;
      for (const id of required) {
        if (doc.evidence_id.includes(id) || id.includes(doc.evidence_id)) score += 8;
      }
      return { doc, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

function evaluateQuestion(question: BenchmarkQuestion, docs: EvidenceDoc[], maxEvidence: number) {
  const hits = searchEvidence(question, docs, maxEvidence);
  const required = question.required_evidence_ids ?? [];
  const cited = hits.map((item) => item.doc.evidence_id);
  const covered = required.filter((id) => cited.some((citation) => citation === id || citation.includes(id) || id.includes(citation)));
  const expectedAnswerable = question.expected_answerable !== false;
  const hasEvidence = hits.length > 0;
  const refused = !expectedAnswerable || !hasEvidence;
  const localAnswer = refused
    ? "No supported answer: the benchmark did not find sufficient local evidence for this question."
    : `Local evidence benchmark found relevant evidence: ${cited.map((id) => `[${id}]`).join(" ")}.`;
  const unsupportedClaim = expectedAnswerable ? covered.length < required.length : !refused;
  const traceabilityBreaks = required.length - covered.length;
  return {
    question_id: question.id,
    category: question.category,
    question: question.question,
    expected_answerable: expectedAnswerable,
    local_answer: localAnswer,
    local_refused: refused,
    required_evidence_ids: required,
    cited_evidence_ids: cited,
    citation_coverage: required.length ? covered.length / required.length : 1,
    unsupported_claim: unsupportedClaim,
    traceability_break_count: traceabilityBreaks,
    retrieved_evidence: hits.map((item) => ({
      evidence_id: item.doc.evidence_id,
      path: item.doc.path,
      score: item.score,
      source_path: item.doc.source_path ?? null,
      snippet: item.doc.text.replace(/\s+/g, " ").slice(0, 360),
    })),
  };
}

async function callErnie(question: BenchmarkQuestion, evidence: ReturnType<typeof evaluateQuestion>["retrieved_evidence"], model: string, apiKey: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const prompt = [
      "Answer using only the provided evidence. Cite evidence ids in square brackets. Refuse if evidence is insufficient.",
      `Question: ${question.question}`,
      "Evidence:",
      ...evidence.map((item) => `- [${item.evidence_id}] ${item.snippet}`),
    ].join("\n");
    const response = await fetch(`${ERNIE_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: "You are an evidence-grounded benchmark evaluator." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const text = await response.text();
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { status: "error", latency_ms: latencyMs, answer: "", error: redactProviderText(`HTTP ${response.status}: ${text}`) };
    }
    const json = JSON.parse(text);
    const answer = json?.choices?.[0]?.message?.content || json?.result || "";
    return { status: "answered", latency_ms: latencyMs, answer, error: null };
  } catch (err) {
    return { status: "error", latency_ms: Date.now() - started, answer: "", error: redactProviderText(String(err)) };
  } finally {
    clearTimeout(timeout);
  }
}

function redactProviderText(value: string) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]").slice(0, 1200);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function detectOcrParser(docs: EvidenceDoc[]) {
  return docs.find((doc) => doc.parser)?.parser || "local-artifact";
}

function maxPageInChunks(text: string) {
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      const page = numberFrom(value, ["page", "page_number", "page_index"]);
      if (typeof page === "number" && page > max) max = page;
    } catch {
      continue;
    }
  }
  return max > 0 ? max : null;
}

function ocrArtifactKey(value: Pick<OcrArtifactMetadata, "artifact_path" | "source_path">) {
  return value.artifact_path || value.source_path || "";
}

function mergeArtifactMetadata(base: OcrArtifactMetadata, fallback?: OcrArtifactMetadata) {
  if (!fallback) return base;
  return {
    ...fallback,
    ...base,
    artifact_path: base.artifact_path || fallback.artifact_path,
    manifest_path: base.manifest_path || fallback.manifest_path,
    source_path: base.source_path || fallback.source_path,
    source_id: base.source_id || fallback.source_id,
    parser: base.parser || fallback.parser,
    parser_model: base.parser_model || fallback.parser_model,
    parser_version: base.parser_version || fallback.parser_version,
    page_count: base.page_count ?? fallback.page_count ?? null,
    chunk_count: base.chunk_count ?? fallback.chunk_count ?? null,
    source_sha256: base.source_sha256 || fallback.source_sha256,
    artifact_sha256: base.artifact_sha256 || fallback.artifact_sha256,
    latency_ms: base.latency_ms ?? fallback.latency_ms ?? null,
    limitations: base.limitations.length ? base.limitations : fallback.limitations,
    fixture: Boolean(base.fixture && fallback.fixture),
  };
}

async function readOcrArtifactMetadata(vault: string, manifestPath: string): Promise<OcrArtifactMetadata | null> {
  let manifest: any;
  try {
    manifest = await readJsonFile(manifestPath);
  } catch {
    return null;
  }
  const relManifestPath = relative(vault, manifestPath);
  const parent = path.dirname(manifestPath);
  const parentRel = relative(vault, parent);
  const chunksRel =
    firstString(manifest, ["chunks", "chunks_path", "chunksPath"])
    || `${parentRel}/chunks.jsonl`;
  const chunksPath = path.join(vault, chunksRel);
  let derivedChunkCount = numberFrom(manifest, ["chunk_count", "chunkCount"]);
  let derivedPageCount = numberFrom(manifest, ["page_count", "pageCount"]);
  if (derivedChunkCount === null || derivedPageCount === null) {
    try {
      const chunksText = await readTextSafe(chunksPath, 500_000);
      if (derivedChunkCount === null) {
        derivedChunkCount = chunksText.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
      }
      if (derivedPageCount === null) {
        derivedPageCount = maxPageInChunks(chunksText);
      }
    } catch {
      // Keep manifest values only.
    }
  }
  return {
    artifact_path:
      firstString(manifest, ["combined", "markdown_path", "markdownPath", "artifact_path", "artifactPath"])
      || `${parentRel}/markdown.md`,
    manifest_path: relManifestPath,
    source_path: firstString(manifest, ["source_path", "sourcePath"]) || null,
    source_id: firstString(manifest, ["source_id", "sourceId"]) || null,
    parser: firstString(manifest, ["parser"]) || null,
    parser_model: firstString(manifest, ["parser_model", "parserModel", "model"]) || null,
    parser_version: firstString(manifest, ["parser_version", "parserVersion"]) || null,
    page_count: derivedPageCount,
    chunk_count: derivedChunkCount,
    source_sha256: firstString(manifest, ["source_sha256", "sourceSha256", "sha256"]) || null,
    artifact_sha256: firstString(manifest, ["artifact_sha256", "artifactSha256"]) || null,
    latency_ms: numberFrom(manifest, ["latency_ms", "duration_ms", "parse_latency_ms"]),
    limitations: stringArrayFrom(manifest, "limitations"),
  };
}

function fixtureOcrArtifacts(manifest: any): OcrArtifactMetadata[] {
  const items = Array.isArray(manifest?.fixture_ocr_artifacts) ? manifest.fixture_ocr_artifacts : [];
  return items.map((item) => ({
    artifact_path: firstString(item, ["artifact_path", "artifactPath"]),
    manifest_path: firstString(item, ["manifest_path", "manifestPath"]) || null,
    source_path: firstString(item, ["source_path", "sourcePath"]) || null,
    source_id: firstString(item, ["source_id", "sourceId"]) || null,
    parser: firstString(item, ["parser"]) || null,
    parser_model: firstString(item, ["parser_model", "parserModel", "model"]) || null,
    parser_version: firstString(item, ["parser_version", "parserVersion"]) || null,
    page_count: numberFrom(item, ["page_count", "pageCount"]),
    chunk_count: numberFrom(item, ["chunk_count", "chunkCount"]),
    source_sha256: firstString(item, ["source_sha256", "sourceSha256", "sha256"]) || null,
    artifact_sha256: firstString(item, ["artifact_sha256", "artifactSha256"]) || null,
    latency_ms: numberFrom(item, ["latency_ms", "duration_ms", "parse_latency_ms"]),
    limitations: stringArrayFrom(item, "limitations"),
    fixture: true,
  })).filter((item) => item.artifact_path || item.source_path);
}

async function loadOcrArtifacts(vault: string, files: string[], manifest: any) {
  const manifestFiles = files.filter((file) => /(^|\/)artifacts\/.+\/manifest\.json$/i.test(relative(vault, file)));
  const actualArtifacts = (await Promise.all(manifestFiles.map((file) => readOcrArtifactMetadata(vault, file))))
    .filter((item): item is OcrArtifactMetadata => Boolean(item));
  const fixtureArtifacts = fixtureOcrArtifacts(manifest);
  const fixtureByKey = new Map(fixtureArtifacts.map((item) => [ocrArtifactKey(item), item]));
  const merged = actualArtifacts.map((item) => mergeArtifactMetadata(item, fixtureByKey.get(ocrArtifactKey(item))));
  const seenKeys = new Set(merged.map((item) => ocrArtifactKey(item)));
  for (const item of fixtureArtifacts) {
    const key = ocrArtifactKey(item);
    if (key && !seenKeys.has(key)) merged.push(item);
  }
  return merged;
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const vault = await assertDirectory("vault", args.vault);
  const questions = await readQuestions(args.questions);
  const manifestPath = path.resolve(args.manifest);
  const manifest = await readJsonFile(manifestPath);
  const manifestValidation = validateManifest(manifest);
  const corpus = await loadEvidenceCorpus(vault);
  const ocrArtifacts = await loadOcrArtifacts(vault, corpus.files, manifest);
  const questionResults = questions.map((question) => evaluateQuestion(question, corpus.docs, args.maxEvidence));
  const apiKey = process.env.AI_STUDIO_API_KEY?.trim();
  const ernieEnabled = Boolean(apiKey && !args.noErnie);
  const ernieResults = [];
  if (ernieEnabled && apiKey) {
    for (const result of questionResults) {
      ernieResults.push({
        question_id: result.question_id,
        ...await callErnie(
          questions.find((question) => question.id === result.question_id) as BenchmarkQuestion,
          result.retrieved_evidence,
          args.ernieModel,
          apiKey,
        ),
      });
    }
  }

  const requiredEvidenceTotal = questionResults.reduce((sum, result) => sum + result.required_evidence_ids.length, 0);
  const coveredEvidenceTotal = questionResults.reduce((sum, result) => sum + Math.round(result.citation_coverage * result.required_evidence_ids.length), 0);
  const noEvidenceQuestions = questionResults.filter((result) => !result.expected_answerable);
  const ocrLatencies = ocrArtifacts.flatMap((artifact) => typeof artifact.latency_ms === "number" ? [artifact.latency_ms] : []);
  const artifactDocsWithoutSource = corpus.docs.filter((doc) => (doc.kind === "json" || doc.kind === "jsonl") && !doc.source_path).length;
  const expectedSampleCount = Array.isArray(manifest.samples) ? manifest.samples.length : 0;
  const parsedSourceCount = new Set(
    ocrArtifacts
      .map((artifact) => artifact.source_path || artifact.artifact_path)
      .filter(Boolean),
  ).size || new Set(corpus.docs.map((doc) => doc.source_path || doc.path.split("#")[0]).filter(Boolean)).size;
  const ocrChunkCount = ocrArtifacts.reduce((sum, artifact) => sum + (artifact.chunk_count ?? 0), 0);
  const ocrPageCount = ocrArtifacts.reduce((sum, artifact) => sum + (artifact.page_count ?? 0), 0);
  const metrics = {
    parse_success_rate: expectedSampleCount ? Math.min(1, parsedSourceCount / expectedSampleCount) : (corpus.docs.length > 0 ? 1 : 0),
    markdown_generated: corpus.markdownFiles.length,
    json_generated: corpus.jsonFiles.length,
    manifest_valid: manifestValidation.valid,
    chunk_count: ocrChunkCount || corpus.docs.length,
    citation_coverage: requiredEvidenceTotal ? coveredEvidenceTotal / requiredEvidenceTotal : 1,
    unsupported_claim_count: questionResults.filter((result) => result.unsupported_claim).length,
    traceability_break_count: questionResults.reduce((sum, result) => sum + result.traceability_break_count, 0) + artifactDocsWithoutSource,
    ernie_answer_latency_ms: average(ernieResults.map((result) => result.latency_ms).filter((value): value is number => typeof value === "number")),
    ocr_latency_ms: average(ocrLatencies),
    end_to_end_latency_ms: Date.now() - started,
    no_evidence_refusal_rate: noEvidenceQuestions.length
      ? noEvidenceQuestions.filter((result) => result.local_refused).length / noEvidenceQuestions.length
      : 1,
  };

  const output = {
    schema_version: 1,
    benchmark_id: "submission-ocr-qa",
    run_id: `submission-${new Date(started).toISOString().replace(/[:.]/g, "-")}`,
    generated_at: new Date().toISOString(),
    commit_hash: gitCommit(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
    },
    config: {
      vault_path: vault,
      questions_path: path.resolve(args.questions),
      manifest_path: manifestPath,
      ernie_model: args.ernieModel,
      ernie_live_enabled: ernieEnabled,
      max_evidence: args.maxEvidence,
    },
    ocr: {
      parser: ocrArtifacts[0]?.parser || detectOcrParser(corpus.docs),
      parser_model: ocrArtifacts[0]?.parser_model || null,
      parser_version: ocrArtifacts[0]?.parser_version || null,
      artifact_count: ocrArtifacts.length || corpus.jsonFiles.length,
      page_count: ocrPageCount || null,
      chunk_count: ocrChunkCount || null,
      latency_ms: metrics.ocr_latency_ms,
      artifacts: ocrArtifacts,
    },
    ernie: {
      model: args.ernieModel,
      status: ernieEnabled ? "attempted" : "skipped_missing_key",
      answer_latency_ms: metrics.ernie_answer_latency_ms,
      results: ernieResults,
    },
    corpus: {
      file_count: corpus.files.length,
      evidence_doc_count: corpus.docs.length,
      markdown_files: corpus.markdownFiles.map((file) => relative(vault, file)),
      json_artifact_files: corpus.jsonFiles.map((file) => relative(vault, file)),
      manifest_valid: manifestValidation.valid,
      manifest_errors: manifestValidation.errors,
    },
    metrics,
    questions: questionResults,
  };

  const outPath = path.resolve(args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote benchmark result: ${outPath}`);
  console.log(`Questions: ${questions.length}; citation coverage: ${(metrics.citation_coverage * 100).toFixed(1)}%; ERNIE: ${output.ernie.status}`);
}

main().catch((err) => {
  const message = err instanceof BenchmarkError ? err.message : String(err?.stack || err);
  console.error(`Benchmark error: ${message}`);
  process.exit(1);
});
