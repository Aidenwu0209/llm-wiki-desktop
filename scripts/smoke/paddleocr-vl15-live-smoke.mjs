#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_MODEL = "paddleocr-vl-1.5";
const DEFAULT_API_KEY_ENV_VAR = "PADDLEOCR_API_KEY";
const API_KEY_ENV_VAR_SETTING = "PADDLEOCR_API_KEY_ENV";
const REQUIRED_MANIFEST_FIELDS = [
  "source_id",
  "source_path",
  "source_sha256",
  "artifact_sha256",
  "parser",
  "parser_model",
  "parser_version",
  "page_count",
  "chunk_count",
  "latency_ms",
  "limitations",
  "external_upload",
  "endpoint_host",
];

class LiveOcrSmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LiveOcrSmokeError";
    this.code = code;
  }
}

function usage() {
  return `Usage:
  npm run ocr:live-smoke -- --input <pdf-or-image> --out <artifact-dir>

Environment:
  PADDLEOCR_API_KEY                 Default required key environment variable.
  PADDLEOCR_API_KEY_ENV             Optional key environment variable name.
  OPEN_LLM_WIKI_LAYOUT_ENDPOINT     Required. PaddleOCR job or parse endpoint.
  OPEN_LLM_WIKI_LAYOUT_MODEL        Optional. Defaults to ${DEFAULT_MODEL}.

Options:
  --input <path>                    Required public PDF or image sample.
  --out <path>                      Required output directory for live artifacts.
  --api-key-env-var <ENV>           Key environment variable name. Defaults to PADDLEOCR_API_KEY_ENV or ${DEFAULT_API_KEY_ENV_VAR}.
  --timeout-ms <n>                  Overall HTTP/poll timeout. Defaults to 180000.
  --poll-interval-ms <n>            Async job poll interval. Defaults to 2500.
  --validate-manifest <path>        Validate a manifest and exit without OCR.
  --help                           Show this help.`;
}

function parseArgs(argv) {
  const args = {
    timeoutMs: 180_000,
    pollIntervalMs: 2_500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--input") {
      args.input = next;
      i += 1;
    } else if (arg === "--out") {
      args.out = next;
      i += 1;
    } else if (arg === "--api-key-env-var") {
      args.apiKeyEnvVar = next;
      i += 1;
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(next);
      i += 1;
    } else if (arg === "--poll-interval-ms") {
      args.pollIntervalMs = Number(next);
      i += 1;
    } else if (arg === "--validate-manifest") {
      args.validateManifest = next;
      i += 1;
    } else {
      throw new LiveOcrSmokeError("bad_args", `Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

function normalizeEnvVarName(value, fallback = DEFAULT_API_KEY_ENV_VAR) {
  const name = String(value || fallback).trim();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new LiveOcrSmokeError("bad_args", `Invalid API key environment variable name: ${name}`);
  }
  return name;
}

function resolveApiKeyEnvVar(args) {
  return normalizeEnvVarName(args.apiKeyEnvVar || process.env[API_KEY_ENV_VAR_SETTING] || DEFAULT_API_KEY_ENV_VAR);
}

function requireEnv(name, code) {
  const value = process.env[name]?.trim();
  if (!value) throw new LiveOcrSmokeError(code, `${name} is required for live OCR smoke.`);
  return value;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

function redactText(value, secrets) {
  let output = String(value);
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join("[redacted]");
  }
  output = output.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  output = output.replace(/((?:[?&]|\b)(?:token|access_token|api_key|key|signature)=)[^&\s"]+/gi, "$1[redacted]");
  output = output.replace(/\bhttps?:\/\/[^\s<>"')]+/gi, (match) => {
    try {
      const url = new URL(match);
      if (url.search) url.search = "?[redacted]";
      return url.toString();
    } catch {
      return match;
    }
  });
  return output;
}

function sanitizeForArtifact(value, secrets) {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => sanitizeForArtifact(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeForArtifact(item, secrets)]));
  }
  return value;
}

function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    throw new LiveOcrSmokeError("missing_endpoint", "OPEN_LLM_WIKI_LAYOUT_ENDPOINT must be a valid URL.");
  }
}

function isLocalEndpoint(endpoint) {
  const hostname = new URL(endpoint).hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function postOcrJob(endpoint, apiKey, model, inputPath, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const bytes = await fs.readFile(inputPath);
    const form = new FormData();
    form.set("model", model);
    form.set("optionalPayload", JSON.stringify({
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false,
    }));
    form.set("return_format", "json");
    form.set("output_format", "markdown");
    form.set("file", new Blob([bytes], { type: contentTypeFor(inputPath) }), path.basename(inputPath));
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
      body: form,
    });
    return await parseHttpJson(response, apiKey);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOcrJob(endpoint, apiKey, initial, timeoutMs, pollIntervalMs) {
  const started = Date.now();
  let current = initial;
  let pollUrl = detectPollUrl(endpoint, current);
  while (isPendingJob(current)) {
    if (!pollUrl) throw new LiveOcrSmokeError("poll_url_missing", "OCR endpoint returned an async job without a poll URL.");
    if (Date.now() - started > timeoutMs) throw new LiveOcrSmokeError("timeout", "Timed out waiting for PaddleOCR job.");
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const response = await fetch(pollUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
      },
    });
    current = await parseHttpJson(response, apiKey);
    pollUrl = detectPollUrl(endpoint, current) || pollUrl;
  }
  if (isFailedJob(current)) throw new LiveOcrSmokeError("parser_failed", "PaddleOCR job failed. See sanitized ocr-output.json if it was returned.");
  return current;
}

async function parseHttpJson(response, apiKey) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw_text: text };
  }
  if (!response.ok) {
    throw new LiveOcrSmokeError("http_error", redactText(`HTTP ${response.status}: ${text.slice(0, 1200)}`, [apiKey]));
  }
  return json;
}

async function fetchResultText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new LiveOcrSmokeError("result_download_failed", `HTTP ${response.status} while downloading OCR result: ${text.slice(0, 800)}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function detectResultUrls(value) {
  const resultUrl = value?.resultUrl || value?.result_url || value?.data?.resultUrl || value?.data?.result_url || {};
  return {
    jsonUrl: resultUrl.jsonUrl || resultUrl.json_url || value?.jsonUrl || value?.json_url || value?.data?.jsonUrl || value?.data?.json_url || null,
    markdownUrl: resultUrl.markdownUrl || resultUrl.markdown_url || value?.markdownUrl || value?.markdown_url || value?.data?.markdownUrl || value?.data?.markdown_url || null,
  };
}

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw_text: line };
      }
    });
}

