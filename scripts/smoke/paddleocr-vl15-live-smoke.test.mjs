#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { detectResultUrls, endpointHost, isPendingJob, normalizeEnvVarName, redactText, resolveApiKeyEnvVar, validateLiveManifest } from "./paddleocr-vl15-live-smoke.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const scriptPath = path.join(__dirname, "paddleocr-vl15-live-smoke.mjs");

const fixtureManifest = {
  schema_version: 1,
  source_id: "paddleocr-fixture-0001",
  source_path: "examples/ocr-samples/public-sample.pdf",
  source_sha256: "9".repeat(64),
  artifact_sha256: "a".repeat(64),
  parser: "paddleocr-vl15-live-smoke",
  parser_model: "paddleocr-vl-1.5",
  parser_version: "fixture-contract",
  page_count: 1,
  chunk_count: 2,
  latency_ms: 1234,
  limitations: ["fixture_manifest_not_live_ocr"],
  external_upload: true,
  endpoint_host: "paddleocr.example.com",
};

test("live manifest validator accepts the required contract", () => {
  const result = validateLiveManifest(fixtureManifest);
  assert.equal(result.valid, true, result.errors.join("; "));
});

test("live manifest validator rejects missing artifact fields", () => {
  const result = validateLiveManifest({ ...fixtureManifest, artifact_sha256: "" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /artifact_sha256/);
});

test("endpoint_host keeps only host and port", () => {
  assert.equal(endpointHost(`https://paddleocr.example.com/api/v2/ocr/jobs?${"token"}=secret`), "paddleocr.example.com");
});

test("redaction removes provider secrets from diagnostic text", () => {
  const secret = "abc123";
  const redacted = redactText(`Authorization: Bearer ${secret} and ${"token"}=secret-value https://example.com/result.json?signature=abc`, [secret]);
  assert.doesNotMatch(redacted, /abc123|secret-value/);
  assert.doesNotMatch(redacted, /signature=abc/);
  assert.match(redacted, /\[redacted\]/);
});

test("PaddleOCR job result URLs are detected from official async response shape", () => {
  const urls = detectResultUrls({
    data: {
      resultUrl: {
        jsonUrl: "https://example.com/result.json?signature=abc",
        markdownUrl: "https://example.com/result.md?signature=abc",
      },
    },
  });
  assert.equal(urls.jsonUrl, "https://example.com/result.json?signature=abc");
  assert.equal(urls.markdownUrl, "https://example.com/result.md?signature=abc");
});

test("initial PaddleOCR job id response is treated as pending", () => {
  assert.equal(isPendingJob({ code: 0, msg: "Success", data: { jobId: "54105445113155584" } }), true);
});

test("custom API key environment variable name is supported", () => {
  const previous = process.env.PADDLEOCR_API_KEY_ENV;
  process.env.PADDLEOCR_API_KEY_ENV = "CUSTOM_PADDLEOCR_KEY";
  try {
    assert.equal(resolveApiKeyEnvVar({}), "CUSTOM_PADDLEOCR_KEY");
    assert.equal(resolveApiKeyEnvVar({ apiKeyEnvVar: "OVERRIDE_PADDLEOCR_KEY" }), "OVERRIDE_PADDLEOCR_KEY");
    assert.throws(() => normalizeEnvVarName("bad-name"), /Invalid API key environment variable name/);
  } finally {
    if (previous === undefined) delete process.env.PADDLEOCR_API_KEY_ENV;
    else process.env.PADDLEOCR_API_KEY_ENV = previous;
  }
});

test("missing key fails clearly and does not create a fake success report", async () => {
  const outDir = path.join(repoRoot, "artifacts/test/paddleocr-live-missing-key");
  await fs.rm(outDir, { recursive: true, force: true });
  const env = { ...process.env };
  delete env.PADDLEOCR_API_KEY;
  env.OPEN_LLM_WIKI_LAYOUT_ENDPOINT = "https://paddleocr.example.com/api/v2/ocr/jobs";
  const result = spawnSync(process.execPath, [
    scriptPath,
    "--input",
    "package.json",
    "--out",
    outDir,
  ], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing_key/);
  await assert.rejects(fs.stat(path.join(outDir, "manifest.json")));
});

test("configured key env var is honored and redacted", async () => {
  const outDir = path.join(repoRoot, "artifacts/test/paddleocr-live-custom-key-env");
  await fs.rm(outDir, { recursive: true, force: true });
  const env = {
    ...process.env,
    PADDLEOCR_API_KEY_ENV: "CUSTOM_PADDLEOCR_KEY",
    CUSTOM_PADDLEOCR_KEY: "custom-test-only-secret",
  };
  delete env.PADDLEOCR_API_KEY;
  delete env.OPEN_LLM_WIKI_LAYOUT_ENDPOINT;
  const result = spawnSync(process.execPath, [
    scriptPath,
    "--input",
    "package.json",
    "--out",
    outDir,
  ], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing_endpoint/);
  assert.doesNotMatch(result.stderr, /custom-test-only-secret/);
  await assert.rejects(fs.stat(path.join(outDir, "manifest.json")));
});

test("missing endpoint fails clearly and does not create a fake success report", async () => {
  const outDir = path.join(repoRoot, "artifacts/test/paddleocr-live-missing-endpoint");
  await fs.rm(outDir, { recursive: true, force: true });
  const env = { ...process.env, PADDLEOCR_API_KEY: "test-only-key" };
  delete env.OPEN_LLM_WIKI_LAYOUT_ENDPOINT;
  const result = spawnSync(process.execPath, [
    scriptPath,
    "--input",
    "package.json",
    "--out",
    outDir,
  ], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing_endpoint/);
  assert.doesNotMatch(result.stderr, /test-only-key/);
  await assert.rejects(fs.stat(path.join(outDir, "manifest.json")));
});
