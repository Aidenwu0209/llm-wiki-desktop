# Agent Read API

The desktop app exposes a localhost agent API only after the vault state is trustworthy enough for agents to read. DFC-style corpora are evaluation inputs for this gate; they do not change the product into a DFC-specific tool.

## Readiness Gate

Before enabling a localhost read API, run the product scorecard and require these metrics to pass:

- `ingest_plan`
- `registry_manifest`
- `traceability`
- `evidence_search`
- `query_writeback`

The Tauri command `agent_read_api_readiness` returns the current gate result without starting a server:

```ts
import { agentReadApiReadiness } from "./src/tauri";

const readiness = await agentReadApiReadiness(vaultPath);
```

If `enabled` is `false`, do not start or document a live agent API for that vault. Use `unmetRequirements` to decide which Dashboard, Raw Sources, Evidence Search, or Query Writeback state needs repair.

Important distinction:

- `scorecardReady: true` means the vault data passed the read-only API gate.
- `serverImplemented: true` means this desktop build contains a live localhost API server.
- `serverAvailable: true` means an agent can actually connect to the server.
- `enabled` is true only when the vault passed the gate and a live server is available.

## Start / Stop

When the gate passes, Settings -> Agent API can start a token-protected read-only server on `127.0.0.1:19828`:

```ts
import { startAgentReadApi, stopAgentReadApi } from "./src/tauri";

const info = await startAgentReadApi(vaultPath);
console.log(info.baseUrl, info.token);
await stopAgentReadApi();
```

The token is returned for the current desktop session. Agents must send either `Authorization: Bearer <token>` or `X-LLM-Wiki-Token: <token>`.

## Localhost API Contract

The API exposes only localhost, token-protected, read-only routes:

- `GET /health`
- `GET /vault/status`
- `GET /vault/ingest-plan`
- `GET /vault/sources`
- `GET /vault/traceability-warnings`
- `POST /vault/search`
- `GET /vault/graph`
- `POST /vault/read-file`
- `GET /vault/writeback-proposals`
- `POST /vault/rescan-plan`

`POST /vault/search` must return evidence references and snippets only. `POST /vault/read-file` accepts a vault-relative text path and rejects path escapes. `POST /vault/rescan-plan` may refresh plan state but must not run parser, ingest, model, OCR, writeback apply, or external network work.

## Blocked Operations

Agents must not get endpoints that:

- apply writeback proposals;
- set review, proposal, claim, or dashboard statuses;
- write, delete, or overwrite raw/source/concept/claim/review files;
- run parser, ingest pipeline, hosted model, cloud OCR, or external search;
- serve PDF full text to an external service.

## Claude Code / Codex Usage

Ask the desktop app for the readiness report first. If `enabled` or `serverAvailable` is false, the agent should stay on the existing UI-backed flow:

1. Open Dashboard and run Refresh.
2. Open Raw Sources and run Plan.
3. Inspect Traceability warnings.
4. Use Evidence Search and citation coverage.
5. Create Query Writeback proposals only under the approval gate.

Do not infer API readiness from the presence of a vault path alone.