async function downloadOcrResult(jobResult, timeoutMs) {
  const urls = detectResultUrls(jobResult);
  const downloaded = { job: jobResult };
  if (urls.jsonUrl) {
    const jsonlText = await fetchResultText(urls.jsonUrl, timeoutMs);
    downloaded.result_jsonl = parseJsonl(jsonlText);
  }
  if (urls.markdownUrl) {
    downloaded.result_markdown = await fetchResultText(urls.markdownUrl, timeoutMs);
  }
  downloaded.result_urls = urls;
  return downloaded;
}

function detectPollUrl(endpoint, value) {
  const candidates = [
    value?.url,
    value?.job_url,
    value?.jobUrl,
    value?.poll_url,
    value?.pollUrl,
    value?.data?.url,
    value?.data?.job_url,
    value?.data?.jobUrl,
    value?.data?.poll_url,
    value?.data?.pollUrl,
  ].filter((item) => typeof item === "string" && item.trim());
  if (candidates.length) return new URL(candidates[0], endpoint).toString();
  const jobId = findJobId(value);
  if (!jobId) return null;
  return new URL(`${endpoint.replace(/\/$/, "")}/${encodeURIComponent(String(jobId))}`).toString();
}

function findJobId(value) {
  return [
    value?.job_id,
    value?.jobId,
    value?.id,
    value?.data?.job_id,
    value?.data?.jobId,
    value?.data?.id,
  ].find((item) => typeof item === "string" || typeof item === "number");
}

function statusText(value) {
  return String(value?.status || value?.state || value?.data?.status || value?.data?.state || "").toLowerCase();
}

function isPendingJob(value) {
  const status = statusText(value);
  if (!status && findJobId(value) && !detectResultUrls(value).jsonUrl && !detectResultUrls(value).markdownUrl) {
    return true;
  }
  return ["pending", "queued", "running", "processing", "created", "submitted", "in_progress"].includes(status);
}

function isFailedJob(value) {
  const status = statusText(value);
  return ["failed", "error", "cancelled", "canceled", "timeout"].includes(status);
}

