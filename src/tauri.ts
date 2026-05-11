import { invoke } from "@tauri-apps/api/core";
import type {
  ClaimLedgerItem,
  ContractFinding,
  DesktopSettings,
  EvidencePathItem,
  ImportBatchResult,
  ImportResult,
  IngestPipelineResult,
  IngestPlan,
  ReviewQueueItem,
  RuntimeSettings,
  TaskLog,
  VaultStatus,
  WritebackProposal,
} from "./types";

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

export function applyWritebackProposal(vaultPath: string, proposalId: string): Promise<WritebackProposal> {
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
  });
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

export function openObsidianVault(vaultPath: string): Promise<void> {
  return invoke("open_obsidian_vault", { vaultPath });
}
