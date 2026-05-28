import { invoke } from "@tauri-apps/api/core";
import type {
  ClaimLedgerItem,
  AgentReadApiReadiness,
  AgentReadApiServerInfo,
  ContractFinding,
  DesktopAppState,
  DesktopSettings,
  EvidencePathItem,
  ImportBatchResult,
  ImportResult,
  IngestPipelineResult,
  LlmApiKeyCheckResult,
  LlmAnswerRequest,
  LlmAnswerResult,
  LlmCliCheckResult,
  LlmProviderTestResult,
  IngestPlan,
  OcrParserSettings,
  OcrParserTestResult,
  ProviderAnswerDraft,
  ProviderAnswerRequest,
  QueryWritebackDraft,
  ReviewQueueItem,
  RuntimeSettings,
  TaskLog,
  RuntimeJobEvent,
  TraceabilityWarning,
  VaultEntryNote,
  VaultImageFilePreview,
  VaultRestoreResult,
  VaultTextFilePreview,
  VaultSuggestion,
  VaultStatus,
  WritebackApplyResult,
  WritebackProposal,
} from "./types";

export function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function loadAppState(): Promise<DesktopAppState> {
  return invoke("load_app_state");
}

export function saveLastSelectedVault(vaultPath: string): Promise<DesktopAppState> {
  return invoke("save_last_selected_vault", { vaultPath });
}

export function saveInterfaceLanguage(interfaceLanguage: "zh" | "en"): Promise<DesktopAppState> {
  return invoke("save_interface_language", { interfaceLanguage });
}

export function restoreLastSelectedVault(): Promise<VaultRestoreResult> {
  return invoke("restore_last_selected_vault");
}

export function listVaultSuggestions(): Promise<VaultSuggestion[]> {
  return invoke("list_vault_suggestions");
}

export function inspectVault(vaultPath: string): Promise<VaultStatus> {
  return invoke("inspect_vault", { vaultPath });
}

export function createVault(
  vaultPath: string,
  settings: RuntimeSettings,
  enableObsidian: boolean,
): Promise<VaultStatus> {
  return invoke("create_vault", {
    vaultPath,
    runtimePath: settings.runtimePath || null,
    pythonPath: settings.pythonPath,
    enableObsidian,
    obsidianProfile: settings.obsidianProfile,
    skipDownloads: settings.skipDownloads,
  });
}

export function repairObsidianTemplates(vaultPath: string): Promise<VaultStatus> {
  return invoke("repair_obsidian_templates", { vaultPath });
}

export function importToInbox(vaultPath: string, paths: string[]): Promise<ImportResult> {
  return invoke("import_to_inbox", { vaultPath, paths });
}

export function importSources(
  vaultPath: string,
  paths: string[],
  enqueueAfterImport: boolean,
  preserveFolders: boolean,
): Promise<ImportBatchResult> {
  return invoke("import_sources", { vaultPath, paths, enqueueAfterImport, preserveFolders });
}

export function loadDesktopSettings(vaultPath: string): Promise<DesktopSettings> {
  return invoke("load_desktop_settings", { vaultPath });
}

export function saveDesktopSettings(vaultPath: string, settings: DesktopSettings): Promise<DesktopSettings> {
  return invoke("save_desktop_settings", { vaultPath, settings });
}

export function checkLocalLlmCli(command: "codex" | "claude"): Promise<LlmCliCheckResult> {
  return invoke("check_local_llm_cli", { command });
}

export function checkLlmApiKey(providerId: string, apiKeyEnvVar: string): Promise<LlmApiKeyCheckResult> {
  return invoke("check_llm_api_key", { providerId, apiKeyEnvVar });
}

export function checkErnieProvider(): Promise<LlmProviderTestResult> {
  return invoke("check_ernie_provider");
}

export function testErnieChat(model: string, apiKeyEnvVar: string, baseUrl: string): Promise<LlmProviderTestResult> {
  return invoke("test_ernie_chat", { model, apiKeyEnvVar, baseUrl });
}

export function checkPaddleOcrVl15Config(settings: OcrParserSettings): Promise<OcrParserTestResult> {
  return invoke("check_paddleocr_vl15_config", {
    endpoint: settings.endpoint,
    apiKeyEnvVar: settings.apiKeyEnvVar,
    model: settings.model,
  });
}