function deepFindStrings(value, keys) {
  const found = [];
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const visit = (item, key = "") => {
    if (!item) return;
    if (typeof item === "string" && wanted.has(key.toLowerCase()) && item.trim()) found.push(item.trim());
    if (Array.isArray(item)) item.forEach((child) => visit(child, key));
    if (typeof item === "object") Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  return found;
}

function deepFindNumber(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let found = null;
  const visit = (item, key = "") => {
    if (found !== null || !item) return;
    if (typeof item === "number" && Number.isFinite(item) && wanted.has(key.toLowerCase())) {
      found = item;
      return;
    }
    if (Array.isArray(item)) item.forEach((child) => visit(child, key));
    if (typeof item === "object") Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  return found;
}

function extractPages(value) {
  const officialResultPages = Array.isArray(value?.result_jsonl)
    ? value.result_jsonl.flatMap((item) => {
      const candidates = [
        item?.result?.layoutParsingResults,
        item?.layoutParsingResults,
        item?.data?.result?.layoutParsingResults,
      ].filter(Array.isArray);
      return candidates[0] || [];
    })
    : [];
  if (officialResultPages.length) return officialResultPages;
  const candidates = [value?.pages, value?.data?.pages, value?.result?.pages, value?.output?.pages].filter(Array.isArray);
  return candidates[0] || [];
}

function pageMarkdownText(page) {
  if (typeof page === "string") return page;
  const direct = [
    page?.markdown?.text,
    page?.markdown_text,
    page?.markdownText,
    page?.text,
    page?.content,
    page?.ocr_text,
    page?.page_text,
  ].find((item) => typeof item === "string" && item.trim());
  if (direct) return direct;
  return deepFindStrings(page, ["markdown", "text", "content", "ocr_text", "page_text"]).join("\n\n");
}

function extractMarkdown(value) {
  if (typeof value?.result_markdown === "string" && value.result_markdown.trim()) return value.result_markdown.trim();
  const direct = deepFindStrings(value, ["combined_md", "combined_markdown", "markdown", "markdown_text", "md"]);
  if (direct.length) return direct.join("\n\n");
  const pages = extractPages(value);
  const pageTexts = pages
    .map((page) => pageMarkdownText(page))
    .filter(Boolean);
  if (pageTexts.length) return pageTexts.map((text, index) => `## Page ${index + 1}\n\n${text}`).join("\n\n");
  return "No markdown text was returned by the OCR service. Inspect ocr-output.json for the provider response shape.\n";
}

function extractChunks(value, sourcePath) {
  const explicit = [value?.chunks, value?.data?.chunks, value?.result?.chunks, value?.output?.chunks].find(Array.isArray);
  if (explicit?.length) {
    return explicit.map((chunk, index) => ({
      evidence_id: chunk.evidence_id || chunk.id || `ocr:chunk:${index + 1}`,
      source_path: chunk.source_path || sourcePath,
      page: typeof chunk.page === "number" ? chunk.page : null,
      text: chunk.text || chunk.content || chunk.markdown || JSON.stringify(chunk),
    }));
  }
  const pages = extractPages(value);
  if (pages.length) {
    return pages.map((page, index) => ({
      evidence_id: `ocr:page:${index + 1}`,
      source_path: sourcePath,
      page: index + 1,
      text: pageMarkdownText(page),
    }));
  }
  return [{
    evidence_id: "ocr:combined:1",
    source_path: sourcePath,
    page: null,
    text: extractMarkdown(value),
  }];
}

function numberOrFallback(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validateLiveManifest(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["manifest must be an object"] };
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in value)) errors.push(`${field} is required`);
  }
  for (const field of ["source_id", "source_path", "source_sha256", "artifact_sha256", "parser", "parser_model", "parser_version", "endpoint_host"]) {
    if (typeof value[field] !== "string" || !value[field].trim()) errors.push(`${field} must be a non-empty string`);
  }
  for (const field of ["page_count", "chunk_count", "latency_ms"]) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) errors.push(`${field} must be a non-negative number`);
  }
  if (!Array.isArray(value.limitations)) errors.push("limitations must be an array");
  if (typeof value.external_upload !== "boolean") errors.push("external_upload must be a boolean");
  if (String(value.endpoint_host || "").includes("/") || String(value.endpoint_host || "").includes("?")) {
    errors.push("endpoint_host must not include a path or query string");
  }
  return { valid: errors.length === 0, errors };
}

