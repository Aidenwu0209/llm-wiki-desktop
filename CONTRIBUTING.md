# Contributing

Thanks for helping improve LLM Wiki Desktop. This project is a local-first desktop shell around an open-llm-wiki runtime boundary, so contributions should preserve user privacy, evidence traceability, and proposal-first writeback.

## Local Setup

Install dependencies with the lockfile:

```bash
npm ci
```

Run the desktop app in development:

```bash
npm run desktop:dev
```

Useful validation commands:

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

For targeted Rust checks, prefer a focused filter first, then run the full test suite before opening a PR.

## Pull Request Scope

Each PR should solve one issue or one tightly related change. Keep unrelated refactors, UI polish, provider work, parser work, and documentation updates in separate PRs when possible.

Every PR should include:

- Scope and motivation.
- Safety boundary.
- Tests run.
- Screenshots or recordings for visible UI changes.
- Explicit out-of-scope items.

## Provider Adapter Rules

Provider adapters must keep secrets out of desktop settings and logs. Store API key names, never API key values. Local endpoints must be loopback or HTTPS unless a specific security review approves otherwise.

Provider contributions must document:

- Required environment variables.
- Base URL and protocol shape.
- Whether requests leave the local machine.
- Error redaction behavior.
- Test strategy that does not require live credentials in CI.

Do not fake live provider results. If a smoke test is mocked or dry-run only, label it clearly.

## Parser Adapter Rules

Parser adapters must preserve raw document privacy by default. Do not upload raw documents unless the user explicitly selects and configures a remote endpoint.

Parser contributions must document:

- Supported input types.
- Local vs remote execution boundary.
- Artifact contract shape.
- Failure state in the ingest plan.
- How raw document paths, hashes, and parser metadata are recorded.

Do not fake live OCR results. If PaddleOCR, ERNIE, or another external system is not actually called, describe the result as mocked, dry-run, or configuration-only.

## Privacy And Safety

Do not commit:

- API keys, bearer tokens, cookies, or local credential files.
- User raw documents, private PDFs, screenshots with private paths, or extracted private corpora.
- Generated outputs that imply a live OCR, ERNIE, or provider call happened when it did not.

Do not bypass:

- Proposal-first query writeback.
- Review gates for claims and science review.
- Runtime-owned state boundaries.
- Parser approval gates for cloud endpoints.

## License Note

This repository currently includes an MIT license placeholder because maintainers have not specified another license in the tracked project files. Maintainers should confirm the license choice before public release or broad external contribution.
