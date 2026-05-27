# Submission OCR QA Benchmark

This benchmark proves the submission is more than UI work by measuring the local evidence pipeline:
PDF/image OCR artifacts, generated Markdown/JSON, evidence search, citation coverage, unsupported claims,
traceability breaks, and optional ERNIE answer latency.

## Files

- `questions.jsonl` - 20 benchmark questions covering single-document lookup, OCR text, tables, heading hierarchy, synthesis, refusal, and evidence-id citation.
- `sample-manifest.json` - schema and sample contract for expected OCR/PDF artifacts and evidence ids.

## Run

```bash
npm run benchmark:submission -- \
  --vault /absolute/path/to/generated-vault \
  --questions benchmarks/submission-ocr-qa/questions.jsonl \
  --out benchmarks/results/run.json
```

Then render a stable Markdown report:

```bash
npm run benchmark:submission:summary -- \
  --in benchmarks/results/run.json \
  --out benchmarks/results/report.md
```

`benchmarks/results/` is ignored by Git so local benchmark output does not pollute PRs.

## ERNIE

Live ERNIE answers are optional. If `AI_STUDIO_API_KEY` is visible to the process, the runner calls
AI Studio's OpenAI-compatible chat endpoint and records `ernie_answer_latency_ms`. Without the key,
the benchmark still runs local OCR/evidence checks and records ERNIE as `skipped_missing_key`.

To force local-only mode:

```bash
npm run benchmark:submission -- --vault /path/to/vault --no-ernie
```

## Mock OCR Artifact Shape

The runner accepts Markdown pages plus JSON/JSONL artifacts. A minimal OCR chunk can look like this:

```json
{"evidence_id":"mock-paper:p1:title","source_path":"raw/sources/mock-submission.pdf","ocr_parser":"mock-ocr","ocr_latency_ms":120,"text":"Submission OCR QA Benchmark"}
```

For JSONL chunks:

```jsonl
{"evidence_id":"mock-artifact:chunks","source_path":"raw/sources/mock-submission.pdf","text":"chunk_count: 6"}
{"evidence_id":"mock-report:citation-coverage","source_path":"reports/benchmark.md","text":"citation_coverage is reported as a benchmark metric"}
```

## Required Metrics

- `parse_success_rate`
- `markdown_generated`
- `json_generated`
- `manifest_valid`
- `chunk_count`
- `citation_coverage`
- `unsupported_claim_count`
- `traceability_break_count`
- `ernie_answer_latency_ms`
- `ocr_latency_ms`
- `end_to_end_latency_ms`
- `no_evidence_refusal_rate`
