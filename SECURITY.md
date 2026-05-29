# Security Policy

LLM Wiki Desktop is local-first, but it can launch runtime scripts and connect to user-configured model or parser endpoints. Treat vault contents, raw documents, provider settings, and generated proposals as sensitive.

## API Keys

- Do not store API key values in desktop settings.
- Use environment variables, local runtime configuration, or the operating system keychain.
- Redact bearer tokens and API key markers from errors, logs, screenshots, and issue reports.
- Never ask contributors to paste secrets into GitHub issues, PRs, or benchmark artifacts.

## Raw Document Privacy

Raw documents under `raw/` or `raw/inbox/` may contain private research, contracts, medical material, or unreleased data. Do not commit raw user documents, extracted corpora, or screenshots that expose private paths or content.

When reporting bugs, prefer synthetic files or minimal redacted snippets. If a reproduction requires a private document, coordinate privately with the maintainers first.

## Provider Boundaries

Provider adapters must clearly state whether calls are local-only or leave the machine. Remote providers should use HTTPS. Loopback HTTP is acceptable for local model servers, but localhost-prefix spoofing and remote plain HTTP should be rejected.

Do not present a mocked provider check as a live result. Live ERNIE, OCR, or hosted LLM smoke reports must say what endpoint was called and how secrets were supplied without exposing the secret.

## PaddleOCR Endpoint Risk

PaddleOCR-VL-1.5 parsing may upload PDF or image content when configured to use a remote endpoint. The app should keep ingest blocked until the user explicitly configures the endpoint and a visible API key environment variable.

Before enabling a PaddleOCR endpoint, verify:

- The endpoint is trusted.
- The transport is HTTPS or explicitly local.
- Raw document upload is acceptable for that vault.
- Logs do not include raw document bytes or API keys.

## Query Writeback Boundary

Query writeback must remain proposal-first. The app should create reviewable proposals and require explicit human approval before modifying concept or source pages. Security fixes must not bypass this approval boundary unless the user has explicitly requested a controlled recovery operation.

## Reporting A Vulnerability

Please report security issues privately to the maintainers instead of opening a public issue. If no dedicated security contact is configured for the repository, use GitHub's private vulnerability reporting feature or contact the repository owner through their GitHub profile.

Include:

- A concise description of the issue.
- Affected version or commit.
- Reproduction steps using synthetic or redacted data.
- Whether secrets, raw documents, or external endpoints are involved.

Do not include API keys, raw private documents, or unredacted user data in the report.