export function testPaddleOcrVl15Connection(settings: OcrParserSettings): Promise<OcrParserTestResult> {
  return invoke("test_paddleocr_vl15_connection", {
    endpoint: settings.endpoint,
    apiKeyEnvVar: settings.apiKeyEnvVar,
    model: settings.model,
  });
}

export function testPaddleOcrVl15Parser(settings: OcrParserSettings): Promise<OcrParserTestResult> {
  return invoke("test_paddleocr_vl15_parser", {
    endpoint: settings.endpoint,
    apiKeyEnvVar: settings.apiKeyEnvVar,
    model: settings.model,
  });
}

export function generateLlmAnswer(vaultPath: string, request: LlmAnswerRequest): Promise<LlmAnswerResult> {
  return invoke("generate_llm_answer", { vaultPath, request });
}

export function generateErnieEvidenceAnswer(vaultPath: string, request: ProviderAnswerRequest): Promise<ProviderAnswerDraft> {
  return invoke("generate_ernie_evidence_answer", { vaultPath, request });
}

export function agentReadApiReadiness(vaultPath: string): Promise<AgentReadApiReadiness> {
  return invoke("agent_read_api_readiness", { vaultPath });
}

export function startAgentReadApi(vaultPath: string, port?: number): Promise<AgentReadApiServerInfo> {
  return invoke("start_agent_read_api", { vaultPath, port: port ?? null });
}

export function stopAgentReadApi(): Promise<AgentReadApiServerInfo> {
  return invoke("stop_agent_read_api");
}

export function planIngest(vaultPath: string): Promise<IngestPlan> {
  return invoke("plan_ingest", { vaultPath });
}

export function runIngestLint(vaultPath: string): Promise<ContractFinding[]> {
  return invoke("run_ingest_lint", { vaultPath });
}

export function setDashboardActionStatus(
  vaultPath: string,
  actionId: string,
  status: "open" | "resolved" | "ignored",
): Promise<IngestPlan> {
  return invoke("set_dashboard_action_status", { vaultPath, actionId, status });
}

export function setIngestJobStatus(
  vaultPath: string,
  jobId: string,
  status: "queued" | "running" | "blocked" | "cancelled" | "succeeded" | "failed",
): Promise<IngestPlan> {
  return invoke("set_ingest_job_status", { vaultPath, jobId, status });
}

export function listClaimLedger(vaultPath: string): Promise<ClaimLedgerItem[]> {
  return invoke("list_claim_ledger", { vaultPath });
}

export function setClaimVerdict(
  vaultPath: string,
  claimId: string,
  verdict: "supported" | "needs_review" | "stale" | "contradicted" | "ignored" | "unknown",
): Promise<ClaimLedgerItem[]> {
  return invoke("set_claim_verdict", { vaultPath, claimId, verdict });
}

export function listEvidencePaths(vaultPath: string): Promise<EvidencePathItem[]> {
  return invoke("list_evidence_paths", { vaultPath });
}

export function listTraceabilityWarnings(vaultPath: string): Promise<TraceabilityWarning[]> {
  return invoke("list_traceability_warnings", { vaultPath });
}

export function listReviewQueue(vaultPath: string): Promise<ReviewQueueItem[]> {
  return invoke("list_review_queue", { vaultPath });
}

export function setReviewItemStatus(
  vaultPath: string,
  itemId: string,
  status: "open" | "approved" | "rejected" | "resolved" | "ignored" | "needs_review",
  note?: string,
): Promise<ReviewQueueItem[]> {
  return invoke("set_review_item_status", { vaultPath, itemId, status, note: note ?? null });
}

export function createFollowupAction(
  vaultPath: string,
  title: string,
  body: string,
  targetPath?: string | null,
): Promise<ReviewQueueItem[]> {
  return invoke("create_followup_action", { vaultPath, title, body, targetPath: targetPath ?? null });
}

export function createWritebackProposal(
  vaultPath: string,
  targetPath: string,
  title: string,
  content: string,
): Promise<WritebackProposal> {
  return invoke("create_writeback_proposal", { vaultPath, targetPath, title, content });
}

export function createQueryWritebackProposal(
  vaultPath: string,
  query: string,
  targetPath: string,
  title: string,
): Promise<QueryWritebackDraft> {
  return invoke("create_query_writeback_proposal", { vaultPath, query, targetPath, title });
}

