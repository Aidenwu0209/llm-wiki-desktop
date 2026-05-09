import { invoke } from "@tauri-apps/api/core";
import type {
  ClaimLedgerItem,
  ContractFinding,
  ImportResult,
  IngestPipelineResult,
  IngestPlan,
  RuntimeSettings,
  TaskLog,
  VaultStatus,
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
  });
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}