async function writeArtifacts(args) {
  if (!args.input) throw new LiveOcrSmokeError("bad_args", "Missing --input <path>.");
  if (!args.out) throw new LiveOcrSmokeError("bad_args", "Missing --out <artifact-dir>.");
  const apiKeyEnvVar = resolveApiKeyEnvVar(args);
  const apiKey = requireEnv(apiKeyEnvVar, "missing_key");
  const endpoint = requireEnv("OPEN_LLM_WIKI_LAYOUT_ENDPOINT", "missing_endpoint");
  const model = process.env.OPEN_LLM_WIKI_LAYOUT_MODEL?.trim() || DEFAULT_MODEL;
  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args.out);
  const inputStat = await fs.stat(inputPath).catch(() => null);
  if (!inputStat?.isFile()) throw new LiveOcrSmokeError("bad_args", `Input file does not exist: ${inputPath}`);
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new LiveOcrSmokeError("bad_args", "--timeout-ms must be positive.");
  if (!Number.isFinite(args.pollIntervalMs) || args.pollIntervalMs <= 0) throw new LiveOcrSmokeError("bad_args", "--poll-interval-ms must be positive.");

  const started = Date.now();
  const initial = await postOcrJob(endpoint, apiKey, model, inputPath, args.timeoutMs);
  const jobResult = await pollOcrJob(endpoint, apiKey, initial, args.timeoutMs, args.pollIntervalMs);
  const result = await downloadOcrResult(jobResult, args.timeoutMs);
  const latencyMs = Date.now() - started;
  const secrets = [apiKey, endpoint];
  const sanitized = sanitizeForArtifact(result, secrets);
  const sourceSha256 = await sha256File(inputPath);
  const sourceId = `paddleocr-${sourceSha256.slice(0, 12)}`;
  const sourcePath = path.relative(process.cwd(), inputPath).split(path.sep).join("/");
  const markdown = extractMarkdown(sanitized);
  const chunks = extractChunks(sanitized, sourcePath).filter((chunk) => chunk.text?.trim());
  const pageCount = numberOrFallback(
    deepFindNumber(sanitized, ["page_count", "pageCount", "pages", "totalPages", "extractedPages"]),
    Math.max(1, extractPages(sanitized).length || 1),
  );
  const parserVersion = deepFindStrings(sanitized, ["parser_version", "model_version", "version"])[0] || "unreported";
  const limitations = [
    ...(parserVersion === "unreported" ? ["parser_version_unreported_by_service"] : []),
    ...(chunks.length === 0 ? ["no_chunks_extracted_from_provider_shape"] : []),
    ...(!sanitized.result_markdown ? ["markdown_url_unreported_by_service"] : []),
    ...(!sanitized.result_jsonl && !sanitized.result_markdown ? ["result_urls_missing_from_provider_response"] : []),
  ];

  await fs.mkdir(outDir, { recursive: true });
  const combinedPath = path.join(outDir, "combined.md");
  const outputPath = path.join(outDir, "ocr-output.json");
  const chunksPath = path.join(outDir, "chunks.jsonl");
  const manifestPath = path.join(outDir, "manifest.json");
  await fs.writeFile(combinedPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
  await fs.writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  await fs.writeFile(chunksPath, chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n", "utf8");
  const artifactSha256 = sha256Bytes(Buffer.concat([
    await fs.readFile(combinedPath),
    await fs.readFile(outputPath),
    await fs.readFile(chunksPath),
  ]));
  const manifest = {
    schema_version: 1,
    source_id: sourceId,
    source_path: sourcePath,
    source_sha256: sourceSha256,
    artifact_sha256: artifactSha256,
    parser: "paddleocr-vl15-live-smoke",
    parser_model: model,
    parser_version: parserVersion,
    api_key_env_var: apiKeyEnvVar,
    page_count: pageCount,
    chunk_count: chunks.length,
    latency_ms: latencyMs,
    limitations,
    external_upload: !isLocalEndpoint(endpoint),
    endpoint_host: endpointHost(endpoint),
    outputs: {
      combined_md: "combined.md",
      ocr_output_json: "ocr-output.json",
      chunks_jsonl: "chunks.jsonl",
    },
  };
  const validation = validateLiveManifest(manifest);
  if (!validation.valid) {
    throw new LiveOcrSmokeError("manifest_invalid", `Generated manifest failed validation: ${validation.errors.join("; ")}`);
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outDir, manifest };
}

async function validateManifestFile(filePath) {
  const value = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  return validateLiveManifest(value);
}

async function main() {
  let args = {};
  try {
    args = parseArgs(process.argv.slice(2));
    if (args.validateManifest) {
      const result = await validateManifestFile(args.validateManifest);
      if (!result.valid) throw new LiveOcrSmokeError("manifest_invalid", result.errors.join("; "));
      console.log("manifest_valid");
      return;
    }
    const result = await writeArtifacts(args);
    console.log(JSON.stringify({
      status: "live_success",
      out_dir: result.outDir,
      manifest: result.manifest,
    }, null, 2));
  } catch (err) {
    const code = err instanceof LiveOcrSmokeError ? err.code : "unexpected_error";
    const message = err instanceof Error ? err.message : String(err);
    const apiKeyEnvVar = (() => {
      try {
        return resolveApiKeyEnvVar(args);
      } catch {
        return DEFAULT_API_KEY_ENV_VAR;
      }
    })();
    console.error(JSON.stringify({
      status: code,
      message: redactText(message, [
        process.env[DEFAULT_API_KEY_ENV_VAR],
        process.env[apiKeyEnvVar],
        process.env.OPEN_LLM_WIKI_LAYOUT_ENDPOINT,
      ]),
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  REQUIRED_MANIFEST_FIELDS,
  DEFAULT_API_KEY_ENV_VAR,
  detectResultUrls,
  LiveOcrSmokeError,
  endpointHost,
  isLocalEndpoint,
  isPendingJob,
  normalizeEnvVarName,
  parseArgs,
  redactText,
  resolveApiKeyEnvVar,
  validateLiveManifest,
  writeArtifacts,
};
