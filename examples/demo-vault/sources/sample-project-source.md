---
title: Synthetic OCR Source
source_id: DEMO-0001
source_uuid: demo-source-0001
source_path: raw/inbox/sample-project.md
status: published
---

# Synthetic OCR Source

Evidence id `demo:p1:parser` states that the parser is PaddleOCR-VL-1.5.

Evidence id `demo:p1:artifact` states that the parser emits Markdown and JSON
artifacts before runtime ingestion.

Evidence id `demo:p2:evidence-map` states that answers must cite evidence ids
from the local evidence map.

Evidence id `demo:p3:writeback` states that writeback is proposal-first and must
not silently edit source or concept pages.
