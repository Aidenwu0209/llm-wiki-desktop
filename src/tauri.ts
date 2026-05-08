import { invoke } from "@tauri-apps/api/core";
import type {
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

export function importToInbox(vaultPath: string, paths: string[]): Promise<ImportResult> {
  return invoke("import_to_inbox", { vaultPath, paths });
}

export function planIngest(vaultPath: string): Promise<IngestPlan> {
  return invoke("plan_ingest", { vaultPath });
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
