# LLM Wiki Demo Vault

This vault is a synthetic onboarding sample. It contains no copyrighted papers,
screenshots, or private user material.

Use it to demonstrate the reviewer path:

1. Submit a PDF or image into `raw/inbox/`.
2. Parse it with PaddleOCR-VL-1.5 into Markdown and JSON artifacts.
3. Register evidence ids and source pages.
4. Ask ERNIE using the evidence map.
5. Create a proposal-first writeback under `reviews/query-writeback/`.

The files are intentionally small so the desktop shell can open the vault even
when the real runtime is unavailable.