export function listWritebackProposals(vaultPath: string): Promise<WritebackProposal[]> {
  return invoke("list_writeback_proposals", { vaultPath });
}

export function setWritebackStatus(
  vaultPath: string,
  proposalId: string,
  status: "proposed" | "approved" | "rejected",
): Promise<WritebackProposal> {
  return invoke("set_writeback_status", { vaultPath, proposalId, status });
}

export function applyWritebackProposal(vaultPath: string, proposalId: string): Promise<WritebackApplyResult> {
  return invoke("apply_writeback_proposal", { vaultPath, proposalId });
}

export function createDiagnosticBundle(vaultPath: string): Promise<string> {
  return invoke("create_diagnostic_bundle", { vaultPath });
}

export function runIngestPipeline(
  vaultPath: string,
  settings: RuntimeSettings,
): Promise<IngestPipelineResult> {
  return invoke("run_ingest_pipeline", {
    vaultPath,
    runtimePath: settings.runtimePath || null,
    pythonPath: settings.pythonPath,
    obsidianProfile: settings.obsidianProfile,
    skipDownloads: settings.skipDownloads,
    pdfParser: settings.pdfParser,
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    timeoutSeconds: settings.timeoutSeconds,
    retryCount: settings.retryCount,
  });
}

export function startIngestPipelineJob(
  vaultPath: string,
  settings: RuntimeSettings,
): Promise<RuntimeJobEvent> {
  return invoke("start_ingest_pipeline_job", {
    vaultPath,
    runtimePath: settings.runtimePath || null,
    pythonPath: settings.pythonPath,
    obsidianProfile: settings.obsidianProfile,
    skipDownloads: settings.skipDownloads,
    pdfParser: settings.pdfParser,
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    timeoutSeconds: settings.timeoutSeconds,
    retryCount: settings.retryCount,
  });
}

export function runRuntimeCommand(
  vaultPath: string,
  settings: RuntimeSettings,
  kind: string,
): Promise<TaskLog> {
  return invoke("run_runtime_command", {
    vaultPath,
    runtimePath: settings.runtimePath || null,
    pythonPath: settings.pythonPath,
    kind,
    obsidianProfile: settings.obsidianProfile,
    skipDownloads: settings.skipDownloads,
    pdfParser: settings.pdfParser,
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    timeoutSeconds: settings.timeoutSeconds,
    retryCount: settings.retryCount,
  });
}

export function startRuntimeCommandJob(
  vaultPath: string,
  settings: RuntimeSettings,
  kind: string,
): Promise<RuntimeJobEvent> {
  return invoke("start_runtime_command_job", {
    vaultPath,
    runtimePath: settings.runtimePath || null,
    pythonPath: settings.pythonPath,
    kind,
    obsidianProfile: settings.obsidianProfile,
    skipDownloads: settings.skipDownloads,
    pdfParser: settings.pdfParser,
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    timeoutSeconds: settings.timeoutSeconds,
    retryCount: settings.retryCount,
  });
}

export function cancelRuntimeJob(jobId: string): Promise<void> {
  return invoke("cancel_runtime_job", { jobId });
}

export function listRuntimeJobs(vaultPath: string): Promise<RuntimeJobEvent[]> {
  return invoke("list_runtime_jobs", { vaultPath });
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

export function revealPath(path: string): Promise<void> {
  return invoke("reveal_path", { path });
}

export function openVaultPath(vaultPath: string, path: string): Promise<void> {
  return invoke("open_vault_path", { vaultPath, path });
}

export function readVaultTextFile(vaultPath: string, path: string): Promise<VaultTextFilePreview> {
  return invoke("read_vault_text_file", { vaultPath, path });
}

export function readVaultImageFile(vaultPath: string, path: string): Promise<VaultImageFilePreview> {
  return invoke("read_vault_image_file", { vaultPath, path });
}

export function resolveVaultEntryNote(vaultPath: string): Promise<VaultEntryNote> {
  return invoke("resolve_vault_entry_note", { vaultPath });
}

export function openObsidianVault(vaultPath: string): Promise<VaultEntryNote> {
  return invoke("open_obsidian_vault", { vaultPath });
}
