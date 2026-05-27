# OCR + ERNIE + Evidence Wiki Benchmark Report

## Run Environment

| Field | Value |
|---|---|
| Run ID | `<run_id>` |
| Generated at | `<timestamp>` |
| Commit hash | `<commit>` |
| Node | `<node_version>` |
| Platform | `<platform>` |
| Vault | `<vault_path>` |

## Benchmark Configuration

| Field | Value |
|---|---|
| OCR parser | `<ocr_parser>` |
| OCR artifact count | `<artifact_count>` |
| ERNIE model | `<ernie_model>` |
| ERNIE status | `<attempted/skipped_missing_key/error>` |
| Questions | `<total_questions>` |

## Metrics

| Metric | Value |
|---|---:|
| parse_success_rate | `<percent>` |
| markdown_generated | `<count>` |
| json_generated | `<count>` |
| manifest_valid | `<yes/no>` |
| chunk_count | `<count>` |
| citation_coverage | `<percent>` |
| unsupported_claim_count | `<count>` |
| traceability_break_count | `<count>` |
| ernie_answer_latency_ms | `<ms or N/A>` |
| ocr_latency_ms | `<ms or N/A>` |
| end_to_end_latency_ms | `<ms>` |
| no_evidence_refusal_rate | `<percent>` |

## Outcome

- Total questions: `<count>`
- Successful local evidence checks: `<count>`
- Failed or partial checks: `<count>`
- Citation coverage: `<percent>`
- Unsupported claims: `<count>`
- Traceability breaks: `<count>`

## Failure Samples

| Question | Category | Citation coverage | Unsupported claim | Traceability breaks |
|---|---|---:|---|---:|
| `<id>` | `<category>` | `<percent>` | `<yes/no>` | `<count>` |

## Next Optimization Suggestions

- Improve OCR/PDF parser coverage for samples that did not produce artifacts.
- Add stronger evidence-id propagation from OCR chunks into answer citations.
- Repair artifacts missing source_id/source_path before using them for synthesis.
- Tighten refusal behavior for questions without sufficient evidence.
- Re-run with `AI_STUDIO_API_KEY` to capture live ERNIE latency and answer quality.
