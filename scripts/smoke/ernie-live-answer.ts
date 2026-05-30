#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  ERNIE_AI_STUDIO_API_KEY_ENV,
  ERNIE_AI_STUDIO_BASE_URL,
  ERNIE_AI_STUDIO_DEFAULT_MODEL,
} from "../../src/lib/providers/catalog";

type Args = {
  vault: string;
  out: string;
  model: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  selfTest: boolean;
  maxEvidence: number;
};

type EvidenceDoc = {
  evidence_id: string;
  path: string;
  text: string;
  source_path?: string | null;
};

type EvidenceHit = EvidenceDoc & {
  score: number;
  snippet: string;
};

type SmokeQuestion = {
  id: string;
  kind: "sufficient_evidence" | "incomplete_evidence" | "no_evidence";
  question: string;
  required_evidence_ids: string[];
  keywords: string[];
  expected_refusal?: boolean;
};

type ProviderResponse = {
  answer: string;
  latency_ms: number;
  raw_text: string;
};

type QuestionResult = {
  id: string;
  kind: SmokeQuestion["kind"];
  question: string;
  answer: string;
  model: string;
  latency_ms: number | null;
  selected_evidence_ids: string[];
  citations: string[];
  citation_coverage: number;
  unsupported_claims: string[];
  warnings: string[];
  raw_document_sent: false;
  status: "answered" | "refused" | "provider_error";
};

type FetchLike = typeof fetch;

const DEFAULT_OUT_DIR = "artifacts/smoke/ernie";
const RESULT_FILE = "ernie-live-answer-result.json";
const REPORT_FILE = "ernie-live-answer-report.md";
const MAX_SNIPPET_CHARS = 360;
const ERNIE_API_KEY_ENV_SETTING = "ERNIE_API_KEY_ENV";

class SmokeError extends Error {}

function usage() {
  return `Usage:
  npm run ernie:live-smoke -- --vault examples/demo-vault --out artifacts/smoke/ernie/

Options:
  --vault <path>          Generated LLM Wiki vault. Defaults to examples/demo-vault.
  --out <dir>             Output directory. Defaults to ${DEFAULT_OUT_DIR}.
  --model <name>          ERNIE model. Defaults to ERNIE_MODEL or ${ERNIE_AI_STUDIO_DEFAULT_MODEL}.
  --base-url <url>        ERNIE OpenAI-compatible base URL. Defaults to ERNIE_BASE_URL or provider catalog.
  --api-key-env-var <ENV> API key environment variable. Defaults to ERNIE_API_KEY_ENV or ${ERNIE_AI_STUDIO_API_KEY_ENV}.
  --max-evidence <n>      Evidence snippets per question. Defaults to 4.
  --self-test             Run no-key and mock-provider contract tests; never calls ERNIE.`;
}

