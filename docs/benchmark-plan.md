# Benchmark Plan: OCR + ERNIE + Evidence Wiki

## Goal

Use a repeatable benchmark to show technical depth beyond desktop pages. The benchmark evaluates whether the product can turn PDF/image evidence into traceable artifacts, answer with evidence ids, refuse unsupported questions, and expose OCR/ERNIE latency.

## Scope

The submission benchmark covers:

- PDF and image parsing through generated Markdown/JSON artifacts.
- OCR artifact quality through chunk counts, source paths, parser labels, and latency.
- Evidence answer behavior through local retrieval and optional ERNIE live answers.
- Citation coverage for questions requiring evidence ids.
- Unsupported claims and no-evidence refusal behavior.
- Traceability breaks when artifacts cannot be mapped back to source evidence.

## Command Contract

```bash
npm run benchmark:submission -- \
  --vault <path> \
  --questions benchmarks/submission-ocr-qa/questions.jsonl \
  --out benchmarks/results/run.json

npm run benchmark:submission:summary -- \
  --in benchmarks/results/run.json \
  --out benchmarks/results/report.md
```

The runner must fail clearly if `--vault` is missing or does not exist. If `AI_STUDIO_API_KEY` is not present, live ERNIE answer generation is skipped, but local evidence scoring still runs.

## Metrics

| Metric | Meaning |
|---|---|
| `parse_success_rate` | Fraction of manifest samples represented by parsed evidence artifacts. |
| `markdown_generated` | Count of generated Markdown pages discovered in the vault. |
| `json_generated` | Count of JSON/JSONL artifacts discovered in the vault. |
| `manifest_valid` | Whether the benchmark sample manifest passed schema checks. |
| `chunk_count` | Number of evidence chunks/pages loaded into the benchmark corpus. |
| `citation_coverage` | Fraction of required evidence ids retrieved/cited by local evidence search. |
| `unsupported_claim_count` | Count of answers that should not be trusted because required evidence is missing or refusal failed. |
| `traceability_break_count` | Missing required evidence ids plus JSON artifacts without source traceability. |
| `ernie_answer_latency_ms` | Average live ERNIE answer latency, or `null` when skipped. |
| `ocr_latency_ms` | Average OCR latency extracted from artifacts, or `null` when not reported. |
| `end_to_end_latency_ms` | Total benchmark wall-clock time. |
| `no_evidence_refusal_rate` | Fraction of insufficient-evidence questions refused by the local benchmark answer. |

## Question Design

The 20-question JSONL set includes:

- Single-document fact retrieval.
- PDF text extraction.
- Embedded image OCR.
- Table row extraction.
- Heading hierarchy understanding.
- Multi-section and multi-document synthesis.
- Evidence-id-only tasks.
- Insufficient-evidence refusal tasks.
- Traceability-break detection.

## Acceptance Use

This benchmark should be used as release evidence, not as product positioning. It is meant to prove that the evidence chain is measurable:

`raw source -> OCR/parse artifact -> chunk/evidence id -> answer citation -> unsupported/refusal/traceability metrics`

Future extensions can add real corpus manifests, per-parser comparison, ERNIE model variants, and a CI smoke mode that runs against a tiny fixture vault.
