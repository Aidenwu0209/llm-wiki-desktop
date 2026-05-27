---
title: OCR ERNIE Evidence Flow
sources:
  - sources/sample-project-source.md
status: synthesis
---

# OCR ERNIE Evidence Flow

The synthetic submission demonstrates a local evidence chain:

`raw source -> PaddleOCR-VL-1.5 -> Markdown / JSON artifact -> LLM Wiki runtime -> Evidence Map -> ERNIE Answer -> Writeback Proposal`

Supported observations:

- PaddleOCR-VL-1.5 is recorded as the parser in `demo:p1:parser`.
- Markdown and JSON artifacts are recorded in `demo:p1:artifact`.
- ERNIE answers must cite local evidence ids from `demo:p2:evidence-map`.
- Writeback remains review-gated by `demo:p3:writeback`.