function normalizeEnvVarName(value: string | undefined, fallback = ERNIE_AI_STUDIO_API_KEY_ENV) {
  const name = String(value || fallback).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new SmokeError(`Invalid API key environment variable name: ${name}`);
  }
  return name;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    vault: "examples/demo-vault",
    out: DEFAULT_OUT_DIR,
    model: process.env.ERNIE_MODEL?.trim() || ERNIE_AI_STUDIO_DEFAULT_MODEL,
    baseUrl: process.env.ERNIE_BASE_URL?.trim() || ERNIE_AI_STUDIO_BASE_URL,
    apiKeyEnvVar: normalizeEnvVarName(process.env[ERNIE_API_KEY_ENV_SETTING]),
    selfTest: false,
    maxEvidence: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--vault") {
      args.vault = mustHaveValue(arg, next);
      index += 1;
    } else if (arg === "--out") {
      args.out = mustHaveValue(arg, next);
      index += 1;
    } else if (arg === "--model") {
      args.model = mustHaveValue(arg, next);
      index += 1;
    } else if (arg === "--base-url") {
      args.baseUrl = mustHaveValue(arg, next);
      index += 1;
    } else if (arg === "--api-key-env-var") {
      args.apiKeyEnvVar = normalizeEnvVarName(mustHaveValue(arg, next));
      index += 1;
    } else if (arg === "--max-evidence") {
      args.maxEvidence = Number(mustHaveValue(arg, next));
      index += 1;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else {
      throw new SmokeError(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (!Number.isFinite(args.maxEvidence) || args.maxEvidence < 1) {
    throw new SmokeError("--max-evidence must be a positive number");
  }
  return args;
}

function mustHaveValue(flag: string, value: string | undefined) {
  if (!value || value.startsWith("--")) throw new SmokeError(`Missing value for ${flag}`);
  return value;
}

function defaultQuestions(): SmokeQuestion[] {
  return [
    {
      id: "q1-sufficient-evidence",
      kind: "sufficient_evidence",
      question: "According to the vault evidence, what should ERNIE answers cite?",
      required_evidence_ids: ["demo:p2:evidence-map"],
      keywords: ["ERNIE", "answers", "cite", "evidence", "ids", "evidence map"],
    },
    {
      id: "q2-incomplete-evidence",
      kind: "incomplete_evidence",
      question: "What does the vault evidence prove about OCR artifacts, and does it prove a production latency SLA?",
      required_evidence_ids: ["demo:p1:artifact"],
      keywords: ["OCR", "artifacts", "Markdown", "JSON", "latency", "SLA"],
    },
    {
      id: "q3-no-evidence",
      kind: "no_evidence",
      question: "What does this vault prove about ZXQ-739 Aurora procurement budgets?",
      required_evidence_ids: [],
      keywords: ["ZXQ-739", "Aurora", "procurement", "budgets"],
      expected_refusal: true,
    },
  ];
}

async function assertVault(vaultPath: string) {
  const resolved = path.resolve(vaultPath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new SmokeError(`Vault path does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) throw new SmokeError(`Vault path is not a directory: ${resolved}`);
  return resolved;
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

function vaultRelative(vault: string, filePath: string) {
  return path.relative(vault, filePath).split(path.sep).join("/");
}

async function readText(filePath: string, maxBytes = 700_000) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    await handle.read(buffer, 0, buffer.length, 0);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

function firstString(value: any, fields: string[]) {
  for (const field of fields) {
    const candidate = value?.[field];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function collectJsonEvidence(value: any, relPath: string, docs: EvidenceDoc[], parentSource?: string | null) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonEvidence(item, relPath, docs, parentSource));
    return;
  }
  const evidenceId = firstString(value, ["evidence_id", "evidenceId", "id", "chunk_id", "chunkId"]);
  const text = firstString(value, ["text", "claim_text", "content", "summary", "markdown", "answer"]);
  const sourcePath = firstString(value, ["source_path", "sourcePath", "raw_source_path", "rawSourcePath"]) || parentSource || null;
  if (evidenceId && text) {
    docs.push({
      evidence_id: evidenceId,
      path: relPath,
      text,
      source_path: sourcePath,
    });
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectJsonEvidence(child, relPath, docs, sourcePath);
  }
}

function extractInlineEvidence(text: string, relPath: string) {
  const docs: EvidenceDoc[] = [];
  const evidenceIdPattern = /\b[A-Za-z][A-Za-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.:-]*/g;
  text.split(/\r?\n/).forEach((line, index) => {
    const ids = Array.from(new Set(line.match(evidenceIdPattern) ?? []));
    for (const id of ids) {
      docs.push({
        evidence_id: id,
        path: `${relPath}#L${index + 1}`,
        text: line.trim(),
        source_path: null,
      });
    }
  });
  return docs;
}

async function loadEvidence(vault: string) {
  const files = await walk(vault);
  const docs: EvidenceDoc[] = [];
  for (const file of files) {
    const rel = vaultRelative(vault, file);
    if (rel.startsWith("raw/")) continue;
    if (rel.endsWith(".jsonl")) {
      const text = await readText(file);
      text.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        try {
          collectJsonEvidence(JSON.parse(line), `${rel}#L${index + 1}`, docs);
        } catch {
          // Ignore malformed JSONL lines in the smoke corpus.
        }
      });
    } else if (rel.endsWith(".json")) {
      try {
        collectJsonEvidence(JSON.parse(await readText(file)), rel, docs);
      } catch {
        // Ignore non-evidence JSON files.
      }
    } else if (rel.endsWith(".md")) {
      docs.push(...extractInlineEvidence(await readText(file), rel));
    }
  }
  return dedupeEvidence(docs);
}

function dedupeEvidence(docs: EvidenceDoc[]) {
  const byKey = new Map<string, EvidenceDoc>();
  for (const doc of docs) {
    const key = `${doc.evidence_id}\n${doc.text}`;
    if (!byKey.has(key)) byKey.set(key, doc);
  }
  return Array.from(byKey.values());
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9_.:-]{2,}/g) ?? []);
}

function searchEvidence(question: SmokeQuestion, docs: EvidenceDoc[], limit: number): EvidenceHit[] {
  const queryTokens = tokens([question.question, ...question.keywords].join(" "));
  const required = new Set(question.required_evidence_ids);
  return docs
    .map((doc) => {
      const haystack = `${doc.evidence_id} ${doc.path} ${doc.text}`;
      const docTokens = tokens(haystack);
      let score = 0;
      for (const token of queryTokens) if (docTokens.has(token)) score += 1;
      if (required.has(doc.evidence_id)) score += 20;
      for (const id of required) {
        if (doc.evidence_id.includes(id) || id.includes(doc.evidence_id)) score += 10;
      }
      return {
        ...doc,
        score,
        snippet: doc.text.replace(/\s+/g, " ").slice(0, MAX_SNIPPET_CHARS),
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function buildPrompt(question: SmokeQuestion, evidence: EvidenceHit[]) {
  const evidenceBlock = evidence.length
    ? evidence.map((item) => `- [${item.evidence_id}] ${item.snippet}`).join("\n")
    : "(no evidence snippets selected)";
  return [
    "Answer using only the provided LLM Wiki evidence snippets and evidence ids.",
    "Do not use outside knowledge. Do not infer from raw documents. Cite evidence ids exactly in square brackets.",
    "If evidence is incomplete, say what is supported and list unsupported_claims.",
    "If no evidence supports the question, refuse with: 当前 vault 证据不足.",
    "Return compact JSON with keys: answer, citations, unsupported_claims, warnings.",
    "",
    `Question: ${question.question}`,
    "Evidence snippets:",
    evidenceBlock,
  ].join("\n");
}

async function callErnieProvider(params: {
  question: SmokeQuestion;
  evidence: EvidenceHit[];
  model: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}): Promise<ProviderResponse> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const prompt = buildPrompt(params.question, params.evidence);
  try {
    const response = await (params.fetchImpl ?? fetch)(`${params.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        stream: false,
        messages: [
          { role: "system", content: "You are an evidence-first LLM Wiki answer evaluator." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const rawText = await response.text();
    if (!response.ok) {
      throw new SmokeError(redactSecrets(`HTTP ${response.status}: ${rawText}`, params.apiKey));
    }
    const value = JSON.parse(rawText);
    const answer = value?.choices?.[0]?.message?.content || value?.result || "";
    return { answer, latency_ms: Date.now() - started, raw_text: rawText };
  } finally {
    clearTimeout(timeout);
  }
}

function parseProviderAnswer(text: string) {
  const fallback = {
    answer: text,
    citations: extractCitations(text),
    unsupported_claims: [] as string[],
    warnings: [] as string[],
  };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced || text).trim();
  try {
    const parsed = JSON.parse(candidate);
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : text,
      citations: citationArray(parsed.citations).concat(extractCitations(typeof parsed.answer === "string" ? parsed.answer : "")),
      unsupported_claims: stringArray(parsed.unsupported_claims),
      warnings: stringArray(parsed.warnings),
    };
  } catch {
    return fallback;
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function citationArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return normalizeCitationId(item);
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        for (const key of ["evidence_id", "evidenceId", "id"]) {
          if (typeof record[key] === "string") return normalizeCitationId(record[key]);
        }
      }
      return "";
    })
    .filter((item) => item.length > 0);
}

function normalizeCitationId(value: string) {
  return value.trim().replace(/^\[+/, "").replace(/\]+$/, "");
}

function extractCitations(value: string) {
  return Array.from(new Set(Array.from(value.matchAll(/\[([A-Za-z][A-Za-z0-9_.:-]*:[A-Za-z0-9_.:-]+)\]/g)).map((match) => match[1])));
}

function answerRefused(value: string) {
  return /当前 vault 证据不足|insufficient evidence|not enough evidence|no evidence/i.test(value);
}

function resultForQuestion(params: {
  question: SmokeQuestion;
  model: string;
  evidence: EvidenceHit[];
  provider: ProviderResponse;
}) {
  const parsed = parseProviderAnswer(params.provider.answer);
  const selectedIds = Array.from(new Set(params.evidence.map((item) => item.evidence_id)));
  const citations = Array.from(new Set(parsed.citations));
  const covered = params.question.required_evidence_ids.filter((id) => citations.some((citation) => citation === id || citation.includes(id) || id.includes(citation)));
  const warnings = [...parsed.warnings];
  const unsupportedClaims = [...parsed.unsupported_claims];
  for (const citation of citations) {
    if (!selectedIds.includes(citation)) warnings.push(`citation_not_in_selected_evidence:${citation}`);
  }
  if (params.question.kind === "no_evidence" && !answerRefused(parsed.answer)) {
    warnings.push("no_evidence_refusal_failed");
    unsupportedClaims.push("The answer did not clearly refuse a no-evidence question.");
  }
  if (params.question.kind === "incomplete_evidence" && unsupportedClaims.length === 0) {
    warnings.push("incomplete_evidence_without_unsupported_claims");
  }
  return {
    id: params.question.id,
    kind: params.question.kind,
    question: params.question.question,
    answer: parsed.answer,
    model: params.model,
    latency_ms: params.provider.latency_ms,
    selected_evidence_ids: selectedIds,
    citations,
    citation_coverage: params.question.required_evidence_ids.length ? covered.length / params.question.required_evidence_ids.length : (citations.length ? 1 : 0),
    unsupported_claims: Array.from(new Set(unsupportedClaims)),
    warnings: Array.from(new Set(warnings)),
    raw_document_sent: false as const,
    status: answerRefused(parsed.answer) ? "refused" as const : "answered" as const,
  };
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSecrets(value: string, secret?: string, apiKeyEnvVar = ERNIE_AI_STUDIO_API_KEY_ENV) {
  let redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/api[_-]?key['\"]?\s*[:=]\s*['\"][^'\"]+['\"]/gi, "api_key: [redacted]");
  for (const marker of Array.from(new Set([ERNIE_AI_STUDIO_API_KEY_ENV, apiKeyEnvVar].filter(Boolean)))) {
    redacted = redacted.replace(new RegExp(`${escapeRegExp(marker)}\\s*=\\s*['"]?[^'\"\\s]+`, "g"), `${marker}=[redacted]`);
  }
  if (secret) redacted = redacted.split(secret).join("[redacted]");
  return redacted;
}

async function runSmoke(args: Args, options: { apiKey?: string; fetchImpl?: FetchLike; writeOutputs?: boolean } = {}) {
  const vault = await assertVault(args.vault);
  const apiKeyEnvVar = normalizeEnvVarName(args.apiKeyEnvVar);
  const apiKey = options.apiKey ?? process.env[apiKeyEnvVar]?.trim() ?? "";
  if (!apiKey) {
    return {
      ok: false,
      status: "missing_key" as const,
      message: `${apiKeyEnvVar} is missing; ERNIE live smoke did not call provider and did not generate a success report.`,
      provider_called: false,
    };
  }
  const questions = defaultQuestions();
  const docs = await loadEvidence(vault);
  const results: QuestionResult[] = [];
  for (const question of questions) {
    const evidence = question.kind === "no_evidence" ? [] : searchEvidence(question, docs, args.maxEvidence);
    try {
      const provider = await callErnieProvider({
        question,
        evidence,
        model: args.model,
        baseUrl: args.baseUrl,
        apiKey,
        fetchImpl: options.fetchImpl,
      });
      results.push(resultForQuestion({ question, model: args.model, evidence, provider }));
    } catch (err) {
      results.push({
        id: question.id,
        kind: question.kind,
        question: question.question,
        answer: "",
        model: args.model,
        latency_ms: null,
        selected_evidence_ids: evidence.map((item) => item.evidence_id),
        citations: [],
        citation_coverage: 0,
        unsupported_claims: [],
        warnings: [redactSecrets(String(err), apiKey, apiKeyEnvVar)],
        raw_document_sent: false,
        status: "provider_error",
      });
    }
  }
  const citationCoverage = average(results.map((item) => item.citation_coverage));
  const unsupportedClaimCount = results.reduce((sum, item) => sum + item.unsupported_claims.length, 0);
  const noEvidence = results.find((item) => item.kind === "no_evidence");
  const output = {
    schema_version: 1,
    smoke_id: "ernie-live-evidence-answer",
    generated_at: new Date().toISOString(),
    commit_hash: gitCommit(),
    vault_path: vault,
    provider: {
      id: "ernie-ai-studio",
      base_url: args.baseUrl,
      model: args.model,
      api_key_env: apiKeyEnvVar,
      api_key_logged: false,
    },
    safety: {
      raw_document_sent: false,
      provider_called_only_when_key_present: true,
      auto_write_concepts_or_sources: false,
      writeback_applied: false,
    },
    metrics: {
      question_count: results.length,
      citation_coverage: citationCoverage,
      unsupported_claim_count: unsupportedClaimCount,
      no_evidence_refused: noEvidence?.status === "refused",
      provider_error_count: results.filter((item) => item.status === "provider_error").length,
    },
    questions: results,
  };
  if (options.writeOutputs !== false) {
    await writeSmokeOutputs(args.out, output);
  }
  return { ok: true, status: "completed" as const, output, provider_called: true };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function writeSmokeOutputs(outDir: string, output: any) {
  const resolved = path.resolve(outDir);
  await fs.mkdir(resolved, { recursive: true });
  await fs.writeFile(path.join(resolved, RESULT_FILE), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(resolved, REPORT_FILE), renderReport(output), "utf8");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function renderReport(output: any) {
  const rows = output.questions.map((item: QuestionResult) => {
    const cells = [
      item.id,
      item.status,
      formatLatency(item.latency_ms),
      item.answer,
      item.selected_evidence_ids.join(", ") || "none",
      item.citations.join(", ") || "none",
      item.unsupported_claims.join("; ") || "none",
      item.warnings.join("; ") || "none",
      String(item.raw_document_sent),
    ].map(markdownTableCell);
    return `| ${cells.join(" | ")} |`;
  }).join("\n");
  return `# ERNIE Live Evidence Answer Smoke Report

Generated at: ${output.generated_at}
Commit hash: ${output.commit_hash}
Vault: \`${output.vault_path}\`
Provider: ERNIE / AI Studio
Model: \`${output.provider.model}\`
Base URL: \`${output.provider.base_url}\`
API key source: \`${output.provider.api_key_env}\`

## Safety

- Raw document sent: ${output.safety.raw_document_sent}
- Auto write concepts/sources: ${output.safety.auto_write_concepts_or_sources}
- Writeback applied: ${output.safety.writeback_applied}
- API key logged: ${output.provider.api_key_logged}

## Metrics

- Question count: ${output.metrics.question_count}
- Citation coverage: ${percent(output.metrics.citation_coverage)}
- Unsupported claim count: ${output.metrics.unsupported_claim_count}
- No-evidence refusal behavior: ${output.metrics.no_evidence_refused ? "passed" : "failed"}
- Provider error count: ${output.metrics.provider_error_count}

## Questions

| Question | Status | Latency | Answer | Selected evidence ids | Citations | Unsupported claims | Warnings | Raw document sent |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
${rows}

## Known Limitations

- This smoke sends only evidence snippets and ids, not raw source documents.
- This smoke does not create, apply, or approve writeback proposals.
- Public CI should run only the no-key and mock-provider contract path; live ERNIE requires a local \`${ERNIE_AI_STUDIO_API_KEY_ENV}\`.
`;
}

function formatLatency(value: number | null) {
  return typeof value === "number" ? `${value} ms` : "n/a";
}

function markdownTableCell(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim()
    .slice(0, 700) || "none";
}

async function runSelfTest() {
  const args: Args = {
    vault: "examples/demo-vault",
    out: "artifacts/smoke/ernie-self-test",
    model: ERNIE_AI_STUDIO_DEFAULT_MODEL,
    baseUrl: ERNIE_AI_STUDIO_BASE_URL,
    apiKeyEnvVar: ERNIE_AI_STUDIO_API_KEY_ENV,
    selfTest: true,
    maxEvidence: 4,
  };
  let providerCalls = 0;
  const missing = await runSmoke(args, { apiKey: "", fetchImpl: async () => {
    providerCalls += 1;
    throw new Error("provider should not be called without key");
  }, writeOutputs: false });
  assert(!missing.ok && missing.status === "missing_key", "missing key must fail safely");
  assert(providerCalls === 0, "missing key path must not call provider");

  const docs = await loadEvidence(path.resolve(args.vault));
  const q1 = defaultQuestions()[0];
  const q3 = defaultQuestions()[2];
  const prompt = buildPrompt(q1, searchEvidence(q1, docs, 4));
  const rawText = await readText(path.resolve(args.vault, "raw/inbox/sample-project.md"));
  assert(!prompt.includes(rawText.trim()), "prompt must not contain raw document body");
  assert(prompt.includes("demo:p2:evidence-map"), "prompt should include evidence ids");

  const fakeFetch: FetchLike = async (_url, init) => {
    providerCalls += 1;
    const body = JSON.parse(String(init?.body ?? "{}"));
    const promptText = body.messages?.map((item: any) => item.content).join("\n") ?? "";
    assert(!promptText.includes(rawText.trim()), "provider request must not contain raw document body");
    const isNoEvidence = promptText.includes(q3.question);
    const content = isNoEvidence
      ? JSON.stringify({ answer: "当前 vault 证据不足。", citations: [], unsupported_claims: [], warnings: ["no selected evidence"] })
      : JSON.stringify({ answer: "ERNIE answers should cite local evidence ids [demo:p2:evidence-map].", citations: ["demo:p2:evidence-map"], unsupported_claims: ["Production latency SLA is not supported."], warnings: [] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const mocked = await runSmoke(args, { apiKey: "mock-secret-token", fetchImpl: fakeFetch, writeOutputs: false });
  assert(mocked.ok, "mock provider smoke should complete");
  assert(mocked.output.metrics.unsupported_claim_count >= 1, "mock provider should surface unsupported claims");
  assert(mocked.output.questions.some((item: QuestionResult) => item.citations.includes("demo:p2:evidence-map")), "mock provider should surface citations");
  assert(mocked.output.questions.find((item: QuestionResult) => item.kind === "no_evidence")?.status === "refused", "Q3 must refuse no-evidence questions");
  assert(citationArray(["[demo:p2:evidence-map]", { evidence_id: "demo:p1:artifact" }]).join(",") === "demo:p2:evidence-map,demo:p1:artifact", "citation parser should normalize bracketed ids and object ids");
  const customEnv = "CUSTOM_AI_STUDIO_API_KEY";
  const previousCustomEnv = process.env[customEnv];
  process.env[customEnv] = "custom-secret-token";
  const customEnvCallsBefore = providerCalls;
  try {
    const customEnvRun = await runSmoke({ ...args, apiKeyEnvVar: customEnv }, { fetchImpl: fakeFetch, writeOutputs: false });
    assert(customEnvRun.ok, "custom key env var smoke should complete");
    assert(customEnvRun.output.provider.api_key_env === customEnv, "custom key env var should be reported by name only");
    assert(providerCalls > customEnvCallsBefore, "custom key env var should allow provider calls");
  } finally {
    if (previousCustomEnv === undefined) delete process.env[customEnv];
    else process.env[customEnv] = previousCustomEnv;
  }

  const redacted = redactSecrets("Bearer mock-secret-token CUSTOM_AI_STUDIO_API_KEY=mock-secret-token", "mock-secret-token", "CUSTOM_AI_STUDIO_API_KEY");
  assert(!redacted.includes("mock-secret-token"), "redaction must remove API key values");
  assert(redacted.includes("CUSTOM_AI_STUDIO_API_KEY=[redacted]"), "redaction must preserve custom key env marker name");
  assertThrows(() => normalizeEnvVarName("bad-name"), "invalid env var names must be rejected");
  console.log("ERNIE live smoke self-test passed.");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeError(message);
}

function assertThrows(fn: () => unknown, message: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new SmokeError(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    await runSelfTest();
    return;
  }
  const result = await runSmoke(args);
  if (!result.ok) {
    console.error(result.status);
    console.error(result.message);
    process.exitCode = 2;
    return;
  }
  console.log(`Wrote ${path.resolve(args.out, RESULT_FILE)}`);
  console.log(`Wrote ${path.resolve(args.out, REPORT_FILE)}`);
  console.log(`Questions: ${result.output.metrics.question_count}; citation coverage: ${percent(result.output.metrics.citation_coverage)}; unsupported claims: ${result.output.metrics.unsupported_claim_count}`);
}

main().catch((err) => {
  const apiKeyEnvVar = (() => {
    try {
      return normalizeEnvVarName(process.env[ERNIE_API_KEY_ENV_SETTING]);
    } catch {
      return ERNIE_AI_STUDIO_API_KEY_ENV;
    }
  })();
  console.error(redactSecrets(String(err), process.env[apiKeyEnvVar], apiKeyEnvVar));
  process.exit(1);
});
