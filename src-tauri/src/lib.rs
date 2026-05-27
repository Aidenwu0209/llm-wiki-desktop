use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

const MAX_VAULT_TEXT_PREVIEW_BYTES: u64 = 64 * 1024;
const MAX_VAULT_IMAGE_PREVIEW_BYTES: u64 = 5 * 1024 * 1024;
const GENERATED_PURPOSE_MARKER: &str = "<!-- llm-wiki-desktop:generated-purpose -->";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultCounts {
    inbox: usize,
    notes: usize,
    sources: usize,
    drafts: usize,
    concepts: usize,
    reports: usize,
    claims: usize,
    claims_needing_review: usize,
    science_review_queue: usize,
    growth_queue: usize,
    stale_claims: usize,
    contradicted_claims: usize,
    ingest_jobs: usize,
    actions: usize,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ReadingQualitySummary {
    concepts: usize,
    sources: usize,
    findings: usize,
    trust_issues: usize,
    duplicate_groups: usize,
    orphan_concepts: usize,
    stale_evidence_references: usize,
    broken_evidence_references: usize,
    source_identity_drift: usize,
    low_synthesis_concepts: usize,
    report_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReadingQualityFinding {
    finding_id: String,
    severity: String,
    kind: String,
    object_type: String,
    object_id: String,
    title: String,
    detail: String,
    path: Option<String>,
    evidence_paths: Vec<String>,
    recommendation: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConceptReadingQuality {
    concept_path: String,
    title: String,
    source_ids: Vec<String>,
    source_pages: Vec<String>,
    claim_ids: Vec<String>,
    artifact_paths: Vec<String>,
    artifact_statuses: Vec<String>,
    issues: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReadingQualityReport {
    generated_at: String,
    vault_path: String,
    summary: ReadingQualitySummary,
    findings: Vec<ReadingQualityFinding>,
    concepts: Vec<ConceptReadingQuality>,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ProductScorecardSummary {
    passed: usize,
    failed: usize,
    manual: usize,
    not_run: usize,
    report_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProductScorecardMetric {
    metric_id: String,
    label: String,
    status: String,
    evidence: Vec<String>,
    counts: Vec<String>,
    next_action: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProductScorecardReport {
    generated_at: String,
    vault_path: String,
    corpus_role: String,
    summary: ProductScorecardSummary,
    metrics: Vec<ProductScorecardMetric>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentReadApiEndpoint {
    method: String,
    path: String,
    capability: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentReadApiReadiness {
    enabled: bool,
    reason: String,
    bind_host: String,
    token_required: bool,
    scorecard_ready: bool,
    server_implemented: bool,
    server_available: bool,
    scorecard: ProductScorecardSummary,
    required_metrics: Vec<String>,
    unmet_requirements: Vec<String>,
    endpoints: Vec<AgentReadApiEndpoint>,
    blocked_operations: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentReadApiServerInfo {
    enabled: bool,
    reason: String,
    bind_host: String,
    port: u16,
    base_url: String,
    token: Option<String>,
    vault_path: String,
    endpoints: Vec<AgentReadApiEndpoint>,
    blocked_operations: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    name: String,
    path: String,
    kind: String,
    source_id: Option<String>,
    title: Option<String>,
    excerpt: Option<String>,
    status: Option<String>,
    updated: Option<String>,
    qa_verdict: Option<String>,
    needs_review: usize,
    outbound_links: Vec<String>,
    inbound_links: Vec<String>,
    source_refs: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultTextFilePreview {
    path: String,
    size_bytes: u64,
    content: String,
    truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultImageFilePreview {
    path: String,
    size_bytes: u64,
    mime_type: String,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    path: String,
    schema_valid: bool,
    runtime_installed: bool,
    obsidian_enabled: bool,
    dashboard_available: bool,
    runtime_scripts_path: Option<String>,
    runtime_version: Option<String>,
    last_updated: Option<String>,
    counts: VaultCounts,
    reading_quality: Option<ReadingQualitySummary>,
    product_scorecard: Option<ProductScorecardSummary>,
    files: Vec<VaultFile>,
    errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopAppState {
    last_selected_vault: Option<String>,
    #[serde(default = "default_interface_language")]
    interface_language: String,
    recent_vaults: Vec<String>,
    updated_at: Option<String>,
}

impl Default for DesktopAppState {
    fn default() -> Self {
        Self {
            last_selected_vault: None,
            interface_language: default_interface_language(),
            recent_vaults: Vec::new(),
            updated_at: None,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultRestoreResult {
    state: DesktopAppState,
    vault_path: Option<String>,
    exists: bool,
    status: Option<VaultStatus>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultSuggestion {
    label: String,
    path: String,
    kind: String,
    exists: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VaultEntryNote {
    vault_path: String,
    entry_path: Option<String>,
    entry_relative_path: Option<String>,
    obsidian_uri: Option<String>,
    fallback_path: String,
    reason: String,
    warning: Option<String>,
    is_workspace_root: bool,
    is_raw_source_folder: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopPlatform {
    Macos,
    Windows,
    Linux,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopCommandSpec {
    program: String,
    args: Vec<String>,
}

impl DesktopCommandSpec {
    fn new(program: impl Into<String>, args: impl IntoIterator<Item = String>) -> Self {
        Self {
            program: program.into(),
            args: args.into_iter().collect(),
        }
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command
    }
}

fn current_desktop_platform() -> DesktopPlatform {
    if cfg!(target_os = "macos") {
        DesktopPlatform::Macos
    } else if cfg!(target_os = "windows") {
        DesktopPlatform::Windows
    } else {
        DesktopPlatform::Linux
    }
}

fn local_cli_lookup_command(platform: DesktopPlatform, command: &str) -> DesktopCommandSpec {
    match platform {
        DesktopPlatform::Windows => DesktopCommandSpec::new("where", [command.to_string()]),
        DesktopPlatform::Macos | DesktopPlatform::Linux => DesktopCommandSpec::new(
            "/bin/sh",
            ["-lc".to_string(), format!("command -v {command}")],
        ),
    }
}

fn open_path_command(platform: DesktopPlatform, target: &Path) -> DesktopCommandSpec {
    let target = to_display(target);
    match platform {
        DesktopPlatform::Macos => DesktopCommandSpec::new("open", [target]),
        DesktopPlatform::Windows => DesktopCommandSpec::new("explorer", [target]),
        DesktopPlatform::Linux => DesktopCommandSpec::new("xdg-open", [target]),
    }
}

fn reveal_path_command(
    platform: DesktopPlatform,
    target: &Path,
    target_is_dir: bool,
) -> DesktopCommandSpec {
    let target = to_display(target);
    match platform {
        DesktopPlatform::Macos => DesktopCommandSpec::new("open", ["-R".to_string(), target]),
        DesktopPlatform::Windows if !target_is_dir => {
            DesktopCommandSpec::new("explorer", [format!("/select,{target}")])
        }
        DesktopPlatform::Windows => DesktopCommandSpec::new("explorer", [target]),
        DesktopPlatform::Linux if !target_is_dir => {
            let folder = Path::new(&target)
                .parent()
                .map(to_display)
                .unwrap_or_else(|| target.clone());
            DesktopCommandSpec::new("xdg-open", [folder])
        }
        DesktopPlatform::Linux => DesktopCommandSpec::new("xdg-open", [target]),
    }
}

fn obsidian_uri_command(platform: DesktopPlatform, uri: &str) -> DesktopCommandSpec {
    match platform {
        DesktopPlatform::Macos => DesktopCommandSpec::new(
            "open",
            ["-a".to_string(), "Obsidian".to_string(), uri.to_string()],
        ),
        DesktopPlatform::Windows => DesktopCommandSpec::new(
            "cmd",
            [
                "/C".to_string(),
                "start".to_string(),
                "".to_string(),
                uri.to_string(),
            ],
        ),
        DesktopPlatform::Linux => DesktopCommandSpec::new("xdg-open", [uri.to_string()]),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskLog {
    id: String,
    kind: String,
    command: Vec<String>,
    started_at: String,
    ended_at: String,
    exit_code: i32,
    stdout: String,
    stderr: String,
    log_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeJobEvent {
    job_id: String,
    kind: String,
    status: String,
    stream: Option<String>,
    line: Option<String>,
    stage: String,
    attempt: usize,
    max_attempts: usize,
    #[serde(default)]
    retry_count: usize,
    command: Vec<String>,
    started_at: String,
    ended_at: Option<String>,
    elapsed_ms: u128,
    #[serde(default)]
    duration_ms: u128,
    exit_code: Option<i32>,
    log_path: Option<String>,
    live_log_path: Option<String>,
    stdout_tail: Option<String>,
    stderr_tail: Option<String>,
    retry_of: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    copied: Vec<VaultFile>,
    skipped_duplicates: Vec<String>,
    errors: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ImportPreview {
    source_path: String,
    file_name: String,
    size_bytes: u64,
    mime: String,
    sha256: String,
    target_path: Option<String>,
    folder_context: Option<String>,
    duplicate_of: Option<String>,
    duplicate_reason: Option<String>,
    approximate_duplicate_of: Option<String>,
    doi: Option<String>,
    arxiv_id: Option<String>,
    title_hint: Option<String>,
    status: String,
    enqueued: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportBatchResult {
    imported: Vec<ImportPreview>,
    skipped_duplicates: Vec<ImportPreview>,
    errors: Vec<String>,
    enqueued_jobs: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    runtime_path: String,
    python_path: String,
    uv_path: String,
    #[serde(default)]
    project_name: String,
    #[serde(default = "default_project_template")]
    project_template: String,
    #[serde(default)]
    project_purpose: String,
    #[serde(default = "default_ai_output_language")]
    ai_output_language: String,
    #[serde(default = "default_interface_language")]
    interface_language: String,
    #[serde(default)]
    parent_directory: String,
    layout_parsing_api_url: String,
    layout_parsing_token_present: bool,
    cloud_parsing_allowed: bool,
    #[serde(default = "default_pdf_parser")]
    default_pdf_parser: String,
    default_ingest_mode: String,
    default_obsidian_profile: String,
    #[serde(default)]
    embedding_enabled: bool,
    #[serde(default)]
    embedding_endpoint: String,
    #[serde(default = "default_embedding_api_key_env_var")]
    embedding_api_key_env_var: String,
    #[serde(default)]
    embedding_model: String,
    #[serde(default)]
    embedding_output_dimensions: usize,
    #[serde(default = "default_embedding_max_chunk_chars")]
    embedding_max_chunk_chars: usize,
    #[serde(default = "default_embedding_overlap_chunk_chars")]
    embedding_overlap_chunk_chars: usize,
    #[serde(default)]
    captioning_enabled: bool,
    #[serde(default = "default_true")]
    captioning_use_main_provider: bool,
    #[serde(default = "default_captioning_provider")]
    captioning_provider: String,
    #[serde(default)]
    captioning_endpoint: String,
    #[serde(default = "default_captioning_api_key_env_var")]
    captioning_api_key_env_var: String,
    #[serde(default)]
    captioning_model: String,
    #[serde(default = "default_captioning_concurrency")]
    captioning_concurrency: usize,
    #[serde(default)]
    web_search_enabled: bool,
    #[serde(default = "default_web_search_provider")]
    web_search_provider: String,
    #[serde(default = "default_web_search_api_key_env_var")]
    web_search_api_key_env_var: String,
    #[serde(default)]
    web_search_endpoint: String,
    #[serde(default = "default_web_search_categories")]
    web_search_categories: String,
    #[serde(default = "default_true")]
    web_search_audit_log: bool,
    #[serde(default)]
    proxy_enabled: bool,
    #[serde(default)]
    proxy_url: String,
    #[serde(default = "default_true")]
    proxy_bypass_local: bool,
    #[serde(default)]
    source_watch_enabled: bool,
    #[serde(default)]
    source_watch_auto_ingest: bool,
    #[serde(default = "default_source_watch_allowed_extensions")]
    source_watch_allowed_extensions: String,
    #[serde(default = "default_source_watch_exclude_dirs")]
    source_watch_exclude_dirs: String,
    #[serde(default = "default_source_watch_exclude_extensions")]
    source_watch_exclude_extensions: String,
    #[serde(default = "default_source_watch_exclude_globs")]
    source_watch_exclude_globs: String,
    #[serde(default = "default_source_watch_max_file_size_mb")]
    source_watch_max_file_size_mb: usize,
    #[serde(default)]
    scheduled_import_enabled: bool,
    #[serde(default = "default_scheduled_import_path")]
    scheduled_import_path: String,
    #[serde(default = "default_scheduled_import_interval_minutes")]
    scheduled_import_interval_minutes: usize,
    #[serde(default = "default_chat_history_messages")]
    chat_history_messages: usize,
    #[serde(default = "default_interface_density")]
    interface_density: String,
    retry_count: usize,
    timeout_seconds: usize,
    auto_run_lint_after_writes: bool,
    auto_open_reports_after_failures: bool,
    skip_obsidian_plugin_downloads: bool,
    #[serde(default = "default_llm_provider_center")]
    llm_provider_center: LlmProviderCenterSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LlmProviderCenterSettings {
    active_provider_id: Option<String>,
    #[serde(default)]
    providers: HashMap<String, LlmProviderConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LlmProviderConfig {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    expanded: bool,
    #[serde(default)]
    selected_model: String,
    #[serde(default)]
    custom_model: String,
    #[serde(default = "default_context_window")]
    context_window: usize,
    #[serde(default = "default_reasoning_mode")]
    reasoning_mode: String,
    #[serde(default)]
    api_base_url: String,
    #[serde(default)]
    api_key_env_var: String,
    #[serde(default)]
    api_protocol: String,
    #[serde(default)]
    api_key_configured: bool,
    #[serde(default)]
    api_key_checked_at: Option<String>,
    #[serde(default)]
    cli_available: bool,
    #[serde(default)]
    cli_version: Option<String>,
    #[serde(default)]
    cli_path: Option<String>,
    #[serde(default)]
    cli_checked_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmCliCheckResult {
    command: String,
    available: bool,
    version: Option<String>,
    path: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmApiKeyCheckResult {
    provider_id: String,
    env_var: String,
    available: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmAnswerEvidenceRef {
    id: String,
    #[serde(rename = "type")]
    evidence_type: String,
    title: String,
    path: String,
    snippet: String,
    #[serde(default)]
    evidence: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    severity: Option<String>,
    #[serde(default)]
    relations: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmAnswerRequest {
    provider_id: String,
    provider_name: String,
    api_protocol: String,
    api_base_url: String,
    api_key_env_var: String,
    model: String,
    context_window: usize,
    reasoning_mode: String,
    language: String,
    question: String,
    target_path: String,
    #[serde(default)]
    evidence: Vec<LlmAnswerEvidenceRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmAnswerResult {
    provider_id: String,
    provider_name: String,
    model: String,
    protocol: String,
    generated_at: String,
    answer: String,
    evidence_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestPlanSummary {
    total: usize,
    ready: usize,
    stageable: usize,
    blocked: usize,
    cached: usize,
    published: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct IngestPlanEntry {
    source_path: String,
    file_name: String,
    sha256: String,
    artifact_sha256: Option<String>,
    artifact_path: Option<String>,
    status: String,
    action: String,
    reason: String,
    parser_hint: Option<String>,
    current_state: String,
    next_action_label: String,
    command: Vec<String>,
    inputs: Vec<String>,
    outputs: Vec<String>,
    last_log_path: Option<String>,
    requires_human_approval: bool,
    uses_network: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestPlan {
    generated_at: String,
    vault_path: String,
    plan_path: String,
    summary: IngestPlanSummary,
    entries: Vec<IngestPlanEntry>,
    registry: Vec<DesktopRegistryEntry>,
    source_aliases: Vec<SourceIdAlias>,
    artifacts: Vec<ArtifactContractSummary>,
    jobs: Vec<DesktopIngestJob>,
    actions: Vec<DashboardAction>,
    impact_edges: Vec<ImpactEdge>,
    lint_findings: Vec<ContractFinding>,
}

struct IngestContracts {
    registry: Vec<DesktopRegistryEntry>,
    source_aliases: Vec<SourceIdAlias>,
    artifacts: Vec<ArtifactContractSummary>,
    jobs: Vec<DesktopIngestJob>,
    actions: Vec<DashboardAction>,
    impact_edges: Vec<ImpactEdge>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestPipelineResult {
    id: String,
    parsed_artifacts: Vec<String>,
    staged_artifacts: Vec<String>,
    published_sources: Vec<String>,
    logs: Vec<TaskLog>,
    exit_code: i32,
    log_path: String,
}

#[derive(Debug, Deserialize)]
struct DesktopIngestCacheRow {
    #[serde(default)]
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct DesktopIngestPublishedRow {
    #[serde(default)]
    source_sha256: String,
    #[serde(default)]
    artifact_sha256: String,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DashboardLink {
    label: String,
    path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DashboardAffectedObject {
    object_type: String,
    object_id: String,
    status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DashboardAction {
    action_id: String,
    kind: String,
    severity: String,
    title: String,
    body: String,
    reason: String,
    status: String,
    recommended_action: String,
    primary_object_type: String,
    primary_object_id: String,
    affected_objects: Vec<DashboardAffectedObject>,
    links: Vec<DashboardLink>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopIngestJob {
    job_id: String,
    source_uuid: String,
    source_id: Option<String>,
    source_path: String,
    file_name: String,
    kind: String,
    artifact_path: Option<String>,
    status: String,
    current_step: String,
    next_action: String,
    reason: String,
    attempt: usize,
    max_attempts: usize,
    started_at: Option<String>,
    ended_at: Option<String>,
    last_error: Option<String>,
    log_path: Option<String>,
    inputs: Vec<String>,
    outputs: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopRegistryEntry {
    source_uuid: String,
    source_id: Option<String>,
    duplicate_of: Option<String>,
    raw_path: String,
    canonical_path: String,
    source_path: String,
    source_sha256: String,
    mime: String,
    artifact_path: Option<String>,
    artifact_sha256: Option<String>,
    parser: Option<String>,
    parser_version: Option<String>,
    status: String,
    source_page: Option<String>,
    last_error: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    published_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SourceIdAlias {
    alias_id: String,
    old_source_uuid: Option<String>,
    new_source_uuid: String,
    source_id: Option<String>,
    old_source_path: Option<String>,
    new_source_path: String,
    match_reason: String,
    signals: Vec<String>,
    created_at: String,
    status: String,
    needs_review: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ArtifactContractSummary {
    source_path: String,
    source_id: Option<String>,
    source_uuid: String,
    artifact_path: String,
    manifest_path: Option<String>,
    chunks_path: Option<String>,
    tables_path: Option<String>,
    figures_path: Option<String>,
    parse_log_path: Option<String>,
    parser: Option<String>,
    parser_version: Option<String>,
    schema_version: Option<String>,
    source_sha256: Option<String>,
    artifact_sha256: Option<String>,
    status: String,
    contract_valid: bool,
    chunk_count: usize,
    anchors_lines: bool,
    anchors_pages: bool,
    anchors_tables: bool,
    anchors_figures: bool,
    anchors_equations: bool,
    limitations: Vec<String>,
    lint_errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContractFinding {
    finding_id: String,
    severity: String,
    kind: String,
    object_type: String,
    object_id: String,
    title: String,
    detail: String,
    status: String,
    path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TraceabilityWarning {
    warning_id: String,
    claim_id: String,
    claim_text: Option<String>,
    claim_path: String,
    source_id: Option<String>,
    source_path: Option<String>,
    artifact_path: Option<String>,
    missing_heading: String,
    missing_anchor: String,
    severity: String,
    summary: String,
    suggested_action: String,
    next_action: String,
    finding_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ImpactEdge {
    edge_id: String,
    from_type: String,
    from_id: String,
    to_type: String,
    to_id: String,
    relationship: String,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChunkRow {
    chunk_id: String,
    source_uuid: String,
    source_id: Option<String>,
    artifact_path: String,
    heading_path: Vec<String>,
    line_start: usize,
    line_end: usize,
    char_start: usize,
    char_end: usize,
    kind: String,
    text_hash: String,
    token_count: usize,
}

struct IngestPipelineLock {
    path: PathBuf,
}

impl Drop for IngestPipelineLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

#[derive(Debug, Deserialize)]
struct ClaimRow {
    #[serde(default)]
    needs_review: bool,
    #[serde(default)]
    verdict: String,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Deserialize)]
struct StatusOverrideRow {
    #[serde(default)]
    id: String,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ClaimLedgerItem {
    claim_id: String,
    claim_text: String,
    source_id: Option<String>,
    source_uuid: Option<String>,
    source_path: Option<String>,
    chunk_id: Option<String>,
    verdict: String,
    status: String,
    needs_review: bool,
    concepts: Vec<String>,
    evidence_quote: Option<String>,
    evidence_hash: Option<String>,
    updated_at: Option<String>,
    line: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EvidencePathItem {
    claim_id: String,
    concept: Option<String>,
    claim_text: String,
    chain_status: String,
    missing: Vec<String>,
    source_id: Option<String>,
    source_uuid: Option<String>,
    source_page: Option<String>,
    evidence_anchor: Option<String>,
    evidence_quote: Option<String>,
    raw_path: Option<String>,
    artifact_path: Option<String>,
    chunks_path: Option<String>,
    qa_report_path: Option<String>,
    semantic_status: Option<String>,
    science_review_status: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReviewQueueItem {
    item_id: String,
    kind: String,
    severity: String,
    title: String,
    body: String,
    status: String,
    target_path: Option<String>,
    source_id: Option<String>,
    claim_id: Option<String>,
    evidence_path: Option<String>,
    recommended_action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WritebackProposal {
    proposal_id: String,
    target_path: String,
    title: String,
    status: String,
    diff: String,
    content: String,
    created_at: String,
    updated_at: String,
    applied_at: Option<String>,
    log_path: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WritebackApplyResult {
    proposal: WritebackProposal,
    dashboard_refreshed: bool,
    dashboard_error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct QueryEvidence {
    claim_id: String,
    claim_path: String,
    claim_text: String,
    source_id: Option<String>,
    source_path: Option<String>,
    evidence_hash: Option<String>,
    quote: Option<String>,
    verdict: String,
    status: String,
    concepts: Vec<String>,
    conclusion_type: String,
    confidence: String,
    freshness_status: String,
    blocked_reason: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CitationCoverageSummary {
    conclusions: usize,
    cited: usize,
    unsupported: usize,
    stale_or_risky: usize,
    needs_evidence_review: bool,
    summary: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct QueryWritebackDraft {
    query: String,
    answer: String,
    citation_coverage: CitationCoverageSummary,
    evidence_map: Vec<QueryEvidence>,
    insight_candidates: Vec<String>,
    uncertainty_conflicts: Vec<String>,
    writeback_proposal: String,
    diff_preview: String,
    approval_status: String,
    proposal: WritebackProposal,
}

const SOURCE_TEMPLATE: &str = r#"---
type: source
source_id: ""
source_uuid: ""
status: draft
source_sha256: ""
artifact_sha256: ""
parser: ""
parser_version: ""
qa_verdict: unreviewed
claims_total: 0
claims_supported: 0
claims_needing_review: 0
concepts: []
---

# Source Title

## 一句话结论

## 为什么重要

## 关键贡献

## 关键 Claims

| Claim | Verdict | Evidence |
|---|---|---|

## 关键指标 / 实验结果

## 方法与数据

## 局限与争议

## 相关 Concepts

## 证据与原文锚点

## QA / Review 状态
"#;

const CONCEPT_TEMPLATE: &str = r#"---
type: concept
concept_id: ""
status: current
supporting_claims: 0
contradicted_claims: 0
stale_claims: 0
related_concepts: []
---

# Concept Name

## 定义

## 核心直觉

## 为什么重要

## 关键机制

## 支持证据

## 反例 / 争议 / 限制

## 相关方法与概念

## 代表 Sources

## 待确认问题
"#;

const OBSIDIAN_CORE_PLUGINS: &[&str] = &[
    "file-explorer",
    "global-search",
    "switcher",
    "graph",
    "backlink",
    "canvas",
    "outgoing-link",
    "tag-pane",
    "page-preview",
    "templates",
    "properties",
    "bookmarks",
    "command-palette",
];

fn default_pdf_parser() -> String {
    "auto".to_string()
}

fn default_project_template() -> String {
    "research".to_string()
}

fn default_ai_output_language() -> String {
    "简体中文".to_string()
}

fn default_interface_language() -> String {
    "zh".to_string()
}

fn default_context_window() -> usize {
    128_000
}

fn default_reasoning_mode() -> String {
    "balanced".to_string()
}

fn default_llm_provider_center() -> LlmProviderCenterSettings {
    LlmProviderCenterSettings {
        active_provider_id: None,
        providers: HashMap::new(),
    }
}

fn default_true() -> bool {
    true
}

fn default_embedding_api_key_env_var() -> String {
    "EMBEDDING_API_KEY".to_string()
}

fn default_embedding_max_chunk_chars() -> usize {
    1000
}

fn default_embedding_overlap_chunk_chars() -> usize {
    200
}

fn default_captioning_provider() -> String {
    "main-llm".to_string()
}

fn default_captioning_api_key_env_var() -> String {
    "VISION_API_KEY".to_string()
}

fn default_captioning_concurrency() -> usize {
    2
}

fn default_web_search_provider() -> String {
    "none".to_string()
}

fn default_web_search_api_key_env_var() -> String {
    "TAVILY_API_KEY".to_string()
}

fn default_web_search_categories() -> String {
    "general".to_string()
}

fn default_source_watch_allowed_extensions() -> String {
    "pdf, md, txt, zip, docx, pptx, xlsx, csv".to_string()
}

fn default_source_watch_exclude_dirs() -> String {
    ".git, node_modules, .obsidian".to_string()
}

fn default_source_watch_exclude_extensions() -> String {
    "tmp, bak, exe, dll, dmg".to_string()
}

fn default_source_watch_exclude_globs() -> String {
    "*.draft.*, ~$*, .~lock.*#".to_string()
}

fn default_source_watch_max_file_size_mb() -> usize {
    100
}

fn default_scheduled_import_path() -> String {
    "raw/inbox".to_string()
}

fn normalize_scheduled_import_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(default_scheduled_import_path());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("Scheduled import path must be a vault-relative path under raw/.".to_string());
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.trim().is_empty() {
                    return Err(
                        "Scheduled import path must not contain empty path segments.".to_string(),
                    );
                }
                parts.push(part.to_string());
            }
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err(
                    "Scheduled import path must be a vault-relative path under raw/.".to_string(),
                );
            }
        }
    }
    if parts.first().map(String::as_str) != Some("raw") {
        return Err("Scheduled import path must stay under raw/.".to_string());
    }
    Ok(parts.join("/"))
}

fn default_scheduled_import_interval_minutes() -> usize {
    60
}

fn default_chat_history_messages() -> usize {
    8
}

fn default_interface_density() -> String {
    "comfortable".to_string()
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            runtime_path: String::new(),
            python_path: "python3".to_string(),
            uv_path: "uv".to_string(),
            project_name: String::new(),
            project_template: default_project_template(),
            project_purpose: String::new(),
            ai_output_language: default_ai_output_language(),
            interface_language: default_interface_language(),
            parent_directory: String::new(),
            layout_parsing_api_url: String::new(),
            layout_parsing_token_present: std::env::var("OPEN_LLM_WIKI_LAYOUT_TOKEN")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .is_some()
                || std::env::var("LLM_WIKI_LAYOUT_TOKEN")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
                    .is_some(),
            cloud_parsing_allowed: false,
            default_pdf_parser: default_pdf_parser(),
            default_ingest_mode: "inbox_only".to_string(),
            default_obsidian_profile: "minimal".to_string(),
            embedding_enabled: false,
            embedding_endpoint: String::new(),
            embedding_api_key_env_var: default_embedding_api_key_env_var(),
            embedding_model: String::new(),
            embedding_output_dimensions: 0,
            embedding_max_chunk_chars: default_embedding_max_chunk_chars(),
            embedding_overlap_chunk_chars: default_embedding_overlap_chunk_chars(),
            captioning_enabled: false,
            captioning_use_main_provider: true,
            captioning_provider: default_captioning_provider(),
            captioning_endpoint: String::new(),
            captioning_api_key_env_var: default_captioning_api_key_env_var(),
            captioning_model: String::new(),
            captioning_concurrency: default_captioning_concurrency(),
            web_search_enabled: false,
            web_search_provider: default_web_search_provider(),
            web_search_api_key_env_var: default_web_search_api_key_env_var(),
            web_search_endpoint: String::new(),
            web_search_categories: default_web_search_categories(),
            web_search_audit_log: true,
            proxy_enabled: false,
            proxy_url: String::new(),
            proxy_bypass_local: true,
            source_watch_enabled: false,
            source_watch_auto_ingest: false,
            source_watch_allowed_extensions: default_source_watch_allowed_extensions(),
            source_watch_exclude_dirs: default_source_watch_exclude_dirs(),
            source_watch_exclude_extensions: default_source_watch_exclude_extensions(),
            source_watch_exclude_globs: default_source_watch_exclude_globs(),
            source_watch_max_file_size_mb: default_source_watch_max_file_size_mb(),
            scheduled_import_enabled: false,
            scheduled_import_path: default_scheduled_import_path(),
            scheduled_import_interval_minutes: default_scheduled_import_interval_minutes(),
            chat_history_messages: default_chat_history_messages(),
            interface_density: default_interface_density(),
            retry_count: 3,
            timeout_seconds: 1800,
            auto_run_lint_after_writes: true,
            auto_open_reports_after_failures: false,
            skip_obsidian_plugin_downloads: true,
            llm_provider_center: default_llm_provider_center(),
        }
    }
}

fn to_display(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn path_whitespace_suggestion(path: &Path) -> Option<PathBuf> {
    let components = path.components().collect::<Vec<_>>();
    let mut built = PathBuf::new();
    for (index, component) in components.iter().enumerate() {
        match component {
            Component::Prefix(_) | Component::RootDir | Component::CurDir => {
                built.push(component.as_os_str());
            }
            Component::ParentDir => {
                built.push(component.as_os_str());
            }
            Component::Normal(name) => {
                let next = built.join(name);
                if next.exists() {
                    built = next;
                    continue;
                }
                if !built.is_dir() {
                    return None;
                }
                let requested = name.to_string_lossy();
                let requested_trimmed = requested.trim_end();
                for entry in fs::read_dir(&built).ok()?.flatten() {
                    let actual_name = entry.file_name();
                    let actual = actual_name.to_string_lossy();
                    if actual != requested && actual.trim_end() == requested_trimmed {
                        let mut suggestion = entry.path();
                        for rest in components.iter().skip(index + 1) {
                            suggestion.push(rest.as_os_str());
                        }
                        return Some(suggestion);
                    }
                }
                return None;
            }
        }
    }
    None
}

fn trailing_space_component(path: &Path) -> Option<String> {
    path.components().find_map(|component| match component {
        Component::Normal(name) => {
            let value = name.to_string_lossy();
            value.ends_with(' ').then(|| value.to_string())
        }
        _ => None,
    })
}

fn reject_trailing_space_path(path: &Path, label: &str) -> Result<(), String> {
    if let Some(component) = trailing_space_component(path) {
        return Err(format!(
            "{label} contains a path component with trailing space: `{component}`. Choose or rename a portable path without trailing spaces before creating a vault."
        ));
    }
    Ok(())
}

fn workspace_root_from_path(start: &Path) -> Option<PathBuf> {
    let mut current = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };
    loop {
        if current.join("deepseek_paper").is_dir()
            && current.join("vaults").is_dir()
            && current.join("AGENTS.md").is_file()
        {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn workspace_root() -> PathBuf {
    if let Ok(path) = std::env::var("LLM_WIKI_WORKSPACE") {
        let candidate = PathBuf::from(path);
        if candidate.is_dir() {
            return candidate;
        }
    }
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    workspace_root_from_path(&current).unwrap_or(current)
}

fn workspace_root_for_vault(vault: &Path) -> PathBuf {
    workspace_root_from_path(vault).unwrap_or_else(workspace_root)
}

fn app_state_path_for_workspace(root: &Path) -> PathBuf {
    root.join(".cache")
        .join("llm-wiki-desktop")
        .join("desktop-state.json")
}

fn app_support_state_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Library")
        .join("Application Support")
        .join("LLM Wiki")
        .join("desktop-state.json")
}

fn app_state_path() -> PathBuf {
    let root = workspace_root();
    if root.join("deepseek_paper").is_dir()
        && root.join("vaults").is_dir()
        && root.join("AGENTS.md").is_file()
    {
        app_state_path_for_workspace(&root)
    } else {
        app_support_state_path()
    }
}

fn load_app_state_from_workspace(root: &Path) -> DesktopAppState {
    let path = app_state_path_for_workspace(root);
    if !path.is_file() {
        return DesktopAppState::default();
    }
    serde_json::from_str::<DesktopAppState>(&read_text(&path)).unwrap_or_default()
}

fn load_app_state_from_disk() -> DesktopAppState {
    let path = app_state_path();
    if !path.is_file() {
        return DesktopAppState::default();
    }
    serde_json::from_str::<DesktopAppState>(&read_text(&path)).unwrap_or_default()
}

fn save_app_state_to_workspace(root: &Path, state: &DesktopAppState) -> Result<(), String> {
    let path = app_state_path_for_workspace(root);
    let rendered = serde_json::to_string_pretty(state)
        .map_err(|e| format!("failed to serialize desktop app state: {e}"))?;
    write_text(&path, &(rendered + "\n"))
}

fn mirror_app_state_to_launch_scope(
    state: &DesktopAppState,
    workspace: &Path,
) -> Result<(), String> {
    if cfg!(test) {
        return Ok(());
    }
    let workspace_path = app_state_path_for_workspace(workspace);
    let launch_path = app_state_path();
    if launch_path != workspace_path {
        let rendered = serde_json::to_string_pretty(state)
            .map_err(|e| format!("failed to serialize desktop app state: {e}"))?;
        write_text(&launch_path, &(rendered + "\n"))?;
    }
    Ok(())
}

fn save_app_state_to_disk(state: &DesktopAppState) -> Result<(), String> {
    let path = app_state_path();
    let rendered = serde_json::to_string_pretty(state)
        .map_err(|e| format!("failed to serialize desktop app state: {e}"))?;
    write_text(&path, &(rendered + "\n"))
}

fn push_recent_vault(state: &mut DesktopAppState, vault_path: &Path) {
    let path = to_display(vault_path);
    state.last_selected_vault = Some(path.clone());
    state.recent_vaults.retain(|item| item != &path);
    state.recent_vaults.insert(0, path);
    state.recent_vaults.truncate(8);
    state.updated_at = Some(Local::now().to_rfc3339());
}

fn require_existing_dir(path: &Path, label: &str) -> Result<(), String> {
    if path.is_dir() {
        Ok(())
    } else {
        let hint = path_whitespace_suggestion(path)
            .filter(|candidate| candidate.is_dir())
            .map(|candidate| {
                format!(
                    ". Did you mean this path with significant whitespace: {}",
                    candidate.display()
                )
            })
            .unwrap_or_default();
        Err(format!(
            "{label} is not a directory: {}{hint}",
            path.display()
        ))
    }
}

fn ensure_inside(path: &Path, root: &Path, message: &str) -> Result<PathBuf, String> {
    let root_resolved = root
        .canonicalize()
        .map_err(|e| format!("failed to resolve {}: {e}", root.display()))?;
    let resolved = resolve_with_existing_parent(path)
        .map_err(|e| format!("failed to resolve {}: {e}", path.display()))?;
    if resolved.starts_with(&root_resolved) {
        Ok(resolved)
    } else {
        Err(message.to_string())
    }
}

fn resolve_with_existing_parent(path: &Path) -> std::io::Result<PathBuf> {
    if let Ok(resolved) = path.canonicalize() {
        return Ok(resolved);
    }

    let mut current = path;
    let mut missing_parts = Vec::new();
    while !current.exists() {
        let Some(name) = current.file_name() else {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "path has no existing parent",
            ));
        };
        missing_parts.push(name.to_os_string());
        current = current.parent().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "path has no parent")
        })?;
    }

    let mut resolved = current.canonicalize()?;
    for part in missing_parts.iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}

fn read_text(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

fn write_text(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    fs::write(path, text).map_err(|e| format!("failed to write {}: {e}", path.display()))
}

fn rel_path(vault: &Path, path: &Path) -> String {
    if let Ok(stripped) = path.strip_prefix(vault) {
        return stripped.to_string_lossy().to_string();
    }
    if let Ok(canonical_vault) = vault.canonicalize() {
        if let Ok(stripped) = path.strip_prefix(canonical_vault) {
            return stripped.to_string_lossy().to_string();
        }
    }
    path.to_string_lossy().to_string()
}

fn sha256_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn short_hash(hash: &str) -> String {
    hash.get(..12).unwrap_or(hash).to_string()
}

fn source_uuid(hash: &str) -> String {
    format!("sha256:{hash}")
}

fn write_jsonl<T: Serialize>(path: &Path, rows: &[T]) -> Result<(), String> {
    let mut rendered = String::new();
    for row in rows {
        rendered.push_str(
            &serde_json::to_string(row)
                .map_err(|e| format!("failed to serialize jsonl row: {e}"))?,
        );
        rendered.push('\n');
    }
    write_text(path, &rendered)
}

fn append_jsonl_value(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    let existing = read_text(path);
    write_text(
        path,
        &format!(
            "{}{}\n",
            existing,
            serde_json::to_string(value)
                .map_err(|e| format!("failed to serialize jsonl row: {e}"))?
        ),
    )
}

fn read_json_value(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&read_text(path)).ok()
}

fn json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
}

fn json_string_from_map(
    map: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<String> {
    map.get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
}

fn json_bool(value: &serde_json::Value, key: &str) -> bool {
    value
        .get(key)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn json_string_array(value: &serde_json::Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .filter(|item| !item.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn json_usize(value: &serde_json::Value, key: &str) -> Option<usize> {
    value
        .get(key)
        .and_then(serde_json::Value::as_u64)
        .and_then(|item| usize::try_from(item).ok())
}

fn detect_mime(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv" => "text/csv",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "md" | "markdown"
    )
}

fn collect_markdown_recursive(dir: &Path, files: &mut Vec<PathBuf>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_markdown_recursive(&path, files);
            } else if is_markdown_path(&path) {
                files.push(path);
            }
        }
    }
}

fn list_markdown(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_markdown_recursive(dir, &mut files);
    files.sort();
    files
}

fn root_wiki_notes(vault: &Path) -> Vec<PathBuf> {
    let mut notes = [
        "purpose.md",
        "LLM Wiki Home.md",
        "_dashboard.md",
        "index.md",
        "log.md",
        "README.md",
        "SCHEMA.md",
    ]
    .into_iter()
    .map(|name| vault.join(name))
    .filter(|path| path.is_file() && is_markdown_path(path))
    .collect::<Vec<_>>();
    notes.sort();
    notes.dedup();
    notes
}

fn graph_report_notes(vault: &Path) -> Vec<PathBuf> {
    let mut reports = list_markdown(&vault.join(".graph"));
    reports.sort();
    reports.dedup();
    reports
}

fn collect_files_by_extension_recursive(dir: &Path, extension: &str, files: &mut Vec<PathBuf>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_files_by_extension_recursive(&path, extension, files);
            } else if path
                .extension()
                .and_then(OsStr::to_str)
                .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
            {
                files.push(path);
            }
        }
    }
}

fn graph_canvas_files(vault: &Path) -> Vec<PathBuf> {
    let mut canvases = Vec::new();
    collect_files_by_extension_recursive(&vault.join("canvas"), "canvas", &mut canvases);
    canvases.sort();
    canvases.dedup();
    canvases
}

fn generated_impact_canvas_path(vault: &Path) -> PathBuf {
    vault.join("canvas").join("wiki-graph.canvas")
}

fn is_managed_impact_canvas(text: &str) -> bool {
    text.contains("llm-wiki-desktop generated impact graph")
}

fn canvas_node_label(object_type: &str, object_id: &str) -> String {
    let suffix = object_id
        .rsplit(['/', ':', '#'])
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(object_id);
    format!("{object_type}: {suffix}")
}

fn canvas_node_id(object_type: &str, object_id: &str) -> String {
    format!("node-{}", short_hash(&format!("{object_type}:{object_id}")))
}

fn load_impact_edges_for_canvas(vault: &Path) -> Vec<ImpactEdge> {
    read_text(&vault.join("_state").join("impact-graph.jsonl"))
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<ImpactEdge>(line).ok())
        .filter(|edge| {
            !edge.from_id.trim().is_empty()
                && !edge.to_id.trim().is_empty()
                && !edge.from_type.trim().is_empty()
                && !edge.to_type.trim().is_empty()
        })
        .take(120)
        .collect()
}

fn write_impact_graph_canvas(vault: &Path) -> Result<Option<PathBuf>, String> {
    let edges = load_impact_edges_for_canvas(vault);
    if edges.is_empty() {
        return Ok(None);
    }
    let path = generated_impact_canvas_path(vault);
    if path.is_file() && !is_managed_impact_canvas(&read_text(&path)) {
        return Ok(Some(path));
    }

    let mut node_ids = HashMap::new();
    let mut nodes = Vec::new();
    for edge in &edges {
        for (object_type, object_id) in [
            (edge.from_type.as_str(), edge.from_id.as_str()),
            (edge.to_type.as_str(), edge.to_id.as_str()),
        ] {
            let key = format!("{object_type}:{object_id}");
            if node_ids.contains_key(&key) {
                continue;
            }
            let id = canvas_node_id(object_type, object_id);
            let index = node_ids.len();
            node_ids.insert(key, id.clone());
            nodes.push(serde_json::json!({
                "id": id,
                "type": "text",
                "text": canvas_node_label(object_type, object_id),
                "x": ((index % 5) as i64) * 360,
                "y": ((index / 5) as i64) * 220,
                "width": 260,
                "height": 90,
            }));
            if node_ids.len() >= 80 {
                break;
            }
        }
        if node_ids.len() >= 80 {
            break;
        }
    }

    let canvas_edges = edges
        .iter()
        .filter_map(|edge| {
            let from_key = format!("{}:{}", edge.from_type, edge.from_id);
            let to_key = format!("{}:{}", edge.to_type, edge.to_id);
            let from_node = node_ids.get(&from_key)?;
            let to_node = node_ids.get(&to_key)?;
            Some(serde_json::json!({
                "id": format!("canvas-{}", short_hash(&edge.edge_id)),
                "fromNode": from_node,
                "toNode": to_node,
                "label": format!("{} ({})", edge.relationship, edge.status),
            }))
        })
        .collect::<Vec<_>>();

    if canvas_edges.is_empty() {
        return Ok(None);
    }

    nodes.push(serde_json::json!({
        "id": "llm-wiki-generated-canvas-note",
        "type": "text",
        "text": "llm-wiki-desktop generated impact graph\nSource: _state/impact-graph.jsonl\nReview source, claim, and concept state before treating graph edges as stable knowledge.",
        "x": -360,
        "y": -220,
        "width": 320,
        "height": 150,
    }));

    let canvas = serde_json::json!({
        "nodes": nodes,
        "edges": canvas_edges,
    });
    write_text(
        &path,
        &(serde_json::to_string_pretty(&canvas)
            .map_err(|e| format!("failed to serialize impact canvas: {e}"))?
            + "\n"),
    )?;
    Ok(Some(path))
}

fn count_jsonl(path: &Path) -> usize {
    read_text(path)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
}

fn count_claims(path: &Path) -> (usize, usize, usize, usize) {
    let mut total = 0;
    let mut review = 0;
    let mut stale = 0;
    let mut contradicted = 0;
    for line in read_text(path)
        .lines()
        .filter(|line| !line.trim().is_empty())
    {
        total += 1;
        if let Ok(row) = serde_json::from_str::<ClaimRow>(line) {
            if row.needs_review {
                review += 1;
            }
            let verdict = row.verdict.to_ascii_lowercase();
            let status = row.status.to_ascii_lowercase();
            if verdict == "stale" || status == "stale" {
                stale += 1;
            }
            if verdict == "contradicted" || status == "contradicted" {
                contradicted += 1;
            }
        }
    }
    (total, review, stale, contradicted)
}

fn read_jsonl_values(path: &Path) -> Vec<serde_json::Value> {
    read_text(path)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                None
            } else {
                serde_json::from_str::<serde_json::Value>(line).ok()
            }
        })
        .collect()
}

fn json_string_any(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| json_string(value, key))
}

fn list_markdown_recursive(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_markdown_recursive(dir, &mut files);
    files.sort();
    files
}

#[derive(Debug, Clone)]
struct ReadingSourceRecord {
    source_uuid: String,
    source_id: Option<String>,
    source_sha256: Option<String>,
    source_path: String,
    source_page: Option<String>,
    artifact_path: Option<String>,
    status: String,
    duplicate_of: Option<String>,
}

#[derive(Debug, Clone)]
struct ReadingArtifactRecord {
    source_uuid: Option<String>,
    source_id: Option<String>,
    artifact_path: String,
    status: String,
    contract_valid: Option<bool>,
    manifest_path: Option<String>,
}

fn reading_quality_report_path(vault: &Path) -> PathBuf {
    vault.join("_state").join("obsidian-reading-quality.json")
}

fn quality_finding(
    severity: &str,
    kind: &str,
    object_type: &str,
    object_id: &str,
    title: String,
    detail: String,
    path: Option<String>,
    evidence_paths: Vec<String>,
    recommendation: String,
) -> ReadingQualityFinding {
    ReadingQualityFinding {
        finding_id: format!(
            "reading-quality-{}-{}",
            kind,
            short_hash(&sha256_text(object_id))
        ),
        severity: severity.to_string(),
        kind: kind.to_string(),
        object_type: object_type.to_string(),
        object_id: object_id.to_string(),
        title,
        detail,
        path,
        evidence_paths,
        recommendation,
    }
}

fn reading_source_records(vault: &Path) -> Vec<ReadingSourceRecord> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    for state_file in ["source-registry.jsonl", "desktop-source-registry.jsonl"] {
        for value in read_jsonl_values(&vault.join("_state").join(state_file)) {
            let source_sha256 = json_string_any(
                &value,
                &[
                    "source_sha256",
                    "sourceSha256",
                    "raw_sha256",
                    "rawSha256",
                    "sha256",
                ],
            );
            let source_uuid = json_string_any(&value, &["source_uuid", "sourceUuid"])
                .or_else(|| source_sha256.as_deref().map(source_uuid))
                .unwrap_or_default();
            let source_path = json_string_any(
                &value,
                &[
                    "source_path",
                    "sourcePath",
                    "raw_path",
                    "rawPath",
                    "canonical_path",
                ],
            )
            .unwrap_or_default();
            if source_uuid.is_empty() && source_path.is_empty() {
                continue;
            }
            let source_id = json_string_any(&value, &["source_id", "sourceId"]);
            let source_page = json_string_any(&value, &["source_page", "sourcePage"]);
            let artifact_path = json_string_any(&value, &["artifact_path", "artifactPath"]);
            let status = json_string(&value, "status").unwrap_or_else(|| "unknown".to_string());
            let duplicate_of = json_string_any(&value, &["duplicate_of", "duplicateOf"]);
            let key = format!(
                "{}|{:?}|{}|{:?}|{:?}|{}",
                source_uuid, source_id, source_path, source_page, artifact_path, status
            );
            if seen.insert(key) {
                rows.push(ReadingSourceRecord {
                    source_uuid,
                    source_id,
                    source_sha256,
                    source_path,
                    source_page,
                    artifact_path,
                    status,
                    duplicate_of,
                });
            }
        }
    }
    rows
}

fn reading_artifact_records(vault: &Path) -> Vec<ReadingArtifactRecord> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    for state_file in ["artifacts.jsonl", "desktop-artifacts.jsonl"] {
        for value in read_jsonl_values(&vault.join("_state").join(state_file)) {
            let Some(artifact_path) = json_string_any(&value, &["artifact_path", "artifactPath"])
            else {
                continue;
            };
            let key = artifact_path.clone();
            if !seen.insert(key) {
                continue;
            }
            let contract_valid = value
                .get("contract_valid")
                .or_else(|| value.get("contractValid"))
                .and_then(serde_json::Value::as_bool);
            rows.push(ReadingArtifactRecord {
                source_uuid: json_string_any(&value, &["source_uuid", "sourceUuid"]),
                source_id: json_string_any(&value, &["source_id", "sourceId"]),
                artifact_path,
                status: json_string(&value, "status").unwrap_or_else(|| "unknown".to_string()),
                contract_valid,
                manifest_path: json_string_any(&value, &["manifest_path", "manifestPath"]),
            });
        }
    }
    rows
}

fn markdown_title(text: &str, path: &Path) -> String {
    text.lines()
        .find_map(|line| line.trim().strip_prefix("# ").map(str::trim))
        .filter(|title| !title.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(OsStr::to_str)
                .unwrap_or("untitled")
                .to_string()
        })
}

fn concept_label_key(value: &str) -> String {
    value
        .trim()
        .trim_end_matches(".md")
        .trim_start_matches("concepts/")
        .replace('\\', "/")
        .replace(' ', "-")
        .to_ascii_lowercase()
}

fn concept_aliases(vault: &Path, path: &Path, title: &str) -> HashSet<String> {
    let rel = rel_path(vault, path);
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_string();
    [rel, title.to_string(), stem]
        .into_iter()
        .flat_map(|item| {
            let no_ext = item.trim_end_matches(".md").to_string();
            [item, no_ext]
        })
        .map(|item| concept_label_key(&item))
        .filter(|item| !item.is_empty())
        .collect()
}

fn claim_matches_concept(claim: &ClaimLedgerItem, aliases: &HashSet<String>) -> bool {
    claim.concepts.iter().any(|concept| {
        let key = concept_label_key(concept);
        aliases.contains(&key)
            || aliases
                .iter()
                .any(|alias| key.ends_with(alias) || alias.ends_with(&key))
    })
}

fn source_record_matches_claim(source: &ReadingSourceRecord, claim: &ClaimLedgerItem) -> bool {
    claim
        .source_uuid
        .as_ref()
        .is_some_and(|uuid| uuid == &source.source_uuid)
        || claim
            .source_id
            .as_ref()
            .zip(source.source_id.as_ref())
            .is_some_and(|(claim_id, source_id)| claim_id == source_id)
        || claim.source_path.as_ref().is_some_and(|path| {
            path == &source.source_path
                || source.source_page.as_ref().is_some_and(|page| page == path)
        })
}

fn source_record_matches_text(source: &ReadingSourceRecord, text: &str) -> bool {
    let text = text.replace('\\', "/").to_ascii_lowercase();
    [
        source.source_id.as_deref(),
        Some(source.source_uuid.as_str()),
        Some(source.source_path.as_str()),
        source.source_page.as_deref(),
    ]
    .into_iter()
    .flatten()
    .filter(|value| !value.is_empty())
    .any(|value| text.contains(&value.replace('\\', "/").to_ascii_lowercase()))
}

fn reading_artifact_for_source<'a>(
    source: &ReadingSourceRecord,
    artifacts: &'a [ReadingArtifactRecord],
) -> Option<&'a ReadingArtifactRecord> {
    artifacts.iter().find(|artifact| {
        artifact
            .source_uuid
            .as_ref()
            .is_some_and(|uuid| uuid == &source.source_uuid)
            || artifact
                .source_id
                .as_ref()
                .zip(source.source_id.as_ref())
                .is_some_and(|(artifact_id, source_id)| artifact_id == source_id)
            || source
                .artifact_path
                .as_ref()
                .is_some_and(|path| path == &artifact.artifact_path)
    })
}

fn normalize_reading_text(text: &str) -> String {
    let mut normalized = String::new();
    let mut previous_space = false;
    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            normalized.push(ch);
            previous_space = false;
        } else if !previous_space {
            normalized.push(' ');
            previous_space = true;
        }
    }
    normalized.trim().to_string()
}

fn text_ngrams(text: &str) -> HashSet<String> {
    let compact = normalize_reading_text(text)
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<Vec<_>>();
    if compact.len() < 80 {
        return HashSet::new();
    }
    compact
        .windows(8)
        .map(|window| window.iter().collect::<String>())
        .collect()
}

fn text_overlap_score(a: &str, b: &str) -> f64 {
    let a_grams = text_ngrams(a);
    let b_grams = text_ngrams(b);
    let baseline = a_grams.len().min(b_grams.len());
    if baseline == 0 {
        return 0.0;
    }
    let overlap = a_grams.intersection(&b_grams).count();
    overlap as f64 / baseline as f64
}

fn content_fingerprint(text: &str) -> Option<String> {
    let normalized = normalize_reading_text(text);
    (normalized.chars().count() >= 160).then(|| sha256_text(&normalized))
}

fn sorted_vec(mut values: HashSet<String>) -> Vec<String> {
    let mut items = values.drain().collect::<Vec<_>>();
    items.sort();
    items
}

fn build_reading_quality_report(vault: &Path) -> ReadingQualityReport {
    let sources = reading_source_records(vault);
    let artifacts = reading_artifact_records(vault);
    let concept_paths = list_markdown_recursive(&vault.join("concepts"));
    let source_pages = list_markdown_recursive(&vault.join("sources"));
    let claims = claim_ledger_items(vault);
    let mut findings = Vec::new();
    let mut concept_reports = Vec::new();
    let mut orphan_concepts = 0;
    let mut low_synthesis_concepts = 0;
    let mut stale_evidence_references = 0;
    let mut broken_evidence_references = 0;
    let mut source_identity_drift = 0;

    let mut source_ids_by_hash: HashMap<String, HashSet<String>> = HashMap::new();
    for source in &sources {
        if let Some(hash) = &source.source_sha256 {
            if source.duplicate_of.is_none() {
                if let Some(source_id) = &source.source_id {
                    source_ids_by_hash
                        .entry(hash.clone())
                        .or_default()
                        .insert(source_id.clone());
                }
            }
        }
    }
    for (hash, ids) in source_ids_by_hash {
        if ids.len() > 1 {
            source_identity_drift += 1;
            let evidence_paths = sources
                .iter()
                .filter(|source| source.source_sha256.as_deref() == Some(hash.as_str()))
                .map(|source| source.source_path.clone())
                .collect::<Vec<_>>();
            findings.push(quality_finding(
                "p1",
                "source_identity_drift",
                "source",
                &hash,
                "Same source hash maps to multiple source IDs".to_string(),
                format!(
                    "One raw source hash is represented by multiple stable IDs: {}.",
                    sorted_vec(ids).join(", ")
                ),
                None,
                evidence_paths,
                "Review source registry aliases before trusting duplicated source or concept entrypoints."
                    .to_string(),
            ));
        }
    }

    let mut uuids_by_id: HashMap<String, HashSet<String>> = HashMap::new();
    for source in &sources {
        if source.duplicate_of.is_none() {
            if let Some(source_id) = &source.source_id {
                uuids_by_id
                    .entry(source_id.clone())
                    .or_default()
                    .insert(source.source_uuid.clone());
            }
        }
    }
    for (source_id, uuids) in uuids_by_id {
        if uuids.len() > 1 {
            source_identity_drift += 1;
            findings.push(quality_finding(
                "p1",
                "source_id_drift",
                "source",
                &source_id,
                "One source ID maps to multiple source UUIDs".to_string(),
                format!(
                    "{source_id} points at multiple source UUIDs: {}.",
                    sorted_vec(uuids).join(", ")
                ),
                None,
                Vec::new(),
                "Repair source registry identity before using affected concepts as stable synthesis."
                    .to_string(),
            ));
        }
    }

    let mut concept_fingerprints: HashMap<String, Vec<String>> = HashMap::new();
    let mut source_fingerprints: HashMap<String, Vec<String>> = HashMap::new();
    for path in &source_pages {
        if let Some(fingerprint) = content_fingerprint(&read_text(path)) {
            source_fingerprints
                .entry(fingerprint)
                .or_default()
                .push(rel_path(vault, path));
        }
    }

    for concept_path in concept_paths {
        let concept_text = read_text(&concept_path);
        let concept_rel = rel_path(vault, &concept_path);
        let title = markdown_title(&concept_text, &concept_path);
        if let Some(fingerprint) = content_fingerprint(&concept_text) {
            concept_fingerprints
                .entry(fingerprint)
                .or_default()
                .push(concept_rel.clone());
        }
        let aliases = concept_aliases(vault, &concept_path, &title);
        let matched_claims = claims
            .iter()
            .filter(|claim| claim_matches_concept(claim, &aliases))
            .collect::<Vec<_>>();

        let mut concept_sources = HashSet::new();
        let mut concept_source_pages = HashSet::new();
        let mut concept_claims = HashSet::new();
        let mut concept_artifacts = HashSet::new();
        let mut artifact_statuses = HashSet::new();
        let mut issues = Vec::new();

        for claim in matched_claims {
            concept_claims.insert(claim.claim_id.clone());
            for source in sources
                .iter()
                .filter(|source| source_record_matches_claim(source, claim))
            {
                if let Some(source_id) = &source.source_id {
                    concept_sources.insert(source_id.clone());
                }
                if let Some(page) = &source.source_page {
                    concept_source_pages.insert(page.clone());
                }
            }
        }
        for source in sources
            .iter()
            .filter(|source| source_record_matches_text(source, &concept_text))
        {
            if let Some(source_id) = &source.source_id {
                concept_sources.insert(source_id.clone());
            }
            if let Some(page) = &source.source_page {
                concept_source_pages.insert(page.clone());
            }
        }

        let referenced_sources = sources
            .iter()
            .filter(|source| {
                source
                    .source_id
                    .as_ref()
                    .is_some_and(|id| concept_sources.contains(id))
                    || source
                        .source_page
                        .as_ref()
                        .is_some_and(|page| concept_source_pages.contains(page))
            })
            .collect::<Vec<_>>();

        if referenced_sources.is_empty() && concept_claims.is_empty() {
            orphan_concepts += 1;
            issues.push("orphan_concept".to_string());
            findings.push(quality_finding(
                "p2",
                "orphan_concept",
                "concept",
                &concept_rel,
                "Concept has no detected source or claim dependency".to_string(),
                "The concept page is not linked to claim ledger rows or source registry records."
                    .to_string(),
                Some(concept_rel.clone()),
                Vec::new(),
                "Link the concept to evidence or keep it out of trusted reading paths.".to_string(),
            ));
        }

        for source in &referenced_sources {
            if let Some(artifact) = reading_artifact_for_source(source, &artifacts) {
                concept_artifacts.insert(artifact.artifact_path.clone());
                artifact_statuses.insert(format!("{}:{}", artifact.artifact_path, artifact.status));
                if artifact.status == "stale" {
                    stale_evidence_references += 1;
                    issues.push("stale_artifact_reference".to_string());
                    findings.push(quality_finding(
                        "p1",
                        "stale_artifact_reference",
                        "concept",
                        &concept_rel,
                        "Concept references stale parsed evidence".to_string(),
                        format!("The concept depends on stale artifact {}.", artifact.artifact_path),
                        Some(concept_rel.clone()),
                        vec![artifact
                            .manifest_path
                            .clone()
                            .unwrap_or_else(|| artifact.artifact_path.clone())],
                        "Regenerate the source artifact before trusting or writing back this concept."
                            .to_string(),
                    ));
                }
                if artifact.contract_valid == Some(false) {
                    broken_evidence_references += 1;
                    issues.push("artifact_hash_mismatch_reference".to_string());
                    findings.push(quality_finding(
                        "p1",
                        "artifact_hash_mismatch_reference",
                        "concept",
                        &concept_rel,
                        "Concept references an artifact hash mismatch".to_string(),
                        format!(
                            "The concept depends on artifact {} whose manifest hash does not match.",
                            artifact.artifact_path
                        ),
                        Some(concept_rel.clone()),
                        vec![artifact
                            .manifest_path
                            .clone()
                            .unwrap_or_else(|| artifact.artifact_path.clone())],
                        "Repair the artifact contract and rerun traceability before using this concept."
                            .to_string(),
                    ));
                }
            } else if source.artifact_path.is_some() {
                broken_evidence_references += 1;
                issues.push("missing_artifact_reference".to_string());
                findings.push(quality_finding(
                    "p1",
                    "missing_artifact_reference",
                    "concept",
                    &concept_rel,
                    "Concept references a source without a readable artifact".to_string(),
                    format!(
                        "The concept depends on source {} but no artifact contract row was found.",
                        source
                            .source_id
                            .as_deref()
                            .unwrap_or(source.source_uuid.as_str())
                    ),
                    Some(concept_rel.clone()),
                    source.artifact_path.clone().into_iter().collect(),
                    "Regenerate or restage the artifact before trusting this synthesis."
                        .to_string(),
                ));
            }
            if matches!(source.status.as_str(), "stale" | "blocked" | "failed") {
                stale_evidence_references += 1;
                issues.push(format!("{}_source_reference", source.status));
                findings.push(quality_finding(
                    "p1",
                    "stale_source_reference",
                    "concept",
                    &concept_rel,
                    "Concept references a non-current source".to_string(),
                    format!(
                        "The concept depends on source status {} for {}.",
                        source.status,
                        source
                            .source_id
                            .as_deref()
                            .unwrap_or(source.source_uuid.as_str())
                    ),
                    Some(concept_rel.clone()),
                    vec![source.source_path.clone()],
                    "Resolve the source ingest state before treating this concept as stable."
                        .to_string(),
                ));
            }
        }

        if referenced_sources.len() == 1 {
            if let Some(source_page) = referenced_sources[0]
                .source_page
                .as_ref()
                .map(|page| vault.join(page))
                .filter(|page| page.is_file())
            {
                let overlap = text_overlap_score(&concept_text, &read_text(&source_page));
                if overlap >= 0.82 {
                    low_synthesis_concepts += 1;
                    issues.push("low_synthesis_concept".to_string());
                    findings.push(quality_finding(
                        "p2",
                        "low_synthesis_concept",
                        "concept",
                        &concept_rel,
                        "Concept appears to repeat one source page".to_string(),
                        format!(
                            "The concept has one detected source and {:.0}% text overlap with its source page.",
                            overlap * 100.0
                        ),
                        Some(concept_rel.clone()),
                        vec![rel_path(vault, &source_page)],
                        "Use the concept for cross-source synthesis or keep it as a source summary."
                            .to_string(),
                    ));
                }
            }
        }

        issues.sort();
        issues.dedup();
        concept_reports.push(ConceptReadingQuality {
            concept_path: concept_rel,
            title,
            source_ids: sorted_vec(concept_sources),
            source_pages: sorted_vec(concept_source_pages),
            claim_ids: sorted_vec(concept_claims),
            artifact_paths: sorted_vec(concept_artifacts),
            artifact_statuses: sorted_vec(artifact_statuses),
            issues,
        });
    }

    let mut duplicate_groups = 0;
    for paths in concept_fingerprints.values() {
        if paths.len() > 1 {
            duplicate_groups += 1;
            findings.push(quality_finding(
                "p2",
                "duplicate_concept_content",
                "concept",
                &paths.join("|"),
                "Multiple concept pages have identical normalized content".to_string(),
                format!("Duplicate concept pages: {}.", paths.join(", ")),
                paths.first().cloned(),
                paths.clone(),
                "Review whether these should be aliases before using both as reading entrypoints."
                    .to_string(),
            ));
        }
    }
    for paths in source_fingerprints.values() {
        if paths.len() > 1 {
            duplicate_groups += 1;
            findings.push(quality_finding(
                "p2",
                "duplicate_source_page_content",
                "source",
                &paths.join("|"),
                "Multiple source pages have identical normalized content".to_string(),
                format!("Duplicate source pages: {}.", paths.join(", ")),
                paths.first().cloned(),
                paths.clone(),
                "Confirm registry aliases before treating duplicate source pages as separate evidence."
                    .to_string(),
            ));
        }
    }

    findings.sort_by(|a, b| {
        a.severity
            .cmp(&b.severity)
            .then_with(|| a.kind.cmp(&b.kind))
            .then_with(|| a.object_id.cmp(&b.object_id))
    });
    concept_reports.sort_by(|a, b| a.concept_path.cmp(&b.concept_path));

    let trust_issues = findings
        .iter()
        .filter(|finding| {
            matches!(
                finding.kind.as_str(),
                "stale_artifact_reference"
                    | "artifact_hash_mismatch_reference"
                    | "missing_artifact_reference"
                    | "stale_source_reference"
                    | "source_identity_drift"
                    | "source_id_drift"
            )
        })
        .count();
    let summary = ReadingQualitySummary {
        concepts: concept_reports.len(),
        sources: source_pages.len().max(sources.len()),
        findings: findings.len(),
        trust_issues,
        duplicate_groups,
        orphan_concepts,
        stale_evidence_references,
        broken_evidence_references,
        source_identity_drift,
        low_synthesis_concepts,
        report_path: rel_path(vault, &reading_quality_report_path(vault)),
    };

    ReadingQualityReport {
        generated_at: Local::now().to_rfc3339(),
        vault_path: to_display(vault),
        summary,
        findings,
        concepts: concept_reports,
    }
}

fn write_reading_quality_report(vault: &Path) -> Result<ReadingQualityReport, String> {
    let report = build_reading_quality_report(vault);
    let rendered = serde_json::to_string_pretty(&report)
        .map_err(|e| format!("failed to serialize reading quality report: {e}"))?;
    write_text(&reading_quality_report_path(vault), &(rendered + "\n"))?;
    Ok(report)
}

fn product_scorecard_report_path(vault: &Path) -> PathBuf {
    vault.join("qa-reports").join("dfc-product-scorecard.md")
}

fn scorecard_metric(
    metric_id: &str,
    label: &str,
    status: &str,
    evidence: Vec<String>,
    counts: Vec<String>,
    next_action: &str,
) -> ProductScorecardMetric {
    ProductScorecardMetric {
        metric_id: metric_id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        evidence,
        counts,
        next_action: next_action.to_string(),
    }
}

fn scorecard_status_counts(
    metrics: &[ProductScorecardMetric],
    report_path: String,
) -> ProductScorecardSummary {
    ProductScorecardSummary {
        passed: metrics
            .iter()
            .filter(|metric| metric.status == "pass")
            .count(),
        failed: metrics
            .iter()
            .filter(|metric| metric.status == "fail")
            .count(),
        manual: metrics
            .iter()
            .filter(|metric| metric.status == "manual")
            .count(),
        not_run: metrics
            .iter()
            .filter(|metric| metric.status == "not_run")
            .count(),
        report_path,
    }
}

fn markdown_cell(values: &[String]) -> String {
    if values.is_empty() {
        return "-".to_string();
    }
    values
        .iter()
        .map(|value| value.replace('|', "\\|").replace('\n', " "))
        .collect::<Vec<_>>()
        .join("<br>")
}

fn render_product_scorecard(report: &ProductScorecardReport) -> String {
    let mut out = format!(
        "# DFC Product Scorecard\n\n- generated_at: {}\n- vault_path: `{}`\n- corpus_role: {}\n\nDFC is used here as an evaluation corpus / benchmark, not as the product positioning or a DFC-only feature set.\n\n## Summary\n\n- pass: {}\n- fail: {}\n- manual: {}\n- not_run: {}\n\n## Metrics\n\n| Metric | Status | Counts | Evidence | Next action |\n|---|---|---|---|---|\n",
        report.generated_at,
        report.vault_path,
        report.corpus_role,
        report.summary.passed,
        report.summary.failed,
        report.summary.manual,
        report.summary.not_run,
    );
    for metric in &report.metrics {
        out.push_str(&format!(
            "| {} | `{}` | {} | {} | {} |\n",
            metric.label.replace('|', "\\|"),
            metric.status,
            markdown_cell(&metric.counts),
            markdown_cell(&metric.evidence),
            metric.next_action.replace('|', "\\|").replace('\n', " "),
        ));
    }
    out.push_str(
        "\n## Status Semantics\n\n- `pass`: evidence exists and the current checks did not find a blocker.\n- `fail`: evidence exists and the current checks found a concrete blocker.\n- `manual`: the app can point to evidence, but a user must score or approve the result.\n- `not_run`: the scorecard could not find a concrete artifact for that stage.\n\n## Boundaries\n\nThis report does not approve science review, does not apply query writeback, and does not call cloud parser, external LLM, or external OCR. Screenshot paths and manual Obsidian first-screen scores must be supplied by a real user run.\n",
    );
    out
}

fn plan_entries_from_state(vault: &Path) -> Vec<serde_json::Value> {
    read_json_value(&vault.join("_state").join("desktop-ingest-plan.json"))
        .and_then(|value| {
            value
                .get("entries")
                .and_then(serde_json::Value::as_array)
                .cloned()
        })
        .unwrap_or_default()
}

fn build_product_scorecard_report(vault: &Path) -> ProductScorecardReport {
    let mut metrics = Vec::new();
    let plan_path = vault.join("_state").join("desktop-ingest-plan.json");
    let plan_entries = plan_entries_from_state(vault);
    let plan_missing_state = plan_entries
        .iter()
        .filter(|entry| {
            json_string(entry, "currentState").is_none()
                || json_string(entry, "nextActionLabel").is_none()
        })
        .count();
    metrics.push(if plan_entries.is_empty() {
        scorecard_metric(
            "ingest_plan",
            "Ingest plan state",
            "not_run",
            vec![rel_path(vault, &plan_path)],
            vec!["entries: 0".to_string()],
            "Run ingest planning on the evaluation corpus.",
        )
    } else if plan_missing_state > 0 {
        scorecard_metric(
            "ingest_plan",
            "Ingest plan state",
            "fail",
            vec![rel_path(vault, &plan_path)],
            vec![
                format!("entries: {}", plan_entries.len()),
                format!("missing_state: {plan_missing_state}"),
            ],
            "Regenerate the ingest plan until every source has current state and next action.",
        )
    } else {
        scorecard_metric(
            "ingest_plan",
            "Ingest plan state",
            "pass",
            vec![rel_path(vault, &plan_path)],
            vec![format!("entries: {}", plan_entries.len())],
            "Use Raw Sources for per-source next actions.",
        )
    });

    let registry_count = count_jsonl(&vault.join("_state").join("source-registry.jsonl")).max(
        count_jsonl(&vault.join("_state").join("desktop-source-registry.jsonl")),
    );
    let artifacts_count = count_jsonl(&vault.join("_state").join("artifacts.jsonl")).max(
        count_jsonl(&vault.join("_state").join("desktop-artifacts.jsonl")),
    );
    let stale_artifacts = ["artifacts.jsonl", "desktop-artifacts.jsonl"]
        .into_iter()
        .flat_map(|state_file| read_jsonl_values(&vault.join("_state").join(state_file)))
        .filter(|value| {
            json_string(value, "status").as_deref() == Some("stale")
                || !json_bool(value, "contract_valid") && !json_bool(value, "contractValid")
        })
        .count();
    metrics.push(if registry_count == 0 && artifacts_count == 0 {
        scorecard_metric(
            "registry_manifest",
            "Registry and artifact manifest",
            "not_run",
            vec![
                "_state/source-registry.jsonl".to_string(),
                "_state/artifacts.jsonl".to_string(),
            ],
            vec!["registry: 0".to_string(), "artifacts: 0".to_string()],
            "Run ingest or artifact staging before scoring registry completeness.",
        )
    } else if stale_artifacts > 0 {
        scorecard_metric(
            "registry_manifest",
            "Registry and artifact manifest",
            "fail",
            vec![
                "_state/source-registry.jsonl".to_string(),
                "_state/artifacts.jsonl".to_string(),
            ],
            vec![
                format!("registry: {registry_count}"),
                format!("artifacts: {artifacts_count}"),
                format!("stale_or_invalid_artifacts: {stale_artifacts}"),
            ],
            "Re-parse or restage stale artifacts before trusting downstream synthesis.",
        )
    } else {
        scorecard_metric(
            "registry_manifest",
            "Registry and artifact manifest",
            "pass",
            vec![
                "_state/source-registry.jsonl".to_string(),
                "_state/artifacts.jsonl".to_string(),
            ],
            vec![
                format!("registry: {registry_count}"),
                format!("artifacts: {artifacts_count}"),
            ],
            "Continue to traceability and review checks.",
        )
    });

    let claims_count = count_jsonl(&vault.join("claims").join("claims.jsonl"));
    let evidence_paths = list_evidence_paths(to_display(vault)).unwrap_or_default();
    let traceability_findings = load_existing_evidence_anchor_findings(vault).len();
    metrics.push(if claims_count == 0 {
        scorecard_metric(
            "traceability",
            "Source -> artifact -> claim -> concept traceability",
            "not_run",
            vec![
                "claims/claims.jsonl".to_string(),
                "_state/lint-findings.jsonl".to_string(),
            ],
            vec!["claims: 0".to_string()],
            "Run claim extraction and lint before scoring traceability.",
        )
    } else if traceability_findings > 0 {
        scorecard_metric(
            "traceability",
            "Source -> artifact -> claim -> concept traceability",
            "fail",
            vec![
                "claims/claims.jsonl".to_string(),
                "_state/lint-findings.jsonl".to_string(),
            ],
            vec![
                format!("claims: {claims_count}"),
                format!("evidence_paths: {}", evidence_paths.len()),
                format!("traceability_findings: {traceability_findings}"),
            ],
            "Repair missing source/artifact/anchor links before using claims as stable evidence.",
        )
    } else {
        scorecard_metric(
            "traceability",
            "Source -> artifact -> claim -> concept traceability",
            "pass",
            vec!["claims/claims.jsonl".to_string()],
            vec![
                format!("claims: {claims_count}"),
                format!("evidence_paths: {}", evidence_paths.len()),
            ],
            "Use evidence paths for search and writeback checks.",
        )
    });

    let entry_note = resolve_vault_entry_note_impl(vault, false).ok();
    metrics.push(if let Some(entry) = entry_note {
        scorecard_metric(
            "obsidian_entry",
            "Obsidian first-screen readiness",
            "manual",
            vec![entry.entry_relative_path.unwrap_or(entry.fallback_path)],
            vec!["first_screen_score: manual_required".to_string()],
            "Open Obsidian, capture a screenshot, and record first-screen scores.",
        )
    } else {
        scorecard_metric(
            "obsidian_entry",
            "Obsidian first-screen readiness",
            "not_run",
            vec!["LLM Wiki Home.md".to_string()],
            vec!["entry_note: missing".to_string()],
            "Run Obsidian setup or generate the vault home entry.",
        )
    });

    metrics.push(if evidence_paths.is_empty() {
        scorecard_metric(
            "evidence_search",
            "Evidence Search readiness",
            "not_run",
            vec!["claims/claims.jsonl".to_string()],
            vec!["evidence_paths: 0".to_string()],
            "Run claim/evidence extraction before scoring search readiness.",
        )
    } else {
        scorecard_metric(
            "evidence_search",
            "Evidence Search readiness",
            "pass",
            vec!["claims/claims.jsonl".to_string()],
            vec![format!("evidence_paths: {}", evidence_paths.len())],
            "Ask an evidence-backed question and inspect citation coverage.",
        )
    });

    let writeback_state = read_writeback_proposal_state(vault);
    let writebacks = writeback_state.proposals;
    let proposed_writebacks = writebacks
        .iter()
        .filter(|proposal| proposal.status == "proposed")
        .count();
    let unsafe_proposed_writebacks = writebacks
        .iter()
        .filter(|proposal| proposal.status == "proposed")
        .filter_map(|proposal| {
            let issues = writeback_proposal_contract_issues(vault, proposal);
            (!issues.is_empty()).then(|| format!("{}: {}", proposal.proposal_id, issues.join("; ")))
        })
        .collect::<Vec<_>>();
    metrics.push(if writebacks.is_empty() && writeback_state.invalid_paths.is_empty() {
        scorecard_metric(
            "query_writeback",
            "Query writeback proposal boundary",
            "not_run",
            vec!["_state/writeback-proposals/".to_string()],
            vec!["proposals: 0".to_string()],
            "Create a query writeback proposal without applying it.",
        )
    } else if !writeback_state.invalid_paths.is_empty() || !unsafe_proposed_writebacks.is_empty() {
        let mut evidence = vec!["_state/writeback-proposals/".to_string()];
        evidence.extend(writeback_state.invalid_paths.iter().take(3).cloned());
        let mut details = vec![
            format!("proposals: {}", writebacks.len()),
            format!("proposed: {proposed_writebacks}"),
        ];
        if !writeback_state.invalid_paths.is_empty() {
            details.push(format!(
                "invalid_files: {}",
                writeback_state.invalid_paths.len()
            ));
            details.extend(
                writeback_state
                    .invalid_paths
                    .iter()
                    .take(3)
                    .map(|path| format!("invalid: {path}")),
            );
        }
        if !unsafe_proposed_writebacks.is_empty() {
            details.push(format!(
                "unsafe_proposed: {}",
                unsafe_proposed_writebacks.len()
            ));
            details.extend(
                unsafe_proposed_writebacks
                    .iter()
                    .take(3)
                    .map(|issue| format!("unsafe: {issue}")),
            );
        }
        scorecard_metric(
            "query_writeback",
            "Query writeback proposal boundary",
            "fail",
            evidence,
            details,
            "Repair or regenerate writeback proposal artifacts before trusting query writeback readiness.",
        )
    } else if proposed_writebacks == 0 {
        scorecard_metric(
            "query_writeback",
            "Query writeback proposal boundary",
            "manual",
            vec!["_state/writeback-proposals/".to_string()],
            vec![
                format!("proposals: {}", writebacks.len()),
                format!("proposed: {proposed_writebacks}"),
            ],
            "Verify applied/rejected proposals had explicit human approval.",
        )
    } else {
        scorecard_metric(
            "query_writeback",
            "Query writeback proposal boundary",
            "pass",
            vec!["_state/writeback-proposals/".to_string()],
            vec![
                format!("proposals: {}", writebacks.len()),
                format!("proposed: {proposed_writebacks}"),
            ],
            "Review proposal diff and keep apply gated on explicit approval.",
        )
    });

    let alias_reviews = load_source_id_aliases(vault)
        .iter()
        .filter(|alias| alias.needs_review)
        .count();
    let open_reviews = count_jsonl(&vault.join("_state").join("science-review-queue.jsonl"))
        + claim_ledger_items(vault)
            .iter()
            .filter(|claim| claim.needs_review)
            .count()
        + alias_reviews;
    let manual_steps =
        open_reviews + traceability_findings + usize::from(!evidence_paths.is_empty());
    metrics.push(scorecard_metric(
        "manual_step_count",
        "Manual-step count",
        if manual_steps == 0 { "pass" } else { "manual" },
        vec![
            "_state/science-review-queue.jsonl".to_string(),
            "_state/source-id-aliases.jsonl".to_string(),
            "_state/lint-findings.jsonl".to_string(),
        ],
        vec![
            format!("open_reviews_or_aliases: {open_reviews}"),
            format!("traceability_findings: {traceability_findings}"),
            format!("manual_search_review: {}", usize::from(!evidence_paths.is_empty())),
        ],
        "Use this count for before/after comparisons; lower means less manual path/log/hash checking.",
    ));

    let report_path = rel_path(vault, &product_scorecard_report_path(vault));
    let summary = scorecard_status_counts(&metrics, report_path);
    ProductScorecardReport {
        generated_at: Local::now().to_rfc3339(),
        vault_path: to_display(vault),
        corpus_role: "evaluation corpus / benchmark, not product positioning".to_string(),
        summary,
        metrics,
    }
}

fn write_product_scorecard_report(vault: &Path) -> Result<ProductScorecardReport, String> {
    let report = build_product_scorecard_report(vault);
    let path = product_scorecard_report_path(vault);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    write_text(&path, &render_product_scorecard(&report))?;
    Ok(report)
}

fn agent_read_api_endpoints() -> Vec<AgentReadApiEndpoint> {
    [
        ("GET", "/health", "desktop process health"),
        (
            "GET",
            "/vault/status",
            "vault counts, scorecard, and dashboard state",
        ),
        ("GET", "/vault/ingest-plan", "manual ingest plan state"),
        (
            "GET",
            "/vault/sources",
            "source registry and artifact summaries",
        ),
        (
            "GET",
            "/vault/traceability-warnings",
            "traceability and evidence-anchor warnings",
        ),
        (
            "POST",
            "/vault/search",
            "vault-scoped evidence refs and snippets only",
        ),
        ("GET", "/vault/graph", "read-only evidence graph traversal"),
        (
            "POST",
            "/vault/read-file",
            "read one vault-relative file; reject path escapes",
        ),
        (
            "GET",
            "/vault/writeback-proposals",
            "proposal metadata and review status",
        ),
        (
            "POST",
            "/vault/rescan-plan",
            "refresh plan only; never run ingest or parser",
        ),
    ]
    .into_iter()
    .map(|(method, path, capability)| AgentReadApiEndpoint {
        method: method.to_string(),
        path: path.to_string(),
        capability: capability.to_string(),
    })
    .collect()
}

fn agent_read_api_required_metrics() -> Vec<&'static str> {
    vec![
        "ingest_plan",
        "registry_manifest",
        "traceability",
        "evidence_search",
        "query_writeback",
    ]
}

const AGENT_READ_API_SERVER_IMPLEMENTED: bool = true;

fn build_agent_read_api_readiness(vault: &Path) -> AgentReadApiReadiness {
    let report = build_product_scorecard_report(vault);
    let required_metrics = agent_read_api_required_metrics();
    let unmet_requirements = required_metrics
        .iter()
        .filter_map(|metric_id| {
            let metric = report
                .metrics
                .iter()
                .find(|metric| metric.metric_id == *metric_id);
            match metric {
                Some(metric) if metric.status == "pass" => None,
                Some(metric) => Some(format!(
                    "{} is {}: {}",
                    metric.metric_id, metric.status, metric.next_action
                )),
                None => Some(format!("{metric_id} metric is missing from the scorecard")),
            }
        })
        .collect::<Vec<_>>();
    let scorecard_ready = unmet_requirements.is_empty() && report.summary.failed == 0;
    let server_available = scorecard_ready && AGENT_READ_API_SERVER_IMPLEMENTED;
    AgentReadApiReadiness {
        enabled: server_available,
        reason: if !scorecard_ready {
            "Read-only localhost API remains deferred until core scorecard metrics pass."
                .to_string()
        } else if !AGENT_READ_API_SERVER_IMPLEMENTED {
            "Core scorecard metrics passed, but this desktop build has no live localhost API server yet; agents must use the UI-backed flow."
                .to_string()
        } else {
            "Read-only localhost API is available for this vault.".to_string()
        },
        bind_host: "127.0.0.1".to_string(),
        token_required: true,
        scorecard_ready,
        server_implemented: AGENT_READ_API_SERVER_IMPLEMENTED,
        server_available,
        scorecard: report.summary,
        required_metrics: required_metrics
            .into_iter()
            .map(ToString::to_string)
            .collect(),
        unmet_requirements,
        endpoints: agent_read_api_endpoints(),
        blocked_operations: vec![
            "apply writeback proposal".to_string(),
            "set review or proposal status".to_string(),
            "write, delete, or overwrite raw/source/concept/claim/review files".to_string(),
            "run parser, ingest pipeline, hosted model, cloud OCR, or external search".to_string(),
            "serve PDF full text to external services".to_string(),
        ],
    }
}

#[tauri::command]
fn agent_read_api_readiness(vault_path: String) -> Result<AgentReadApiReadiness, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    Ok(build_agent_read_api_readiness(&vault))
}

struct AgentReadApiServer {
    info: AgentReadApiServerInfo,
    stop_tx: mpsc::Sender<()>,
    handle: thread::JoinHandle<()>,
}

#[derive(Debug)]
struct AgentHttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSearchRequest {
    query: String,
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentReadFileRequest {
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSearchResult {
    path: String,
    title: String,
    snippet: String,
}

static AGENT_READ_API_SERVER: OnceLock<Mutex<Option<AgentReadApiServer>>> = OnceLock::new();

fn agent_read_api_server_state() -> &'static Mutex<Option<AgentReadApiServer>> {
    AGENT_READ_API_SERVER.get_or_init(|| Mutex::new(None))
}

fn agent_read_api_token(vault: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(to_display(vault).as_bytes());
    hasher.update(Local::now().to_rfc3339().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn parse_http_request(stream: &mut TcpStream) -> Result<AgentHttpRequest, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|e| format!("failed to set read timeout: {e}"))?;
    let mut buf = Vec::new();
    let mut chunk = [0_u8; 1024];
    let mut header_end = None;
    let mut content_length = 0_usize;
    loop {
        let read = stream
            .read(&mut chunk)
            .map_err(|e| format!("failed to read request: {e}"))?;
        if read == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..read]);
        if buf.len() > 1024 * 1024 {
            return Err("request too large".to_string());
        }
        if header_end.is_none() {
            if let Some(index) = buf.windows(4).position(|window| window == b"\r\n\r\n") {
                header_end = Some(index + 4);
                let header_text = String::from_utf8_lossy(&buf[..index]);
                for line in header_text.lines().skip(1) {
                    if let Some((name, value)) = line.split_once(':') {
                        if name.eq_ignore_ascii_case("content-length") {
                            content_length = value.trim().parse::<usize>().unwrap_or(0);
                        }
                    }
                }
            }
        }
        if let Some(end) = header_end {
            if buf.len() >= end + content_length {
                break;
            }
        }
    }
    let Some(end) = header_end else {
        return Err("malformed HTTP request".to_string());
    };
    let header_text = String::from_utf8_lossy(&buf[..end]);
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "missing HTTP request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_ascii_uppercase();
    let raw_path = parts.next().unwrap_or_default();
    let path = raw_path.split('?').next().unwrap_or_default().to_string();
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    let body = String::from_utf8_lossy(&buf[end..end + content_length]).to_string();
    Ok(AgentHttpRequest {
        method,
        path,
        headers,
        body,
    })
}

fn agent_request_authorized(headers: &HashMap<String, String>, token: &str) -> bool {
    headers
        .get("authorization")
        .is_some_and(|value| value.trim() == format!("Bearer {token}"))
        || headers
            .get("x-llm-wiki-token")
            .is_some_and(|value| value.trim() == token)
}

fn write_http_json<T: Serialize>(
    stream: &mut TcpStream,
    status: &str,
    value: &T,
) -> Result<(), String> {
    let body = serde_json::to_string_pretty(value)
        .map_err(|e| format!("failed to serialize HTTP response: {e}"))?;
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|e| format!("failed to write HTTP response: {e}"))
}

fn snippet_for_query(content: &str, query: &str) -> Option<String> {
    let lower = content.to_ascii_lowercase();
    let query_lower = query.to_ascii_lowercase();
    let term = query_lower
        .split_whitespace()
        .find(|part| !part.is_empty())
        .unwrap_or(query_lower.as_str());
    let index = if term.is_empty() {
        Some(0)
    } else {
        lower.find(term)
    }?;
    let mut start = index.saturating_sub(120);
    while start > 0 && !content.is_char_boundary(start) {
        start -= 1;
    }
    let mut end = (index + 280).min(content.len());
    while end > start && !content.is_char_boundary(end) {
        end -= 1;
    }
    Some(content[start..end].replace('\n', " ").trim().to_string())
}

fn agent_search_vault(
    vault: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<AgentSearchResult>, String> {
    let normalized = query.trim();
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    let mut candidates = Vec::new();
    candidates.extend(root_wiki_notes(vault));
    for dir in [
        "sources",
        "concepts",
        "drafts",
        "qa-reports",
        ".graph",
        "reviews/query-writeback",
    ] {
        candidates.extend(list_markdown(&vault.join(dir)));
    }
    candidates.extend(graph_canvas_files(vault));
    let mut results = Vec::new();
    for path in candidates {
        let content = read_text(&path);
        if let Some(snippet) = snippet_for_query(&content, normalized) {
            results.push(AgentSearchResult {
                path: rel_path(vault, &path),
                title: markdown_title(&content, &path),
                snippet,
            });
        }
        if results.len() >= limit.min(20) {
            break;
        }
    }
    Ok(results)
}

fn handle_agent_read_api_request(
    vault: &Path,
    token: &str,
    request: AgentHttpRequest,
) -> (String, serde_json::Value) {
    if !agent_request_authorized(&request.headers, token) {
        return (
            "401 Unauthorized".to_string(),
            serde_json::json!({
                "error": "missing or invalid bearer token",
                "tokenRequired": true
            }),
        );
    }
    let result = match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => Ok(serde_json::json!({
            "ok": true,
            "readOnly": true,
            "vaultPath": to_display(vault),
            "blockedOperations": build_agent_read_api_readiness(vault).blocked_operations,
        })),
        ("GET", "/vault/status") => inspect_vault(to_display(vault)).and_then(|value| {
            serde_json::to_value(value).map_err(|e| format!("failed to serialize status: {e}"))
        }),
        ("GET", "/vault/ingest-plan") | ("POST", "/vault/rescan-plan") => {
            plan_ingest(to_display(vault)).and_then(|value| {
                serde_json::to_value(value).map_err(|e| format!("failed to serialize plan: {e}"))
            })
        }
        ("GET", "/vault/sources") => plan_ingest(to_display(vault)).map(|plan| {
            serde_json::json!({
                "registry": plan.registry,
                "artifacts": plan.artifacts,
                "sourceAliases": plan.source_aliases,
            })
        }),
        ("GET", "/vault/traceability-warnings") => list_traceability_warnings(to_display(vault))
            .and_then(|value| {
                serde_json::to_value(value)
                    .map_err(|e| format!("failed to serialize traceability warnings: {e}"))
            }),
        ("GET", "/vault/writeback-proposals") => list_writeback_proposals(to_display(vault))
            .and_then(|value| {
                serde_json::to_value(value)
                    .map_err(|e| format!("failed to serialize writeback proposals: {e}"))
            }),
        ("GET", "/vault/graph") => inspect_vault(to_display(vault)).and_then(|status| {
            let edges = status
                .files
                .iter()
                .flat_map(|file| {
                    file.outbound_links.iter().map(move |target| {
                        serde_json::json!({
                            "source": rel_path(vault, &PathBuf::from(&file.path)),
                            "target": target,
                            "kind": "wikilink",
                        })
                    })
                })
                .collect::<Vec<_>>();
            serde_json::to_value(serde_json::json!({
                "nodes": status.files,
                "edges": edges,
            }))
            .map_err(|e| format!("failed to serialize graph: {e}"))
        }),
        ("POST", "/vault/search") => {
            let parsed = serde_json::from_str::<AgentSearchRequest>(&request.body)
                .map_err(|e| format!("invalid search request JSON: {e}"));
            parsed.and_then(|body| {
                let limit = body.limit.unwrap_or(10);
                agent_search_vault(vault, &body.query, limit).and_then(|results| {
                    serde_json::to_value(serde_json::json!({
                        "query": body.query,
                        "results": results,
                    }))
                    .map_err(|e| format!("failed to serialize search results: {e}"))
                })
            })
        }
        ("POST", "/vault/read-file") => {
            let parsed = serde_json::from_str::<AgentReadFileRequest>(&request.body)
                .map_err(|e| format!("invalid read-file request JSON: {e}"));
            parsed.and_then(|body| {
                read_vault_text_file(to_display(vault), body.path).and_then(|preview| {
                    serde_json::to_value(preview)
                        .map_err(|e| format!("failed to serialize file preview: {e}"))
                })
            })
        }
        _ => Err(format!(
            "unsupported read-only route: {} {}",
            request.method, request.path
        )),
    };
    match result {
        Ok(value) => ("200 OK".to_string(), value),
        Err(err) => (
            "400 Bad Request".to_string(),
            serde_json::json!({ "error": err }),
        ),
    }
}

fn handle_agent_read_api_stream(mut stream: TcpStream, vault: &Path, token: &str) {
    let _ = stream.set_nonblocking(false);
    let response = parse_http_request(&mut stream)
        .map(|request| handle_agent_read_api_request(vault, token, request))
        .unwrap_or_else(|err| {
            (
                "400 Bad Request".to_string(),
                serde_json::json!({ "error": err }),
            )
        });
    let _ = write_http_json(&mut stream, &response.0, &response.1);
}

fn start_agent_read_api_impl(vault: &Path, port: u16) -> Result<AgentReadApiServerInfo, String> {
    require_existing_dir(vault, "vault")?;
    let readiness = build_agent_read_api_readiness(vault);
    if !readiness.enabled {
        return Err(format!(
            "{} {}",
            readiness.reason,
            readiness.unmet_requirements.join("; ")
        ));
    }
    let mut guard = agent_read_api_server_state()
        .lock()
        .map_err(|_| "agent API server state lock poisoned".to_string())?;
    if let Some(existing) = guard.as_ref() {
        return Err(format!(
            "agent read API already running at {} for {}",
            existing.info.base_url, existing.info.vault_path
        ));
    }
    let vault = vault.canonicalize().unwrap_or_else(|_| vault.to_path_buf());
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|e| format!("failed to bind agent read API on 127.0.0.1:{port}: {e}"))?;
    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("failed to read bound agent API port: {e}"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("failed to configure agent API listener: {e}"))?;
    let token = agent_read_api_token(&vault);
    let info = AgentReadApiServerInfo {
        enabled: true,
        reason: "Read-only localhost API is running for this vault.".to_string(),
        bind_host: "127.0.0.1".to_string(),
        port: actual_port,
        base_url: format!("http://127.0.0.1:{actual_port}"),
        token: Some(token.clone()),
        vault_path: to_display(&vault),
        endpoints: agent_read_api_endpoints(),
        blocked_operations: readiness.blocked_operations,
    };
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let server_vault = vault.clone();
    let server_token = token.clone();
    let handle = thread::spawn(move || loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }
        match listener.accept() {
            Ok((stream, _)) => handle_agent_read_api_stream(stream, &server_vault, &server_token),
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(30));
            }
            Err(_) => break,
        }
    });
    *guard = Some(AgentReadApiServer {
        info: info.clone(),
        stop_tx,
        handle,
    });
    Ok(info)
}

#[tauri::command]
fn start_agent_read_api(
    vault_path: String,
    port: Option<u16>,
) -> Result<AgentReadApiServerInfo, String> {
    start_agent_read_api_impl(&PathBuf::from(vault_path), port.unwrap_or(19828))
}

#[tauri::command]
fn stop_agent_read_api() -> Result<AgentReadApiServerInfo, String> {
    let mut guard = agent_read_api_server_state()
        .lock()
        .map_err(|_| "agent API server state lock poisoned".to_string())?;
    let Some(server) = guard.take() else {
        return Err("agent read API is not running".to_string());
    };
    let _ = server.stop_tx.send(());
    let _ = server.handle.join();
    Ok(AgentReadApiServerInfo {
        enabled: false,
        reason: "Read-only localhost API stopped.".to_string(),
        token: None,
        ..server.info
    })
}

fn status_override_path(vault: &Path, file_name: &str) -> PathBuf {
    vault.join("_state").join(file_name)
}

fn load_status_overrides(vault: &Path, file_name: &str) -> HashMap<String, String> {
    read_text(&status_override_path(vault, file_name))
        .lines()
        .filter_map(|line| serde_json::from_str::<StatusOverrideRow>(line).ok())
        .filter(|row| !row.id.is_empty() && !row.status.is_empty())
        .map(|row| (row.id, row.status))
        .collect()
}

fn append_status_override(
    vault: &Path,
    file_name: &str,
    id: &str,
    status: &str,
) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("missing override id".to_string());
    }
    if status.trim().is_empty() {
        return Err("missing override status".to_string());
    }
    let path = status_override_path(vault, file_name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    let existing = read_text(&path);
    let row = serde_json::json!({
        "id": id,
        "status": status,
        "updated_at": Local::now().to_rfc3339(),
    });
    write_text(
        &path,
        &format!(
            "{}{}\n",
            existing,
            serde_json::to_string(&row)
                .map_err(|e| format!("failed to serialize override row: {e}"))?
        ),
    )
}

fn validate_status(status: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "unsupported status '{status}', expected one of: {}",
            allowed.join(", ")
        ))
    }
}

fn cancelled_job_ids(vault: &Path) -> HashSet<String> {
    load_ingest_jobs(vault)
        .into_iter()
        .filter_map(|(id, job)| (job.status == "cancelled").then_some(id))
        .collect()
}

fn claim_id_for_value(value: &serde_json::Value, line: usize) -> String {
    json_string(value, "claim_id")
        .or_else(|| json_string(value, "claimId"))
        .or_else(|| json_string(value, "id"))
        .unwrap_or_else(|| format!("line-{line}"))
}

fn claim_text_for_value(value: &serde_json::Value) -> String {
    json_string(value, "claim_text")
        .or_else(|| json_string(value, "claimText"))
        .or_else(|| json_string(value, "claim"))
        .or_else(|| json_string(value, "statement"))
        .or_else(|| json_string(value, "text"))
        .unwrap_or_else(|| "(missing claim text)".to_string())
}

fn claim_concepts_for_value(value: &serde_json::Value) -> Vec<String> {
    let mut concepts = json_string_array(value, "concepts");
    concepts.extend(json_string_array(value, "concept_ids"));
    concepts.extend(json_string_array(value, "related_concepts"));
    if let Some(concept) = json_string(value, "concept") {
        concepts.push(concept);
    }
    concepts.sort();
    concepts.dedup();
    concepts
}

fn claim_item_from_value(
    value: &serde_json::Value,
    line: usize,
    fallback_text_hash: bool,
) -> ClaimLedgerItem {
    let needs_review = json_bool(value, "needs_review");
    let verdict = json_string(value, "verdict")
        .or_else(|| json_string(value, "qa_verdict"))
        .unwrap_or_else(|| {
            if needs_review {
                "needs_review".to_string()
            } else {
                "unknown".to_string()
            }
        });
    let status = json_string(value, "status").unwrap_or_else(|| verdict.clone());
    let source_sha256 = json_string(value, "source_sha256");
    let source_uuid = json_string(value, "source_uuid")
        .or_else(|| json_string(value, "sourceUuid"))
        .or_else(|| source_sha256.as_deref().map(source_uuid));
    let evidence_quote = json_string(value, "evidence_quote")
        .or_else(|| json_string(value, "evidenceQuote"))
        .or_else(|| json_string(value, "quote"))
        .or_else(|| json_string(value, "supporting_quote"));
    let claim_text = claim_text_for_value(value);
    let evidence_hash = json_string(value, "evidence_hash")
        .or_else(|| json_string(value, "evidenceHash"))
        .or_else(|| evidence_quote.as_deref().map(sha256_text))
        .or_else(|| fallback_text_hash.then(|| sha256_text(&claim_text)));
    ClaimLedgerItem {
        claim_id: claim_id_for_value(value, line),
        claim_text,
        source_id: json_string(value, "source_id").or_else(|| json_string(value, "sourceId")),
        source_uuid,
        source_path: json_string(value, "source_path").or_else(|| json_string(value, "sourcePath")),
        chunk_id: json_string(value, "chunk_id").or_else(|| json_string(value, "chunkId")),
        verdict,
        status,
        needs_review,
        concepts: claim_concepts_for_value(value),
        evidence_quote,
        evidence_hash,
        updated_at: json_string(value, "updated_at").or_else(|| json_string(value, "updatedAt")),
        line,
    }
}

fn claim_ledger_items_with_fallback(
    vault: &Path,
    fallback_text_hash: bool,
) -> Vec<ClaimLedgerItem> {
    let claims_path = vault.join("claims").join("claims.jsonl");
    read_text(&claims_path)
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            serde_json::from_str::<serde_json::Value>(line)
                .ok()
                .map(|value| claim_item_from_value(&value, index + 1, fallback_text_hash))
        })
        .collect()
}

fn claim_ledger_items(vault: &Path) -> Vec<ClaimLedgerItem> {
    claim_ledger_items_with_fallback(vault, true)
}

fn set_json_string(value: &mut serde_json::Value, key: &str, next: &str) {
    if !value.is_object() {
        *value = serde_json::json!({});
    }
    if let Some(map) = value.as_object_mut() {
        map.insert(key.to_string(), serde_json::Value::String(next.to_string()));
    }
}

fn set_json_bool(value: &mut serde_json::Value, key: &str, next: bool) {
    if !value.is_object() {
        *value = serde_json::json!({});
    }
    if let Some(map) = value.as_object_mut() {
        map.insert(key.to_string(), serde_json::Value::Bool(next));
    }
}

fn source_id_number(source_id: &str) -> Option<usize> {
    source_id
        .strip_prefix("LLM-")
        .and_then(|value| value.parse::<usize>().ok())
}

fn format_source_id(number: usize) -> String {
    format!("LLM-{number:04}")
}

fn source_id_from_page_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy();
    source_id_number(&stem).map(|_| stem.to_string())
}

fn next_source_id_number(vault: &Path, rows: &[serde_json::Value]) -> usize {
    let max_existing = rows
        .iter()
        .filter_map(|row| json_string(row, "source_id"))
        .filter_map(|source_id| source_id_number(&source_id))
        .max()
        .unwrap_or(0);
    let counter_text = read_text(&vault.join("_state").join("id-counter.md"));
    let counter_next = counter_text.lines().find_map(|line| {
        line.trim()
            .strip_prefix("next:")
            .and_then(|value| value.trim().parse::<usize>().ok())
    });
    max_existing.max(counter_next.unwrap_or(1).saturating_sub(1)) + 1
}

fn write_next_source_id(vault: &Path, next: usize) -> Result<(), String> {
    write_text(
        &vault.join("_state").join("id-counter.md"),
        &format!("# ID Counter\nnext: {next}\n"),
    )
}

fn registry_rows(vault: &Path) -> Vec<serde_json::Value> {
    read_text(&vault.join("_state").join("source-registry.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect()
}

fn existing_source_ids(vault: &Path) -> HashMap<String, String> {
    let mut ids = HashMap::new();
    for row in registry_rows(vault) {
        let Some(source_id) = json_string(&row, "source_id") else {
            continue;
        };
        for key in [
            json_string(&row, "source_uuid"),
            json_string(&row, "source_sha256"),
            json_string(&row, "raw_sha256"),
            json_string(&row, "source_path"),
            json_string(&row, "raw_path"),
            json_string(&row, "canonical_path"),
        ]
        .into_iter()
        .flatten()
        {
            ids.insert(key, source_id.clone());
        }
        for key in json_string_array(&row, "duplicate_paths") {
            ids.insert(key, source_id.clone());
        }
    }
    ids
}

fn source_id_for_hash(vault: &Path, hash: &str) -> Option<String> {
    let uuid = source_uuid(hash);
    existing_source_ids(vault)
        .get(&uuid)
        .cloned()
        .or_else(|| existing_source_ids(vault).get(hash).cloned())
}

fn source_id_for_source(vault: &Path, hash: &str, source_path: &str) -> Option<String> {
    let ids = existing_source_ids(vault);
    let uuid = source_uuid(hash);
    ids.get(&uuid)
        .cloned()
        .or_else(|| ids.get(hash).cloned())
        .or_else(|| ids.get(source_path).cloned())
}

fn source_page_for_id(source_id: &str) -> String {
    format!("sources/{source_id}.md")
}

fn job_id_for_source_id(source_id: Option<&str>, hash: &str) -> String {
    source_id
        .map(|id| format!("JOB-{id}"))
        .unwrap_or_else(|| format!("job-{}", short_hash(hash)))
}

fn parse_frontmatter(path: &Path) -> HashMap<String, String> {
    let text = read_text(path);
    let mut fields = HashMap::new();
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return fields;
    };
    let mut closed = false;
    let mut current_key: Option<String> = None;
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            closed = true;
            break;
        }
        if let Some(item) = trimmed.strip_prefix("- ") {
            if let Some(key) = &current_key {
                let value = fields.entry(key.clone()).or_insert_with(String::new);
                if !value.is_empty() {
                    value.push('\n');
                }
                value.push_str(item.trim().trim_matches(['"', '\'']));
            }
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_string();
            fields.insert(
                key.clone(),
                value.trim().trim_matches(['"', '\'']).to_string(),
            );
            current_key = Some(key);
        }
    }
    if closed {
        fields
    } else {
        HashMap::new()
    }
}

fn frontmatter_list_values(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let unwrapped = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);
    let segments = if unwrapped.contains('\n') {
        unwrapped.lines().collect::<Vec<_>>()
    } else {
        unwrapped.split(',').collect::<Vec<_>>()
    };
    segments
        .into_iter()
        .map(str::trim)
        .map(|value| value.trim_start_matches("- "))
        .map(|value| value.trim_matches(['"', '\'']))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn page_source_refs(fields: &HashMap<String, String>) -> Vec<String> {
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    for key in [
        "sources",
        "source",
        "source_path",
        "sourcePath",
        "raw_path",
        "rawPath",
    ] {
        if let Some(value) = fields.get(key) {
            for source_ref in frontmatter_list_values(value) {
                if seen.insert(source_ref.clone()) {
                    refs.push(source_ref);
                }
            }
        }
    }
    refs
}

fn page_title(path: &Path) -> Option<String> {
    let fields = parse_frontmatter(path);
    if let Some(title) = fields.get("title").filter(|value| !value.is_empty()) {
        return Some(title.clone());
    }
    read_text(path).lines().find_map(|line| {
        line.strip_prefix("# ")
            .map(|value| value.trim().to_string())
    })
}

fn strip_frontmatter(text: &str) -> &str {
    if !text.starts_with("---\n") {
        return text;
    }
    text.strip_prefix("---\n")
        .and_then(|rest| rest.split_once("---\n").map(|(_, body)| body))
        .unwrap_or(text)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let take = max_chars.saturating_sub(3);
    format!("{}...", value.chars().take(take).collect::<String>())
}

fn markdown_excerpt(path: &Path) -> Option<String> {
    let text = read_text(path);
    let body = strip_frontmatter(&text);
    let mut lines = Vec::new();
    let mut in_code_block = false;
    for raw_line in body.lines() {
        let mut line = raw_line.trim();
        if line.starts_with("```") || line.starts_with("~~~") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block
            || line.is_empty()
            || line.starts_with('#')
            || line.starts_with('|')
            || line.starts_with("![")
        {
            continue;
        }
        line = line
            .trim_start_matches(|ch| matches!(ch, '-' | '*' | '+'))
            .trim_start();
        line = line.trim_start_matches('>').trim_start();
        if !line.is_empty() {
            lines.push(line);
        }
        if lines.join(" ").chars().count() >= 320 {
            break;
        }
    }
    let normalized = lines
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.is_empty() {
        None
    } else {
        Some(truncate_chars(&normalized, 320))
    }
}

fn qa_verdict(path: &Path) -> Option<String> {
    let text = read_text(path);
    if text.contains("verdict: PASS") {
        Some("PASS".to_string())
    } else if text.contains("verdict: FAIL") {
        Some("FAIL".to_string())
    } else {
        None
    }
}

fn normalize_wikilink_key(value: &str) -> Option<String> {
    let mut target = value
        .split('|')
        .next()
        .unwrap_or_default()
        .split('#')
        .next()
        .unwrap_or_default()
        .trim()
        .replace('\\', "/");
    while let Some(stripped) = target.strip_prefix("./") {
        target = stripped.to_string();
    }
    let target = target.trim_matches('/').trim();
    let target = target
        .strip_suffix(".markdown")
        .or_else(|| target.strip_suffix(".md"))
        .unwrap_or(target)
        .trim();
    if target.is_empty() {
        None
    } else {
        Some(target.to_ascii_lowercase())
    }
}

fn extract_wikilink_targets(text: &str) -> Vec<String> {
    let mut targets = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        let Some(end) = rest.find("]]") else {
            break;
        };
        if let Some(target) = normalize_wikilink_key(&rest[..end]) {
            if !targets.contains(&target) {
                targets.push(target);
            }
        }
        rest = &rest[end + 2..];
    }
    targets
}

fn strip_markdown_extension(value: &str) -> &str {
    value
        .strip_suffix(".markdown")
        .or_else(|| value.strip_suffix(".md"))
        .unwrap_or(value)
}

fn wikilink_aliases(vault: &Path, path: &Path) -> Vec<String> {
    let mut aliases = Vec::new();
    let rel = rel_path(vault, path);
    if let Some(alias) = normalize_wikilink_key(strip_markdown_extension(&rel)) {
        aliases.push(alias);
    }
    if let Some(stem) = path.file_stem().and_then(OsStr::to_str) {
        if let Some(alias) = normalize_wikilink_key(stem) {
            aliases.push(alias);
        }
    }
    if let Some(title) = page_title(path) {
        if let Some(alias) = normalize_wikilink_key(&title) {
            aliases.push(alias);
        }
    }
    aliases.sort();
    aliases.dedup();
    aliases
}

#[derive(Debug, Default)]
struct WikilinkContext {
    outbound: HashMap<String, Vec<String>>,
    inbound: HashMap<String, Vec<String>>,
}

fn build_wikilink_context(vault: &Path, paths: &[PathBuf]) -> WikilinkContext {
    let mut aliases = HashMap::new();
    for path in paths {
        let rel = rel_path(vault, path);
        for alias in wikilink_aliases(vault, path) {
            aliases.entry(alias).or_insert_with(|| rel.clone());
        }
    }

    let mut outbound: HashMap<String, Vec<String>> = HashMap::new();
    let mut inbound: HashMap<String, Vec<String>> = HashMap::new();
    for path in paths {
        let rel = rel_path(vault, path);
        let mut links = Vec::new();
        for target in extract_wikilink_targets(&read_text(path)) {
            let resolved = aliases
                .get(&target)
                .cloned()
                .unwrap_or_else(|| target.clone());
            if !links.contains(&resolved) {
                links.push(resolved.clone());
            }
            if resolved != rel && aliases.values().any(|value| value == &resolved) {
                inbound.entry(resolved).or_default().push(rel.clone());
            }
        }
        links.sort();
        outbound.insert(rel, links);
    }

    for links in inbound.values_mut() {
        links.sort();
        links.dedup();
    }

    WikilinkContext { outbound, inbound }
}

fn file_item(vault: &Path, path: &Path, kind: &str, links: &WikilinkContext) -> VaultFile {
    let fields = parse_frontmatter(path);
    let rel = rel_path(vault, path);
    VaultFile {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: to_display(path),
        kind: kind.to_string(),
        source_id: source_id_from_page_path(path),
        title: page_title(path),
        excerpt: markdown_excerpt(path),
        status: fields.get("status").cloned(),
        updated: fields.get("updated").cloned(),
        qa_verdict: source_qa(vault, path),
        needs_review: 0,
        outbound_links: links.outbound.get(&rel).cloned().unwrap_or_default(),
        inbound_links: links.inbound.get(&rel).cloned().unwrap_or_default(),
        source_refs: page_source_refs(&fields),
    }
}

fn source_qa(vault: &Path, source_path: &Path) -> Option<String> {
    if !source_path
        .file_name()?
        .to_string_lossy()
        .starts_with("LLM-")
    {
        return None;
    }
    let stem = source_path.file_stem()?.to_string_lossy();
    ["md", "markdown"]
        .into_iter()
        .find_map(|ext| qa_verdict(&vault.join("qa-reports").join(format!("{stem}.{ext}"))))
}

fn runtime_scripts_path(vault: &Path) -> Option<PathBuf> {
    let path = vault.join(".open-llm-wiki").join("scripts");
    if path.join("wiki_lint.py").is_file() {
        Some(path)
    } else {
        None
    }
}

fn runtime_version_for_scripts(scripts: &Path) -> Option<String> {
    let root = scripts.parent().unwrap_or(scripts);
    let version_file = root.join("VERSION");
    if version_file.is_file() {
        let version = read_text(&version_file).trim().to_string();
        if !version.is_empty() {
            return Some(version);
        }
    }
    for candidate in [
        root.join("pyproject.toml"),
        root.parent()?.join("pyproject.toml"),
    ] {
        let text = read_text(&candidate);
        for line in text.lines() {
            let trimmed = line.trim();
            if let Some(value) = trimmed.strip_prefix("version") {
                if let Some((_, raw)) = value.split_once('=') {
                    let version = raw.trim().trim_matches('"').to_string();
                    if !version.is_empty() {
                        return Some(version);
                    }
                }
            }
        }
    }
    Some(format!("desktop-adapter {}", env!("CARGO_PKG_VERSION")))
}

fn latest_modified_time(root: &Path) -> Option<String> {
    fn visit(path: &Path, latest: &mut Option<std::time::SystemTime>) {
        let Ok(metadata) = fs::metadata(path) else {
            return;
        };
        if let Ok(modified) = metadata.modified() {
            if latest.as_ref().is_none_or(|current| modified > *current) {
                *latest = Some(modified);
            }
        }
        if path.is_dir() {
            if let Ok(read_dir) = fs::read_dir(path) {
                for entry in read_dir.flatten() {
                    let child = entry.path();
                    if child
                        .file_name()
                        .and_then(OsStr::to_str)
                        .is_some_and(|name| name == ".git" || name == "node_modules")
                    {
                        continue;
                    }
                    visit(&child, latest);
                }
            }
        }
    }
    let mut latest = None;
    for child in [
        "raw",
        "sources",
        "concepts",
        "drafts",
        "qa-reports",
        "reviews/query-writeback",
        "claims",
        "_state",
    ] {
        visit(&root.join(child), &mut latest);
    }
    latest.map(|time| {
        let datetime: DateTime<Local> = time.into();
        datetime.to_rfc3339()
    })
}

#[tauri::command]
fn load_app_state() -> Result<DesktopAppState, String> {
    Ok(load_app_state_from_disk())
}

#[tauri::command]
fn save_interface_language(interface_language: String) -> Result<DesktopAppState, String> {
    let normalized = match interface_language.as_str() {
        "en" => "en",
        _ => "zh",
    };
    let mut state = load_app_state_from_disk();
    state.interface_language = normalized.to_string();
    state.updated_at = Some(Local::now().to_rfc3339());
    save_app_state_to_disk(&state)?;
    Ok(state)
}

#[tauri::command]
fn save_last_selected_vault(vault_path: String) -> Result<DesktopAppState, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let workspace = workspace_root_for_vault(&vault);
    let mut state = load_app_state_from_workspace(&workspace);
    push_recent_vault(&mut state, &vault);
    save_app_state_to_workspace(&workspace, &state)?;
    mirror_app_state_to_launch_scope(&state, &workspace)?;
    Ok(state)
}

#[tauri::command]
fn restore_last_selected_vault() -> Result<VaultRestoreResult, String> {
    let state = load_app_state_from_disk();
    let Some(path) = state.last_selected_vault.clone() else {
        return Ok(VaultRestoreResult {
            state,
            vault_path: None,
            exists: false,
            status: None,
            error: None,
        });
    };
    let vault = PathBuf::from(&path);
    if !vault.is_dir() {
        return Ok(VaultRestoreResult {
            state,
            vault_path: Some(path),
            exists: false,
            status: None,
            error: Some("Last selected vault no longer exists. Choose another vault.".to_string()),
        });
    }
    match inspect_vault(to_display(&vault)) {
        Ok(status) => Ok(VaultRestoreResult {
            state,
            vault_path: Some(to_display(&vault)),
            exists: true,
            status: Some(status),
            error: None,
        }),
        Err(error) => Ok(VaultRestoreResult {
            state,
            vault_path: Some(to_display(&vault)),
            exists: true,
            status: None,
            error: Some(error),
        }),
    }
}

#[tauri::command]
fn list_vault_suggestions() -> Result<Vec<VaultSuggestion>, String> {
    let state = load_app_state_from_disk();
    let mut suggestions = Vec::new();
    let mut seen = HashSet::new();
    for path in state.recent_vaults {
        if seen.insert(path.clone()) {
            suggestions.push(VaultSuggestion {
                label: "最近 vault".to_string(),
                exists: PathBuf::from(&path).is_dir(),
                kind: "recent".to_string(),
                path,
            });
        }
    }
    let vaults_root = workspace_root().join("vaults");
    if let Ok(read_dir) = fs::read_dir(vaults_root) {
        let mut candidates = read_dir
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .filter(|path| {
                path.file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.to_ascii_lowercase().contains("deepseek"))
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
        for path in candidates.into_iter().take(4) {
            let display = to_display(&path);
            if seen.insert(display.clone()) {
                suggestions.push(VaultSuggestion {
                    label: "打开 DeepSeek vault".to_string(),
                    path: display,
                    kind: "deepseek".to_string(),
                    exists: true,
                });
            }
        }
    }
    Ok(suggestions)
}

#[tauri::command]
fn inspect_vault(vault_path: String) -> Result<VaultStatus, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;

    let required_dirs = [
        "raw",
        "sources",
        "concepts",
        "drafts",
        "qa-reports",
        "claims",
        "_state",
    ];
    let required_files = [
        "SCHEMA.md",
        "index.md",
        "log.md",
        "_state/growth-queue.jsonl",
        "_state/id-counter.md",
        "_state/source-registry.jsonl",
        "_state/artifacts.jsonl",
        "_state/ingest-jobs.jsonl",
        "_state/actions.jsonl",
        "_state/impact-graph.jsonl",
        "_state/lint-findings.jsonl",
        "_state/science-review-queue.jsonl",
        "claims/claims.jsonl",
    ];
    let mut errors = Vec::new();
    for dir in required_dirs {
        if !vault.join(dir).is_dir() {
            errors.push(format!("missing required directory: {dir}"));
        }
    }
    for file in required_files {
        if !vault.join(file).is_file() {
            errors.push(format!("missing required file: {file}"));
        }
    }

    let (claims, claims_needing_review, stale_claims, contradicted_claims) =
        count_claims(&vault.join("claims").join("claims.jsonl"));
    let product_scorecard = vault
        .join("_state")
        .is_dir()
        .then(|| write_product_scorecard_report(&vault).ok())
        .flatten()
        .map(|report| report.summary);
    let sources = list_markdown(&vault.join("sources"));
    let drafts = list_markdown(&vault.join("drafts"));
    let concepts = list_markdown(&vault.join("concepts"));
    let mut reports = list_markdown(&vault.join("qa-reports"));
    reports.extend(graph_report_notes(&vault));
    reports.extend(graph_canvas_files(&vault));
    reports.sort();
    reports.dedup();
    let notes = root_wiki_notes(&vault);
    let markdown_files = sources
        .iter()
        .chain(drafts.iter())
        .chain(concepts.iter())
        .chain(reports.iter())
        .chain(notes.iter())
        .cloned()
        .collect::<Vec<_>>();
    let wikilinks = build_wikilink_context(&vault, &markdown_files);
    let mut files = Vec::new();
    for path in &notes {
        files.push(file_item(&vault, path, "note", &wikilinks));
    }
    for path in &sources {
        files.push(file_item(&vault, path, "source", &wikilinks));
    }
    for path in &drafts {
        files.push(file_item(&vault, path, "draft", &wikilinks));
    }
    for path in &concepts {
        files.push(file_item(&vault, path, "concept", &wikilinks));
    }
    for path in &reports {
        files.push(file_item(&vault, path, "report", &wikilinks));
    }
    for path in collect_ingest_inputs(&vault) {
        files.push(VaultFile {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: to_display(&path),
            kind: "inbox".to_string(),
            source_id: None,
            title: None,
            excerpt: None,
            status: None,
            updated: None,
            qa_verdict: None,
            needs_review: 0,
            outbound_links: Vec::new(),
            inbound_links: Vec::new(),
            source_refs: Vec::new(),
        });
    }

    let reading_quality = vault
        .join("_state")
        .is_dir()
        .then(|| write_reading_quality_report(&vault).ok())
        .flatten()
        .map(|report| report.summary);
    let runtime = runtime_scripts_path(&vault);
    Ok(VaultStatus {
        path: to_display(&vault),
        schema_valid: errors.is_empty(),
        runtime_installed: runtime.is_some(),
        obsidian_enabled: vault.join(".obsidian").is_dir(),
        dashboard_available: vault.join("_dashboard.md").is_file(),
        runtime_scripts_path: runtime.as_ref().map(|path| to_display(path)),
        runtime_version: runtime
            .as_ref()
            .and_then(|path| runtime_version_for_scripts(path)),
        last_updated: latest_modified_time(&vault),
        counts: VaultCounts {
            inbox: files.iter().filter(|item| item.kind == "inbox").count(),
            notes: notes.len(),
            sources: sources.len(),
            drafts: drafts.len(),
            concepts: concepts.len(),
            reports: reports.len(),
            claims,
            claims_needing_review,
            science_review_queue: count_jsonl(
                &vault.join("_state").join("science-review-queue.jsonl"),
            ),
            growth_queue: count_jsonl(&vault.join("_state").join("growth-queue.jsonl")),
            stale_claims,
            contradicted_claims,
            ingest_jobs: count_jsonl(&vault.join("_state").join("ingest-jobs.jsonl")).max(
                count_jsonl(&vault.join("_state").join("desktop-ingest-jobs.jsonl")),
            ),
            actions: count_jsonl(&vault.join("_state").join("actions.jsonl")).max(count_jsonl(
                &vault.join("_state").join("desktop-actions.jsonl"),
            )),
        },
        reading_quality,
        product_scorecard,
        files,
        errors,
    })
}

#[tauri::command]
fn create_vault(
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    enable_obsidian: bool,
    obsidian_profile: String,
    skip_downloads: bool,
) -> Result<VaultStatus, String> {
    let vault = PathBuf::from(vault_path);
    reject_trailing_space_path(&vault, "vault path")?;
    if vault.exists() {
        return Err(format!("target already exists: {}", vault.display()));
    }
    if let Some(runtime) = runtime_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        let runtime_root = PathBuf::from(runtime);
        let init_script = runtime_root.join("scripts").join("wiki_init.py");
        if init_script.is_file() {
            let mut args = vec![
                init_script.to_string_lossy().to_string(),
                to_display(&vault),
                "--repo-root".to_string(),
                to_display(&runtime_root),
            ];
            if enable_obsidian {
                args.extend([
                    "--obsidian".to_string(),
                    "--obsidian-profile".to_string(),
                    obsidian_profile,
                ]);
                if skip_downloads {
                    args.push("--obsidian-skip-downloads".to_string());
                }
            }
            let output = Command::new(&python_path)
                .args(&args)
                .output()
                .map_err(|e| format!("failed to run wiki_init.py: {e}"))?;
            if !output.status.success() {
                return Err(format!(
                    "wiki_init.py failed\nstdout:\n{}\nstderr:\n{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
            return inspect_vault(to_display(&vault));
        }
    }
    create_minimal_vault_with_obsidian(&vault, enable_obsidian)?;
    inspect_vault(to_display(&vault))
}

#[cfg(test)]
fn create_minimal_vault(vault: &Path) -> Result<(), String> {
    create_minimal_vault_with_obsidian(vault, true)
}

fn create_minimal_vault_with_obsidian(vault: &Path, enable_obsidian: bool) -> Result<(), String> {
    for dir in [
        "raw/inbox",
        "sources",
        "concepts",
        "drafts",
        "qa-reports",
        "claims",
        "templates",
        "_state",
        "log-archive",
    ] {
        fs::create_dir_all(vault.join(dir)).map_err(|e| format!("failed to create {dir}: {e}"))?;
    }
    write_text(
        vault.join("SCHEMA.md").as_path(),
        "# open-llm-wiki Schema\n\nRuntime not installed yet.\n",
    )?;
    write_text(
        vault.join("index.md").as_path(),
        "# LLM Wiki Index\n\n## Sources\n\n## Concepts\n",
    )?;
    write_text(
        vault.join("README.md").as_path(),
        "# LLM Wiki Vault\n\nSelect an open-llm-wiki runtime path to install scripts.\n",
    )?;
    write_text(vault.join("log.md").as_path(), "# Wiki Log\n")?;
    write_obsidian_templates(vault)?;
    write_text(vault.join("claims/claims.jsonl").as_path(), "")?;
    write_text(vault.join("_state/growth-queue.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/id-counter.md").as_path(),
        "# ID Counter\nnext: 1\n",
    )?;
    write_text(vault.join("_state/source-registry.jsonl").as_path(), "")?;
    write_text(vault.join("_state/artifacts.jsonl").as_path(), "")?;
    write_text(vault.join("_state/ingest-jobs.jsonl").as_path(), "")?;
    write_text(vault.join("_state/actions.jsonl").as_path(), "")?;
    write_text(vault.join("_state/impact-graph.jsonl").as_path(), "")?;
    write_text(vault.join("_state/lint-findings.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/desktop-source-registry.jsonl").as_path(),
        "",
    )?;
    write_text(vault.join("_state/source-id-aliases.jsonl").as_path(), "")?;
    write_text(
        vault
            .join("_state/desktop-source-id-aliases.jsonl")
            .as_path(),
        "",
    )?;
    write_text(vault.join("_state/desktop-artifacts.jsonl").as_path(), "")?;
    write_text(vault.join("_state/desktop-ingest-jobs.jsonl").as_path(), "")?;
    write_text(vault.join("_state/desktop-actions.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/desktop-impact-graph.jsonl").as_path(),
        "",
    )?;
    write_text(
        vault.join("_state/science-review-queue.jsonl").as_path(),
        "",
    )?;
    if enable_obsidian {
        write_obsidian_local_profile(vault)?;
    }
    Ok(())
}

fn write_obsidian_templates(vault: &Path) -> Result<(), String> {
    fs::create_dir_all(vault.join("templates"))
        .map_err(|e| format!("failed to create templates dir: {e}"))?;
    write_text(vault.join("templates/source.md").as_path(), SOURCE_TEMPLATE)?;
    write_text(
        vault.join("templates/concept.md").as_path(),
        CONCEPT_TEMPLATE,
    )?;
    Ok(())
}

fn write_text_if_missing(path: &Path, text: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    write_text(path, text)
}

fn write_obsidian_core_plugins(path: &Path) -> Result<(), String> {
    let mut plugins = serde_json::from_str::<Vec<String>>(&read_text(path)).unwrap_or_default();
    for plugin in OBSIDIAN_CORE_PLUGINS {
        if !plugins.iter().any(|item| item == plugin) {
            plugins.push((*plugin).to_string());
        }
    }
    let rendered = serde_json::to_string_pretty(&plugins)
        .map_err(|e| format!("failed to serialize Obsidian core plugins: {e}"))?
        + "\n";
    write_text(path, &rendered)
}

fn write_obsidian_local_profile(vault: &Path) -> Result<(), String> {
    let obsidian = vault.join(".obsidian");
    fs::create_dir_all(&obsidian)
        .map_err(|e| format!("failed to create Obsidian profile dir: {e}"))?;
    write_obsidian_core_plugins(&obsidian.join("core-plugins.json"))?;
    write_text_if_missing(&obsidian.join("community-plugins.json"), "[]\n")?;
    write_text_if_missing(
        &obsidian.join("app.json"),
        "{\n  \"alwaysUpdateLinks\": true,\n  \"showInlineTitle\": true,\n  \"attachmentFolderPath\": \"raw/attachments\"\n}\n",
    )?;
    write_text_if_missing(
        &obsidian.join("templates.json"),
        "{\n  \"folder\": \"templates\",\n  \"dateFormat\": \"YYYY-MM-DD\",\n  \"timeFormat\": \"HH:mm\"\n}\n",
    )?;
    Ok(())
}

#[tauri::command]
fn repair_obsidian_templates(vault_path: String) -> Result<VaultStatus, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    write_obsidian_templates(&vault)?;
    write_obsidian_local_profile(&vault)?;
    inspect_vault(to_display(&vault))
}

#[tauri::command]
fn generate_product_scorecard(vault_path: String) -> Result<ProductScorecardReport, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    write_product_scorecard_report(&vault)
}

#[tauri::command]
fn import_to_inbox(vault_path: String, paths: Vec<String>) -> Result<ImportResult, String> {
    let batch = import_sources_impl(&PathBuf::from(&vault_path), paths, false, false)?;
    let copied = batch
        .imported
        .iter()
        .filter_map(|item| {
            let path = item.target_path.as_ref()?;
            Some(VaultFile {
                name: item.file_name.clone(),
                path: path.clone(),
                kind: "inbox".to_string(),
                source_id: None,
                title: item.title_hint.clone(),
                excerpt: None,
                status: Some(item.status.clone()),
                updated: None,
                qa_verdict: None,
                needs_review: 0,
                outbound_links: Vec::new(),
                inbound_links: Vec::new(),
                source_refs: Vec::new(),
            })
        })
        .collect();
    Ok(ImportResult {
        copied,
        skipped_duplicates: batch
            .skipped_duplicates
            .iter()
            .filter_map(|item| item.duplicate_of.clone())
            .collect(),
        errors: batch.errors,
    })
}

#[tauri::command]
fn import_sources(
    vault_path: String,
    paths: Vec<String>,
    enqueue_after_import: bool,
    preserve_folders: bool,
) -> Result<ImportBatchResult, String> {
    import_sources_impl(
        &PathBuf::from(vault_path),
        paths,
        enqueue_after_import,
        preserve_folders,
    )
}

#[derive(Debug)]
struct ImportCandidate {
    source: PathBuf,
    folder_context: Option<String>,
    source_display: Option<String>,
}

fn supported_import_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "pdf" | "md" | "markdown" | "txt" | "zip" | "docx" | "pptx" | "xlsx" | "csv"
    )
}

fn is_symlink_path(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn auxiliary_raw_support_file(path: &Path) -> bool {
    if path
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name == "_translation_cache.json")
    {
        return true;
    }
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    matches!(extension.as_str(), "md" | "markdown" | "txt")
        && matches!(stem.as_str(), "index" | "索引")
}

fn collect_import_dir(
    root: &Path,
    current: &Path,
    preserve_folders: bool,
    out: &mut Vec<ImportCandidate>,
    errors: &mut Vec<String>,
) {
    if let Ok(read_dir) = fs::read_dir(current) {
        let mut entries = read_dir
            .flatten()
            .map(|entry| entry.path())
            .collect::<Vec<_>>();
        entries.sort();
        for path in entries {
            if path
                .file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| name.starts_with('.'))
            {
                continue;
            }
            if is_symlink_path(&path) {
                errors.push(format!("skipped symlink import path: {}", path.display()));
                continue;
            }
            if path.is_dir() {
                collect_import_dir(root, &path, preserve_folders, out, errors);
            } else if path.is_file()
                && supported_import_file(&path)
                && !auxiliary_raw_support_file(&path)
            {
                let folder_context = if preserve_folders {
                    path.parent()
                        .and_then(|parent| parent.strip_prefix(root).ok())
                        .filter(|rel| !rel.as_os_str().is_empty())
                        .map(|rel| rel.to_string_lossy().to_string())
                } else {
                    None
                };
                out.push(ImportCandidate {
                    source: path,
                    folder_context,
                    source_display: None,
                });
            }
        }
    }
}

fn collect_import_candidates(
    paths: Vec<String>,
    preserve_folders: bool,
) -> (Vec<ImportCandidate>, Vec<String>) {
    let mut candidates = Vec::new();
    let mut errors = Vec::new();
    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        if is_symlink_path(&path) {
            errors.push(format!("skipped symlink input: {raw_path}"));
        } else if path.is_dir() {
            collect_import_dir(&path, &path, preserve_folders, &mut candidates, &mut errors);
        } else if path.is_file() {
            if auxiliary_raw_support_file(&path) {
                continue;
            } else if supported_import_file(&path) {
                candidates.push(ImportCandidate {
                    source: path,
                    folder_context: None,
                    source_display: None,
                });
            } else {
                errors.push(format!("unsupported import type: {raw_path}"));
            }
        } else {
            errors.push(format!("skipped missing input: {raw_path}"));
        }
    }
    (candidates, errors)
}

fn safe_archive_entry_path(name: &str) -> Option<PathBuf> {
    if name.contains('\0') || name.contains('\\') {
        return None;
    }
    let mut out = PathBuf::new();
    for component in Path::new(name).components() {
        match component {
            Component::Normal(part) => {
                if part.to_string_lossy().trim().is_empty() {
                    return None;
                }
                out.push(part);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn archive_entry_path(decoded_name: &str, raw_name: &[u8]) -> Option<PathBuf> {
    if let Ok(raw_utf8) = std::str::from_utf8(raw_name) {
        return safe_archive_entry_path(raw_utf8);
    }
    safe_archive_entry_path(decoded_name)
}

fn is_archive_metadata_path(path: &Path) -> bool {
    let mut parts = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    if parts.first().is_some_and(|part| part == "__MACOSX") {
        return true;
    }
    parts
        .pop()
        .is_some_and(|file_name| file_name.starts_with("._"))
}

fn join_folder_context(base: Option<&str>, rel_parent: Option<&Path>) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(base) = base.filter(|value| !value.trim().is_empty()) {
        parts.push(base.trim_matches('/').to_string());
    }
    if let Some(parent) = rel_parent.filter(|path| !path.as_os_str().is_empty()) {
        parts.push(parent.to_string_lossy().trim_matches('/').to_string());
    }
    parts.retain(|part| !part.is_empty());
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn extract_archive_import_candidates(
    vault: &Path,
    candidate: &ImportCandidate,
) -> (Vec<ImportCandidate>, Vec<String>, Option<PathBuf>) {
    let archive_path = &candidate.source;
    let archive_display = candidate
        .source_display
        .clone()
        .unwrap_or_else(|| to_display(archive_path));
    let archive_file = match fs::File::open(archive_path) {
        Ok(file) => file,
        Err(error) => {
            return (
                Vec::new(),
                vec![format!("failed to open archive {archive_display}: {error}")],
                None,
            )
        }
    };
    let mut archive = match ZipArchive::new(archive_file) {
        Ok(archive) => archive,
        Err(error) => {
            return (
                Vec::new(),
                vec![format!("failed to read archive {archive_display}: {error}")],
                None,
            )
        }
    };
    let short_hash = sha256_file(archive_path)
        .ok()
        .and_then(|hash| hash.get(..12).map(ToString::to_string))
        .unwrap_or_else(|| {
            Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .to_string()
        });
    let temp_root = vault
        .join("_state")
        .join("archive-import")
        .join(format!("{}-{short_hash}", safe_stem(archive_path)));
    let _ = fs::remove_dir_all(&temp_root);
    let mut extracted = Vec::new();
    let mut errors = Vec::new();

    for index in 0..archive.len() {
        let mut entry = match archive.by_index(index) {
            Ok(entry) => entry,
            Err(error) => {
                errors.push(format!(
                    "failed to read archive entry {index} from {archive_display}: {error}"
                ));
                continue;
            }
        };
        if entry.is_dir() || entry.is_symlink() {
            continue;
        }
        let Some(rel_path) = archive_entry_path(entry.name(), entry.name_raw()) else {
            errors.push(format!(
                "skipped unsafe archive entry `{}` from {}",
                entry.name(),
                archive_display
            ));
            continue;
        };
        if is_archive_metadata_path(&rel_path)
            || auxiliary_raw_support_file(&rel_path)
            || !supported_import_file(&rel_path)
        {
            continue;
        }
        let target = temp_root.join(&rel_path);
        if let Some(parent) = target.parent() {
            if let Err(error) = fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "failed to create archive import dir {}: {e}",
                    parent.display()
                )
            }) {
                errors.push(error);
                continue;
            }
        }
        let mut output = match fs::File::create(&target).map_err(|e| {
            format!(
                "failed to extract archive entry {}: {e}",
                rel_path.display()
            )
        }) {
            Ok(file) => file,
            Err(error) => {
                errors.push(error);
                continue;
            }
        };
        if let Err(error) = std::io::copy(&mut entry, &mut output)
            .map_err(|e| format!("failed to copy archive entry {}: {e}", rel_path.display()))
        {
            errors.push(error);
            let _ = fs::remove_file(&target);
            continue;
        }
        extracted.push(ImportCandidate {
            source: target,
            folder_context: join_folder_context(
                candidate.folder_context.as_deref(),
                rel_path.parent(),
            ),
            source_display: Some(format!("{}!{}", archive_display, rel_path.display())),
        });
    }

    if extracted.is_empty() && errors.is_empty() {
        errors.push(format!(
            "archive contained no supported source files after filtering __MACOSX and helper files: {archive_display}"
        ));
    }

    (extracted, errors, Some(temp_root))
}

fn normalize_title(value: &str) -> String {
    let mut out = String::new();
    let mut previous_space = false;
    for ch in value.chars() {
        if ch.is_alphanumeric() {
            out.extend(ch.to_lowercase());
            previous_space = false;
        } else if !previous_space {
            out.push(' ');
            previous_space = true;
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn title_hint_from_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(OsStr::to_str)
        .map(|stem| stem.replace(['_', '-'], " "))
        .map(|title| title.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|title| !title.is_empty())
}

fn token_overlap(left: &str, right: &str) -> f32 {
    let left_tokens = normalize_title(left)
        .split_whitespace()
        .map(ToString::to_string)
        .collect::<HashSet<_>>();
    let right_tokens = normalize_title(right)
        .split_whitespace()
        .map(ToString::to_string)
        .collect::<HashSet<_>>();
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return 0.0;
    }
    let intersection = left_tokens.intersection(&right_tokens).count() as f32;
    let union = left_tokens.union(&right_tokens).count() as f32;
    intersection / union
}

fn read_probe_text(path: &Path) -> String {
    if !is_markdown_or_text(path) {
        return title_hint_from_path(path).unwrap_or_default();
    }
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return title_hint_from_path(path).unwrap_or_default(),
    };
    let mut buf = vec![0_u8; 64 * 1024];
    let read = file.read(&mut buf).unwrap_or(0);
    let mut text = String::from_utf8_lossy(&buf[..read]).to_string();
    text.push('\n');
    text.push_str(&title_hint_from_path(path).unwrap_or_default());
    text
}

fn extract_doi(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let start = lower.find("10.")?;
    let candidate = text[start..]
        .chars()
        .take_while(|ch| {
            ch.is_ascii_alphanumeric()
                || matches!(ch, '.' | '/' | '-' | '_' | '(' | ')' | ':' | ';')
        })
        .collect::<String>()
        .trim_end_matches(['.', ',', ';', ':', ')'])
        .to_string();
    (candidate.contains('/') && candidate.len() >= 7).then_some(candidate)
}

fn extract_arxiv_id(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let marker = lower.find("arxiv:").map(|idx| idx + "arxiv:".len());
    let start = marker.or_else(|| lower.find("arxiv ").map(|idx| idx + "arxiv ".len()))?;
    let candidate = text[start..]
        .chars()
        .skip_while(|ch| ch.is_whitespace())
        .take_while(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '/' | '_'))
        .collect::<String>()
        .trim_end_matches(['.', ',', ';'])
        .to_string();
    (!candidate.is_empty()).then_some(candidate)
}

fn import_metadata(path: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let text = read_probe_text(path);
    (
        extract_doi(&text),
        extract_arxiv_id(&text),
        title_hint_from_path(path),
    )
}

fn import_report_metadata(
    vault: &Path,
) -> (
    HashMap<String, String>,
    HashMap<String, String>,
    Vec<(String, String)>,
) {
    let mut doi = HashMap::new();
    let mut arxiv = HashMap::new();
    let mut titles = Vec::new();
    for line in read_text(&vault.join("_state").join("import-report.jsonl")).lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let path = json_string(&value, "targetPath")
            .or_else(|| json_string(&value, "target_path"))
            .or_else(|| json_string(&value, "sourcePath"))
            .or_else(|| json_string(&value, "source_path"))
            .unwrap_or_default();
        if let Some(value) = json_string(&value, "doi") {
            doi.insert(value.to_ascii_lowercase(), path.clone());
        }
        if let Some(value) =
            json_string(&value, "arxivId").or_else(|| json_string(&value, "arxiv_id"))
        {
            arxiv.insert(value.to_ascii_lowercase(), path.clone());
        }
        if let Some(title) =
            json_string(&value, "titleHint").or_else(|| json_string(&value, "title_hint"))
        {
            titles.push((title, path.clone()));
        }
    }
    (doi, arxiv, titles)
}

fn collect_raw_titles(root: &Path, titles: &mut Vec<(String, String)>) {
    if let Ok(read_dir) = fs::read_dir(root) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path
                .file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| name.starts_with('.') || name.ends_with("_markdown"))
            {
                continue;
            }
            if path.is_dir() {
                collect_raw_titles(&path, titles);
            } else if path.is_file() {
                if let Some(title) = title_hint_from_path(&path) {
                    titles.push((title, to_display(&path)));
                }
            }
        }
    }
}

fn approximate_title_duplicate(title: &str, known_titles: &[(String, String)]) -> Option<String> {
    let normalized = normalize_title(title);
    if normalized.len() < 8 {
        return None;
    }
    let mut best: Option<(f32, String)> = None;
    for (known, path) in known_titles {
        let score = token_overlap(&normalized, known);
        if score >= 0.82
            && best
                .as_ref()
                .is_none_or(|(best_score, _)| score > *best_score)
        {
            best = Some((score, path.clone()));
        }
    }
    best.map(|(_, path)| path)
}

fn import_sources_impl(
    vault: &Path,
    paths: Vec<String>,
    enqueue_after_import: bool,
    preserve_folders: bool,
) -> Result<ImportBatchResult, String> {
    let vault = vault.to_path_buf();
    require_existing_dir(&vault, "vault")?;
    let inbox = vault.join("raw").join("inbox");
    fs::create_dir_all(&inbox).map_err(|e| format!("failed to create inbox: {e}"))?;
    let mut known_hashes = HashMap::new();
    collect_hashes(&vault.join("raw"), &mut known_hashes);
    let (mut doi_index, mut arxiv_index, mut known_titles) = import_report_metadata(&vault);
    collect_raw_titles(&vault.join("raw"), &mut known_titles);
    let (candidates, mut errors) = collect_import_candidates(paths, preserve_folders);
    let mut archive_temp_roots = Vec::new();
    let mut expanded_candidates = Vec::new();
    for candidate in candidates {
        if is_archive_package(&candidate.source) {
            let (mut extracted, mut archive_errors, temp_root) =
                extract_archive_import_candidates(&vault, &candidate);
            expanded_candidates.append(&mut extracted);
            errors.append(&mut archive_errors);
            if let Some(temp_root) = temp_root {
                archive_temp_roots.push(temp_root);
            }
        } else {
            expanded_candidates.push(candidate);
        }
    }
    let mut imported = Vec::new();
    let mut skipped_duplicates = Vec::new();

    for candidate in expanded_candidates {
        let source = candidate.source;
        let source_display = candidate
            .source_display
            .unwrap_or_else(|| to_display(&source));
        let file_name = source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let size_bytes = fs::metadata(&source).map(|meta| meta.len()).unwrap_or(0);
        let hash = match sha256_file(&source) {
            Ok(value) => value,
            Err(error) => {
                errors.push(error);
                continue;
            }
        };
        let (doi, arxiv_id, title_hint) = import_metadata(&source);
        let doi_duplicate = doi
            .as_ref()
            .and_then(|value| doi_index.get(&value.to_ascii_lowercase()))
            .cloned();
        let arxiv_duplicate = arxiv_id
            .as_ref()
            .and_then(|value| arxiv_index.get(&value.to_ascii_lowercase()))
            .cloned();
        let title_duplicate = title_hint
            .as_deref()
            .and_then(|title| approximate_title_duplicate(title, &known_titles));
        let target_dir = candidate
            .folder_context
            .as_ref()
            .filter(|value| !value.is_empty())
            .map(|context| inbox.join(context))
            .unwrap_or_else(|| inbox.clone());
        if let Err(error) = fs::create_dir_all(&target_dir)
            .map_err(|e| format!("failed to create {}: {e}", target_dir.display()))
        {
            errors.push(error);
            continue;
        }
        let dest = unique_dest(&target_dir, OsStr::new(&file_name));
        if let Some(existing) = known_hashes.get(&hash) {
            let preview = ImportPreview {
                source_path: source_display,
                file_name,
                size_bytes,
                mime: detect_mime(&source),
                sha256: hash,
                target_path: Some(to_display(&dest)),
                folder_context: candidate.folder_context,
                duplicate_of: Some(existing.clone()),
                duplicate_reason: Some("sha256".to_string()),
                approximate_duplicate_of: title_duplicate.or(doi_duplicate).or(arxiv_duplicate),
                doi,
                arxiv_id,
                title_hint,
                status: "skipped_duplicate".to_string(),
                enqueued: false,
            };
            skipped_duplicates.push(preview.clone());
            let _ = append_jsonl_value(
                &vault.join("_state").join("import-report.jsonl"),
                &serde_json::to_value(&preview)
                    .map_err(|e| format!("failed to serialize import preview: {e}"))?,
            );
            continue;
        }
        if let Err(error) = fs::copy(&source, &dest)
            .map_err(|e| format!("failed to copy {}: {e}", source.display()))
        {
            errors.push(error);
            continue;
        }
        known_hashes.insert(hash.clone(), to_display(&dest));
        if let Some(value) = &doi {
            doi_index.insert(value.to_ascii_lowercase(), to_display(&dest));
        }
        if let Some(value) = &arxiv_id {
            arxiv_index.insert(value.to_ascii_lowercase(), to_display(&dest));
        }
        if let Some(value) = &title_hint {
            known_titles.push((value.clone(), to_display(&dest)));
        }
        let duplicate_reason = doi_duplicate
            .as_ref()
            .map(|_| "doi")
            .or_else(|| arxiv_duplicate.as_ref().map(|_| "arxiv"))
            .or_else(|| title_duplicate.as_ref().map(|_| "title"));
        let duplicate_of = doi_duplicate.or(arxiv_duplicate);
        let status = if duplicate_reason.is_some() || title_duplicate.is_some() {
            "imported_with_duplicate_warning"
        } else {
            "imported"
        };
        let preview = ImportPreview {
            source_path: source_display,
            file_name,
            size_bytes,
            mime: detect_mime(&source),
            sha256: hash,
            target_path: Some(to_display(&dest)),
            folder_context: candidate.folder_context,
            duplicate_of,
            duplicate_reason: duplicate_reason.map(ToString::to_string),
            approximate_duplicate_of: title_duplicate,
            doi,
            arxiv_id,
            title_hint,
            status: status.to_string(),
            enqueued: enqueue_after_import,
        };
        append_jsonl_value(
            &vault.join("_state").join("import-report.jsonl"),
            &serde_json::to_value(&preview)
                .map_err(|e| format!("failed to serialize import preview: {e}"))?,
        )?;
        imported.push(preview);
    }

    for temp_root in archive_temp_roots {
        let archive_import_root = temp_root.parent().map(Path::to_path_buf);
        let _ = fs::remove_dir_all(temp_root);
        if let Some(archive_import_root) = archive_import_root {
            let _ = fs::remove_dir(&archive_import_root);
        }
    }
    let enqueued_jobs = if enqueue_after_import && !imported.is_empty() {
        plan_ingest(to_display(&vault))?.jobs.len()
    } else {
        0
    };

    Ok(ImportBatchResult {
        imported,
        skipped_duplicates,
        errors,
        enqueued_jobs,
    })
}

fn collect_hashes(root: &Path, hashes: &mut HashMap<String, String>) {
    if let Ok(read_dir) = fs::read_dir(root) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path
                .file_name()
                .and_then(OsStr::to_str)
                .is_some_and(|name| name.starts_with('.') || name.ends_with("_markdown"))
            {
                continue;
            }
            if path.is_dir() {
                collect_hashes(&path, hashes);
            } else if path.is_file() {
                if let Ok(hash) = sha256_file(&path) {
                    hashes.insert(hash, to_display(&path));
                }
            }
        }
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0_u8; 1024 * 64];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn unique_dest(inbox: &Path, file_name: &OsStr) -> PathBuf {
    let candidate = inbox.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("import");
    let ext = Path::new(file_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("");
    for index in 2..1000 {
        let name = if ext.is_empty() {
            format!("{stem}-{index}")
        } else {
            format!("{stem}-{index}.{ext}")
        };
        let next = inbox.join(name);
        if !next.exists() {
            return next;
        }
    }
    inbox.join(format!("{stem}-import"))
}

fn safe_stem(path: &Path) -> String {
    let raw = path.file_stem().and_then(OsStr::to_str).unwrap_or("source");
    let mut out = String::new();
    let mut previous_dash = false;
    for ch in raw.chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            previous_dash = false;
        } else if !previous_dash {
            out.push('-');
            previous_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "source".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_markdown_or_text(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "md" | "markdown" | "txt"
    )
}

fn is_parseable_binary(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "pdf"
    )
}

fn is_archive_package(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "zip"
    )
}

fn collect_raw_ingest_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(OsStr::to_str).unwrap_or_default();
            if name.starts_with('.') || name.ends_with("_markdown") {
                continue;
            }
            if is_symlink_path(&path) {
                continue;
            }
            if path.is_dir() {
                collect_raw_ingest_files(&path, out);
            } else if path.is_file() && !auxiliary_raw_support_file(&path) {
                out.push(path);
            }
        }
    }
}

fn collect_ingest_inputs(vault: &Path) -> Vec<PathBuf> {
    let raw = vault.join("raw");
    let mut files = Vec::new();
    collect_raw_ingest_files(&raw, &mut files);
    files.sort();
    files
}

fn collect_parsed_artifact_dirs(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(OsStr::to_str).unwrap_or_default();
            if name.starts_with('.') {
                continue;
            }
            if is_symlink_path(&path) {
                continue;
            }
            if !path.is_dir() {
                continue;
            }
            if name.ends_with("_markdown") {
                if path.join("combined.md").is_file() {
                    out.push(path);
                }
                continue;
            }
            collect_parsed_artifact_dirs(&path, out);
        }
    }
}

fn artifact_for_source(vault: &Path, source: &Path, hash: &str) -> PathBuf {
    let raw = vault.join("raw");
    if source.parent() != Some(raw.as_path()) {
        if let Some(parent) = source.parent() {
            if let Some(stem) = source.file_stem().and_then(OsStr::to_str) {
                let sibling = parent.join(format!("{stem}_markdown")).join("combined.md");
                if sibling.is_file() {
                    return sibling;
                }
            }
        }
    }
    let mut stem = safe_stem(source);
    if source.parent() != Some(raw.as_path()) {
        let short = hash.get(..8).unwrap_or(hash);
        stem = format!("{stem}-{short}");
    }
    raw.join(format!("{stem}_markdown")).join("combined.md")
}

fn load_cached_ingest_hashes(vault: &Path) -> HashSet<String> {
    let cache = vault.join("_state").join("desktop-ingest-cache.jsonl");
    read_text(&cache)
        .lines()
        .filter_map(|line| serde_json::from_str::<DesktopIngestCacheRow>(line).ok())
        .filter_map(|row| {
            if row.sha256.is_empty() {
                None
            } else {
                Some(row.sha256)
            }
        })
        .collect()
}

fn load_published_ingest_keys(vault: &Path) -> HashSet<(String, String)> {
    let registry = vault.join("_state").join("desktop-ingest-registry.jsonl");
    read_text(&registry)
        .lines()
        .filter_map(|line| serde_json::from_str::<DesktopIngestPublishedRow>(line).ok())
        .filter_map(|row| {
            if row.status == "published"
                && !row.source_sha256.is_empty()
                && !row.artifact_sha256.is_empty()
            {
                Some((row.source_sha256, row.artifact_sha256))
            } else {
                None
            }
        })
        .collect()
}

fn artifact_manifest_source_hash(artifact: &Path) -> Option<String> {
    let manifest = artifact.parent()?.join("manifest.json");
    let value = read_json_value(&manifest)?;
    value
        .get("source_sha256")
        .or_else(|| value.get("sha256"))
        .and_then(serde_json::Value::as_str)
        .filter(|hash| !hash.is_empty())
        .map(ToString::to_string)
}

fn artifact_manifest(artifact: &Path) -> Option<serde_json::Value> {
    read_json_value(&artifact.parent()?.join("manifest.json"))
}

fn manifest_limitations(manifest: &serde_json::Value) -> Vec<String> {
    manifest
        .get("limitations")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn manifest_anchor(manifest: &serde_json::Value, key: &str) -> bool {
    manifest
        .get("anchors")
        .and_then(|anchors| anchors.get(key))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn token_count(text: &str) -> usize {
    text.split_whitespace().count()
}

fn chunk_rows(
    vault: &Path,
    source_sha256: &str,
    source_id: Option<&str>,
    artifact: &Path,
    content: &str,
) -> Vec<ChunkRow> {
    let source_uuid = source_uuid(source_sha256);
    let artifact_path = rel_path(vault, artifact);
    let mut chunks = Vec::new();
    let mut heading_path: Vec<String> = Vec::new();
    let mut buffer = String::new();
    let mut line_start = 1usize;
    let mut char_start = 0usize;
    let mut current_char = 0usize;
    let mut current_heading = heading_path.clone();

    let flush = |chunks: &mut Vec<ChunkRow>,
                 buffer: &mut String,
                 line_start: usize,
                 line_end: usize,
                 char_start: usize,
                 char_end: usize,
                 heading_path: Vec<String>| {
        let text = buffer.trim_end();
        if text.is_empty() {
            buffer.clear();
            return;
        }
        let text_hash = sha256_text(text);
        let idx = chunks.len() + 1;
        chunks.push(ChunkRow {
            chunk_id: format!("{source_uuid}:{idx:05}"),
            source_uuid: source_uuid.clone(),
            source_id: source_id.map(ToString::to_string),
            artifact_path: artifact_path.clone(),
            heading_path,
            line_start,
            line_end,
            char_start,
            char_end,
            kind: if text.contains('|') {
                "table_or_text".to_string()
            } else {
                "paragraph".to_string()
            },
            text_hash,
            token_count: token_count(text),
        });
        buffer.clear();
    };

    for (index, line) in content.lines().enumerate() {
        let line_no = index + 1;
        let line_with_newline = format!("{line}\n");
        let is_heading = line.starts_with('#');
        if is_heading && !buffer.trim().is_empty() {
            flush(
                &mut chunks,
                &mut buffer,
                line_start,
                line_no.saturating_sub(1),
                char_start,
                current_char,
                current_heading.clone(),
            );
            line_start = line_no;
            char_start = current_char;
        }
        if let Some((marks, title)) = line.split_once(' ') {
            if marks.chars().all(|ch| ch == '#') {
                let level = marks.len().clamp(1, 6);
                heading_path.truncate(level.saturating_sub(1));
                heading_path.push(title.trim().to_string());
            }
        }
        if buffer.is_empty() {
            line_start = line_no;
            char_start = current_char;
            current_heading = heading_path.clone();
        }
        buffer.push_str(&line_with_newline);
        current_char += line_with_newline.len();
        if buffer.lines().count() >= 80 || token_count(&buffer) >= 420 {
            flush(
                &mut chunks,
                &mut buffer,
                line_start,
                line_no,
                char_start,
                current_char,
                current_heading.clone(),
            );
        }
    }

    if !buffer.trim().is_empty() {
        let last_line = content.lines().count().max(line_start);
        flush(
            &mut chunks,
            &mut buffer,
            line_start,
            last_line,
            char_start,
            current_char,
            current_heading,
        );
    }
    chunks
}

fn write_text_artifact_contract(
    vault: &Path,
    source: &Path,
    artifact: &Path,
    source_sha256: &str,
    source_id: Option<&str>,
    content: &str,
) -> Result<(), String> {
    write_text(artifact, content)?;
    let artifact_sha256 = sha256_file(artifact)?;
    let parent = artifact
        .parent()
        .ok_or_else(|| "artifact has no parent directory".to_string())?;
    let chunks = chunk_rows(vault, source_sha256, source_id, artifact, content);
    write_jsonl(&parent.join("chunks.jsonl"), &chunks)?;
    let manifest = serde_json::json!({
        "schema_version": 1,
        "source_uuid": source_uuid(source_sha256),
        "source_id": source_id,
        "source_path": rel_path(vault, source),
        "source_sha256": source_sha256,
        "artifact_sha256": artifact_sha256,
        "combined": rel_path(vault, artifact),
        "chunks": rel_path(vault, &parent.join("chunks.jsonl")),
        "parser": "llm-wiki-desktop-text-stager",
        "parser_version": env!("CARGO_PKG_VERSION"),
        "created_at": Local::now().to_rfc3339(),
        "staged_at": Local::now().to_rfc3339(),
        "mime": detect_mime(source),
        "chunk_count": chunks.len(),
        "anchors": {
            "pages": false,
            "lines": true,
            "tables": false,
            "figures": false,
            "equations": false
        },
        "limitations": [
            "desktop text staging preserves line anchors only",
            "page, table, figure, and equation anchors require a runtime parser"
        ]
    });
    write_text(
        &parent.join("manifest.json"),
        &(serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("failed to serialize manifest: {e}"))?
            + "\n"),
    )
}

fn parser_hint_for_source(source: &Path, artifact: &Path) -> String {
    format!(
        "pdf_to_markdown.py \"{}\" --output \"{}\" --parser auto --no-download-images",
        source.display(),
        artifact
            .parent()
            .map(to_display)
            .unwrap_or_else(|| to_display(artifact))
    )
}

fn plan_current_state(status: &str, action: &str) -> String {
    match (status, action) {
        ("published", _) => "published",
        (_, "restage_text_artifact") => "stale_artifact",
        ("blocked", "parse_required") => "parse_required",
        ("blocked", "extract_archive_required") => "archive_extract_required",
        ("blocked", _) => "blocked_contract",
        ("cached", _) => "staged",
        ("ready", _) => "ingest_ready",
        ("stageable", "stage_text_artifact") => "imported",
        ("stageable", _) => "staged",
        _ => status,
    }
    .to_string()
}

fn plan_next_action_label(status: &str, action: &str) -> String {
    match (status, action) {
        ("published", _) => "No action; source and artifact are already published",
        (_, "restage_text_artifact") => {
            "Restage the local text artifact, then run the ingest pipeline"
        }
        ("blocked", "parse_required") => "Parse this source locally before ingest",
        ("blocked", "extract_archive_required") => {
            "Extract this archive into raw/inbox, then re-run ingest planning"
        }
        ("blocked", _) => "Inspect the blocked source contract before ingest",
        ("cached", "skip_staging") => "Run the ingest pipeline with the cached artifact",
        ("ready", "run_ingest_corpus") => "Run the ingest pipeline",
        ("stageable", "stage_text_artifact") => "Stage this text or Markdown source locally",
        _ => action,
    }
    .to_string()
}

fn plan_command_for_action(action: &str, parser_hint: Option<&str>) -> Vec<String> {
    match action {
        "parse_required" => parser_hint
            .map(|hint| vec![hint.to_string()])
            .unwrap_or_else(|| vec!["desktop:parse_pdfs".to_string()]),
        "extract_archive_required" => vec!["manual:extract_archive_into_raw_inbox".to_string()],
        "stage_text_artifact" | "restage_text_artifact" | "run_ingest_corpus" | "skip_staging" => {
            vec!["desktop:run_ingest_pipeline".to_string()]
        }
        _ => Vec::new(),
    }
}

fn plan_outputs_for_action(vault: &Path, artifact: &Path, action: &str) -> Vec<String> {
    let mut outputs = Vec::new();
    if matches!(
        action,
        "parse_required"
            | "stage_text_artifact"
            | "restage_text_artifact"
            | "run_ingest_corpus"
            | "skip_staging"
            | "skip_runtime"
    ) {
        outputs.push(rel_path(vault, artifact));
    }
    if let Some(parent) = artifact.parent() {
        if matches!(
            action,
            "parse_required" | "stage_text_artifact" | "restage_text_artifact"
        ) {
            outputs.push(rel_path(vault, &parent.join("manifest.json")));
            outputs.push(rel_path(vault, &parent.join("chunks.jsonl")));
        }
        if action == "parse_required" {
            outputs.push(rel_path(vault, &parent.join("parse.log")));
        }
    }
    if matches!(action, "run_ingest_corpus" | "skip_staging") {
        outputs.push("_state/source-registry.jsonl".to_string());
        outputs.push("claims/claims.jsonl".to_string());
        outputs.push("reviews/science-review-queue.md".to_string());
    }
    if action == "skip_runtime" {
        outputs.push("_state/published-ingest.jsonl".to_string());
    }
    outputs.sort();
    outputs.dedup();
    outputs
}

fn plan_uses_network(parser_hint: Option<&str>) -> bool {
    parser_hint.is_some_and(|hint| {
        hint.contains("layout-api")
            || hint.contains("http://")
            || hint.contains("https://")
            || hint.contains("--download-images")
    })
}

fn plan_state_can_be_overridden(state: &str) -> bool {
    !matches!(
        state,
        "parse_required" | "stale_artifact" | "blocked_contract" | "published"
    )
}

fn plan_entry_is_review_gated(entry: &IngestPlanEntry) -> bool {
    entry.requires_human_approval
        || matches!(
            entry.current_state.as_str(),
            "duplicate" | "needs_review" | "blocked_contract"
        )
}

fn plan_entry_is_pipeline_runnable(entry: &IngestPlanEntry) -> bool {
    if plan_entry_is_review_gated(entry) {
        return false;
    }
    matches!(entry.status.as_str(), "ready" | "stageable" | "cached")
        || (entry.action == "parse_required"
            && is_parseable_binary(&PathBuf::from(&entry.source_path)))
}

fn plan_entry_is_runtime_ready(entry: &IngestPlanEntry) -> bool {
    !plan_entry_is_review_gated(entry) && matches!(entry.status.as_str(), "ready" | "cached")
}

fn enrich_ingest_plan_entries(
    vault: &Path,
    entries: &mut [IngestPlanEntry],
    registry: &[DesktopRegistryEntry],
    jobs: &[DesktopIngestJob],
) {
    let duplicate_paths = registry
        .iter()
        .filter(|entry| entry.duplicate_of.is_some())
        .map(|entry| entry.source_path.clone())
        .collect::<HashSet<_>>();
    let review_claims = claim_ledger_items(vault)
        .into_iter()
        .filter(|claim| {
            claim.needs_review
                || matches!(
                    claim.status.as_str(),
                    "needs_review" | "pending_review" | "review_required"
                )
                || matches!(
                    claim.verdict.as_str(),
                    "needs_review" | "pending_review" | "review_required"
                )
        })
        .collect::<Vec<_>>();

    for entry in entries {
        let source_rel = rel_path(vault, &PathBuf::from(&entry.source_path));
        let source_uuid = source_uuid(&entry.sha256);

        if let Some(job) = jobs
            .iter()
            .find(|job| job.source_uuid == source_uuid || job.source_path == source_rel)
        {
            entry.last_log_path = job.log_path.clone();
            if matches!(job.status.as_str(), "failed" | "cancelled") {
                entry.current_state = "blocked_contract".to_string();
                entry.next_action_label =
                    "Inspect the last ingest job log before rerunning".to_string();
                if let Some(error) = &job.last_error {
                    entry.reason = error.clone();
                }
            }
        }

        if duplicate_paths.contains(&source_rel)
            && plan_state_can_be_overridden(&entry.current_state)
        {
            entry.current_state = "duplicate".to_string();
            entry.next_action_label =
                "Review duplicate source identity before trusting downstream synthesis".to_string();
            entry.requires_human_approval = true;
        }

        let has_review_claim = review_claims.iter().any(|claim| {
            claim.source_uuid.as_deref() == Some(source_uuid.as_str())
                || claim.source_path.as_deref() == Some(source_rel.as_str())
                || claim.source_path.as_deref() == Some(entry.source_path.as_str())
        });
        if has_review_claim && plan_state_can_be_overridden(&entry.current_state) {
            entry.current_state = "needs_review".to_string();
            entry.next_action_label =
                "Review extracted claims before trusting this source in concepts".to_string();
            entry.requires_human_approval = true;
        }
    }
}

fn acquire_ingest_lock(vault: &Path) -> Result<IngestPipelineLock, String> {
    let lock_path = vault.join("_state").join("desktop-ingest.lock");
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|e| {
            format!(
                "ingest pipeline is already running or lock file is stale at {}: {e}",
                lock_path.display()
            )
        })?;
    writeln!(file, "pid: {}", std::process::id())
        .map_err(|e| format!("failed to write {}: {e}", lock_path.display()))?;
    writeln!(file, "started_at: {}", Local::now().to_rfc3339())
        .map_err(|e| format!("failed to write {}: {e}", lock_path.display()))?;
    Ok(IngestPipelineLock { path: lock_path })
}

fn plan_entry_for_source(
    vault: &Path,
    source: &Path,
    cached_hashes: &HashSet<String>,
    published_keys: &HashSet<(String, String)>,
) -> Result<IngestPlanEntry, String> {
    let hash = sha256_file(source)?;
    let artifact = artifact_for_source(vault, source, &hash);
    let artifact_exists = artifact.is_file();
    let artifact_hash = if artifact_exists {
        Some(sha256_file(&artifact)?)
    } else {
        None
    };
    let text_source = is_markdown_or_text(source);
    let artifact_matches_source = artifact_hash.as_deref() == Some(hash.as_str());
    let manifest_source_hash = if artifact_exists {
        artifact_manifest_source_hash(&artifact)
    } else {
        None
    };
    let parsed_artifact_stale = !text_source
        && manifest_source_hash
            .as_ref()
            .is_some_and(|manifest_hash| manifest_hash != &hash);
    let cached = cached_hashes.contains(&hash);
    let published = artifact_hash.as_ref().is_some_and(|artifact_hash| {
        published_keys.contains(&(hash.clone(), artifact_hash.clone()))
    });
    let file_name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let archive_package = is_archive_package(source);
    let artifact_path = if archive_package {
        None
    } else {
        Some(to_display(&artifact))
    };

    let (status, action, reason, parser_hint) = if published {
        (
            "published".to_string(),
            "skip_runtime".to_string(),
            "this source/artifact pair already completed a desktop ingest pipeline".to_string(),
            None,
        )
    } else if text_source && artifact_exists && !artifact_matches_source {
        (
            "stageable".to_string(),
            "restage_text_artifact".to_string(),
            "source text changed since combined.md was staged; regenerate the artifact before runtime ingest".to_string(),
            None,
        )
    } else if parsed_artifact_stale {
        (
            "blocked".to_string(),
            "parse_required".to_string(),
            "source hash differs from the parsed artifact manifest; regenerate combined.md before runtime ingest".to_string(),
            if is_parseable_binary(source) {
                Some(parser_hint_for_source(source, &artifact))
            } else {
                None
            },
        )
    } else if text_source && cached && artifact_exists && artifact_matches_source {
        (
            "cached".to_string(),
            "skip_staging".to_string(),
            "source hash has already been staged; runtime ingest can reuse the artifact"
                .to_string(),
            None,
        )
    } else if artifact_exists {
        (
            "ready".to_string(),
            "run_ingest_corpus".to_string(),
            "parsed Markdown artifact already exists".to_string(),
            None,
        )
    } else if text_source {
        (
            "stageable".to_string(),
            "stage_text_artifact".to_string(),
            "plain text or Markdown can be staged locally as combined.md".to_string(),
            None,
        )
    } else if is_parseable_binary(source) {
        let hint = parser_hint_for_source(source, &artifact);
        (
            "blocked".to_string(),
            "parse_required".to_string(),
            "PDF requires a parser before corpus ingest can run".to_string(),
            Some(hint),
        )
    } else if archive_package {
        (
            "blocked".to_string(),
            "extract_archive_required".to_string(),
            "Archive corpus packages must be extracted under raw/inbox before individual sources can be parsed and ingested".to_string(),
            None,
        )
    } else {
        (
            "blocked".to_string(),
            "unsupported_extension".to_string(),
            "desktop staging currently supports txt, md, markdown, and existing parsed artifacts"
                .to_string(),
            None,
        )
    };

    let current_state = if parsed_artifact_stale {
        "stale_artifact".to_string()
    } else {
        plan_current_state(&status, &action)
    };
    let next_action_label = if parsed_artifact_stale {
        "Re-parse this source locally before ingest".to_string()
    } else {
        plan_next_action_label(&status, &action)
    };
    let command = plan_command_for_action(&action, parser_hint.as_deref());
    let inputs = vec![rel_path(vault, source)];
    let outputs = plan_outputs_for_action(vault, &artifact, &action);
    let uses_network = plan_uses_network(parser_hint.as_deref());

    Ok(IngestPlanEntry {
        source_path: to_display(source),
        file_name,
        sha256: hash,
        artifact_sha256: artifact_hash,
        artifact_path,
        status,
        action,
        reason,
        parser_hint,
        current_state,
        next_action_label,
        command,
        inputs,
        outputs,
        last_log_path: None,
        requires_human_approval: false,
        uses_network,
    })
}

fn append_cache_row(
    vault: &Path,
    source: &Path,
    sha256: &str,
    artifact: &Path,
) -> Result<(), String> {
    let cache = vault.join("_state").join("desktop-ingest-cache.jsonl");
    let existing = read_text(&cache);
    let artifact_sha256 = sha256_file(artifact)?;
    let row = serde_json::json!({
        "source_path": source.strip_prefix(vault).unwrap_or(source).to_string_lossy(),
        "sha256": sha256,
        "artifact_path": artifact.strip_prefix(vault).unwrap_or(artifact).to_string_lossy(),
        "artifact_sha256": artifact_sha256,
        "staged_at": Local::now().to_rfc3339(),
        "status": "staged",
    });
    write_text(
        &cache,
        &format!(
            "{}{}\n",
            existing,
            serde_json::to_string(&row)
                .map_err(|e| format!("failed to serialize cache row: {e}"))?
        ),
    )
}

fn artifact_summary_for_entry(
    vault: &Path,
    entry: &IngestPlanEntry,
    source_id: Option<&str>,
) -> Option<ArtifactContractSummary> {
    let artifact_path = entry.artifact_path.as_ref()?;
    let artifact = PathBuf::from(artifact_path);
    if !artifact.is_file() {
        return None;
    }
    let parent = artifact.parent()?;
    let manifest_path = parent.join("manifest.json");
    let chunks_path = parent.join("chunks.jsonl");
    let tables_path = parent.join("tables.jsonl");
    let figures_path = parent.join("figures.jsonl");
    let parse_log_path = parent.join("parse.log");
    let manifest = read_json_value(&manifest_path);
    let artifact_sha256 = sha256_file(&artifact).ok();
    let manifest_source_sha = manifest.as_ref().and_then(|value| {
        json_string(value, "source_sha256").or_else(|| json_string(value, "sha256"))
    });
    let status = if manifest.is_none() {
        "legacy"
    } else if manifest_source_sha
        .as_ref()
        .is_some_and(|manifest_hash| manifest_hash != &entry.sha256)
    {
        "stale"
    } else {
        "fresh"
    }
    .to_string();

    Some(ArtifactContractSummary {
        source_path: rel_path(vault, &PathBuf::from(&entry.source_path)),
        source_id: source_id.map(ToString::to_string),
        source_uuid: source_uuid(&entry.sha256),
        artifact_path: rel_path(vault, &artifact),
        manifest_path: manifest_path
            .is_file()
            .then(|| rel_path(vault, &manifest_path)),
        chunks_path: chunks_path.is_file().then(|| rel_path(vault, &chunks_path)),
        tables_path: tables_path.is_file().then(|| rel_path(vault, &tables_path)),
        figures_path: figures_path
            .is_file()
            .then(|| rel_path(vault, &figures_path)),
        parse_log_path: parse_log_path
            .is_file()
            .then(|| rel_path(vault, &parse_log_path)),
        parser: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser")),
        parser_version: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser_version")),
        schema_version: manifest
            .as_ref()
            .and_then(|value| json_string(value, "schema_version"))
            .or_else(|| {
                manifest
                    .as_ref()
                    .and_then(|value| json_usize(value, "schema_version"))
                    .map(|version| version.to_string())
            }),
        source_sha256: manifest_source_sha,
        artifact_sha256,
        status,
        contract_valid: manifest.is_some()
            && chunks_path.is_file()
            && manifest
                .as_ref()
                .and_then(|value| json_string(value, "artifact_sha256"))
                .is_some_and(|hash| sha256_file(&artifact).ok().as_deref() == Some(hash.as_str())),
        chunk_count: count_jsonl(&chunks_path),
        anchors_lines: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "lines")),
        anchors_pages: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "pages")),
        anchors_tables: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "tables")),
        anchors_figures: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "figures")),
        anchors_equations: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "equations")),
        limitations: manifest
            .as_ref()
            .map(manifest_limitations)
            .unwrap_or_else(|| {
                vec!["manifest.json is missing; artifact is treated as legacy".to_string()]
            }),
        lint_errors: Vec::new(),
    })
}

fn registry_entry_for_plan_entry(vault: &Path, entry: &IngestPlanEntry) -> DesktopRegistryEntry {
    let artifact = entry.artifact_path.as_ref().map(PathBuf::from);
    let manifest = artifact.as_ref().and_then(|path| artifact_manifest(path));
    let artifact_sha256 = artifact
        .as_ref()
        .filter(|path| path.is_file())
        .and_then(|path| sha256_file(path).ok());
    let source_rel = rel_path(vault, &PathBuf::from(&entry.source_path));
    let source_id = source_id_for_source(vault, &entry.sha256, &source_rel);
    DesktopRegistryEntry {
        source_uuid: source_uuid(&entry.sha256),
        source_id: source_id.clone(),
        duplicate_of: None,
        raw_path: source_rel.clone(),
        canonical_path: source_rel.clone(),
        source_path: source_rel,
        source_sha256: entry.sha256.clone(),
        mime: detect_mime(&PathBuf::from(&entry.source_path)),
        artifact_path: artifact.as_ref().map(|path| rel_path(vault, path)),
        artifact_sha256,
        parser: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser")),
        parser_version: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser_version")),
        status: entry.status.clone(),
        source_page: source_id.as_deref().map(source_page_for_id),
        last_error: (entry.status == "blocked").then(|| entry.reason.clone()),
        created_at: None,
        updated_at: Some(Local::now().to_rfc3339()),
        published_at: None,
    }
}

fn annotate_duplicate_registry_entries(registry: &mut [DesktopRegistryEntry]) {
    let mut first_id_by_hash: HashMap<String, String> = HashMap::new();
    for entry in registry {
        if let Some(first_id) = first_id_by_hash.get(&entry.source_sha256) {
            entry.duplicate_of = Some(first_id.clone());
        } else {
            if let Some(source_id) = &entry.source_id {
                first_id_by_hash.insert(entry.source_sha256.clone(), source_id.clone());
            }
        }
    }
}

fn assign_stable_source_ids(
    vault: &Path,
    registry: &mut [DesktopRegistryEntry],
) -> Result<(), String> {
    let rows = registry_rows(vault);
    let mut id_by_hash = existing_source_ids(vault);
    let mut next = next_source_id_number(vault, &rows);
    let now = Local::now().to_rfc3339();

    for entry in registry.iter_mut() {
        let existing = id_by_hash
            .get(&entry.source_uuid)
            .cloned()
            .or_else(|| id_by_hash.get(&entry.source_sha256).cloned())
            .or_else(|| id_by_hash.get(&entry.source_path).cloned())
            .or_else(|| id_by_hash.get(&entry.raw_path).cloned())
            .or_else(|| id_by_hash.get(&entry.canonical_path).cloned());
        let source_id = if let Some(existing) = existing {
            existing
        } else {
            let allocated = format_source_id(next);
            next += 1;
            id_by_hash.insert(entry.source_uuid.clone(), allocated.clone());
            id_by_hash.insert(entry.source_sha256.clone(), allocated.clone());
            id_by_hash.insert(entry.source_path.clone(), allocated.clone());
            id_by_hash.insert(entry.raw_path.clone(), allocated.clone());
            id_by_hash.insert(entry.canonical_path.clone(), allocated.clone());
            allocated
        };
        id_by_hash.insert(entry.source_uuid.clone(), source_id.clone());
        id_by_hash.insert(entry.source_sha256.clone(), source_id.clone());
        id_by_hash.insert(entry.source_path.clone(), source_id.clone());
        id_by_hash.insert(entry.raw_path.clone(), source_id.clone());
        id_by_hash.insert(entry.canonical_path.clone(), source_id.clone());
        entry.source_id = Some(source_id.clone());
        entry.source_page = Some(source_page_for_id(&source_id));
        if entry.created_at.is_none() {
            entry.created_at = Some(now.clone());
        }
        entry.updated_at = Some(now.clone());
    }
    annotate_duplicate_registry_entries(registry);
    write_next_source_id(vault, next)
}

fn registry_row_source_uuid(value: &serde_json::Value) -> Option<String> {
    json_string(value, "source_uuid")
        .or_else(|| json_string(value, "sourceUuid"))
        .or_else(|| json_string(value, "source_sha256").map(|hash| source_uuid(&hash)))
        .or_else(|| json_string(value, "sourceSha256").map(|hash| source_uuid(&hash)))
}

fn registry_row_source_id(value: &serde_json::Value) -> Option<String> {
    json_string(value, "source_id").or_else(|| json_string(value, "sourceId"))
}

fn registry_row_source_hash(value: &serde_json::Value) -> Option<String> {
    json_string(value, "source_sha256")
        .or_else(|| json_string(value, "sourceSha256"))
        .or_else(|| json_string(value, "sha256"))
}

fn registry_row_paths(value: &serde_json::Value) -> Vec<String> {
    [
        "source_path",
        "sourcePath",
        "raw_path",
        "rawPath",
        "canonical_path",
        "canonicalPath",
        "source_page",
        "sourcePage",
    ]
    .iter()
    .filter_map(|key| json_string(value, key))
    .collect()
}

fn same_vault_path(vault: &Path, left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }
    rel_path(vault, &PathBuf::from(left)) == rel_path(vault, &PathBuf::from(right))
}

fn registry_row_matches_path(vault: &Path, value: &serde_json::Value, path: &str) -> bool {
    registry_row_paths(value)
        .iter()
        .any(|candidate| same_vault_path(vault, candidate, path))
}

fn preferred_registry_row_path(value: &serde_json::Value) -> Option<String> {
    json_string(value, "source_path")
        .or_else(|| json_string(value, "sourcePath"))
        .or_else(|| json_string(value, "raw_path"))
        .or_else(|| json_string(value, "rawPath"))
        .or_else(|| json_string(value, "canonical_path"))
        .or_else(|| json_string(value, "canonicalPath"))
}

fn registry_row_source_hash_or_uuid(value: &serde_json::Value) -> Option<String> {
    registry_row_source_hash(value).or_else(|| {
        registry_row_source_uuid(value).map(|uuid| {
            uuid.strip_prefix("sha256:")
                .unwrap_or(uuid.as_str())
                .to_string()
        })
    })
}

fn registry_row_path_inside_vault(vault: &Path, value: &serde_json::Value) -> Option<PathBuf> {
    let raw_path = preferred_registry_row_path(value)?;
    let path = PathBuf::from(&raw_path);
    let candidate = if path.is_absolute() {
        path
    } else {
        vault.join(path)
    };
    ensure_inside(
        &candidate,
        vault,
        "registry source path must stay inside the vault",
    )
    .ok()
}

fn append_missing_runtime_registry_entries(vault: &Path, registry: &mut Vec<DesktopRegistryEntry>) {
    let mut current_keys = HashSet::new();
    for entry in registry.iter() {
        current_keys.insert(entry.source_uuid.clone());
        current_keys.insert(entry.source_sha256.clone());
        current_keys.insert(entry.source_path.clone());
        current_keys.insert(entry.raw_path.clone());
        current_keys.insert(entry.canonical_path.clone());
    }
    let now = Local::now().to_rfc3339();
    for row in registry_rows(vault) {
        let Some(source_path) = registry_row_path_inside_vault(vault, &row) else {
            continue;
        };
        if source_path.is_file() {
            continue;
        }
        let Some(source_sha256) = registry_row_source_hash_or_uuid(&row) else {
            continue;
        };
        let source_uuid =
            registry_row_source_uuid(&row).unwrap_or_else(|| source_uuid(&source_sha256));
        let source_rel = rel_path(vault, &source_path);
        if current_keys.contains(&source_uuid)
            || current_keys.contains(&source_sha256)
            || current_keys.contains(&source_rel)
        {
            continue;
        }
        current_keys.insert(source_uuid.clone());
        current_keys.insert(source_sha256.clone());
        current_keys.insert(source_rel.clone());
        registry.push(DesktopRegistryEntry {
            source_uuid,
            source_id: registry_row_source_id(&row),
            duplicate_of: None,
            raw_path: source_rel.clone(),
            canonical_path: source_rel.clone(),
            source_path: source_rel,
            source_sha256,
            mime: detect_mime(&source_path),
            artifact_path: json_string(&row, "artifact_path")
                .or_else(|| json_string(&row, "artifactPath")),
            artifact_sha256: json_string(&row, "artifact_sha256")
                .or_else(|| json_string(&row, "artifactSha256")),
            parser: json_string(&row, "parser"),
            parser_version: json_string(&row, "parser_version")
                .or_else(|| json_string(&row, "parserVersion")),
            status: "missing_raw_source".to_string(),
            source_page: json_string(&row, "source_page").or_else(|| json_string(&row, "sourcePage")),
            last_error: Some(
                "raw source is missing; manual plan creates an impact warning and does not delete source or concept pages"
                    .to_string(),
            ),
            created_at: json_string(&row, "created_at").or_else(|| json_string(&row, "createdAt")),
            updated_at: Some(now.clone()),
            published_at: json_string(&row, "published_at")
                .or_else(|| json_string(&row, "publishedAt")),
        });
    }
}

fn source_alias_id(old_path: Option<&str>, new_path: &str, reason: &str) -> String {
    format!(
        "alias-{}",
        short_hash(&sha256_text(&format!(
            "{}:{new_path}:{reason}",
            old_path.unwrap_or("unknown")
        )))
    )
}

fn source_alias_row(
    old_source_uuid: Option<String>,
    new_source_uuid: String,
    source_id: Option<String>,
    old_source_path: Option<String>,
    new_source_path: String,
    match_reason: String,
    signals: Vec<String>,
    needs_review: bool,
) -> SourceIdAlias {
    SourceIdAlias {
        alias_id: source_alias_id(old_source_path.as_deref(), &new_source_path, &match_reason),
        old_source_uuid,
        new_source_uuid,
        source_id,
        old_source_path,
        new_source_path,
        match_reason,
        signals,
        created_at: Local::now().to_rfc3339(),
        status: if needs_review {
            "possible_new_version".to_string()
        } else {
            "confirmed".to_string()
        },
        needs_review,
    }
}

fn push_unique_source_alias(
    aliases: &mut Vec<SourceIdAlias>,
    seen: &mut HashSet<String>,
    alias: SourceIdAlias,
) {
    if seen.insert(alias.alias_id.clone()) {
        aliases.push(alias);
    }
}

fn source_id_aliases_for_registry(
    vault: &Path,
    registry: &[DesktopRegistryEntry],
) -> Vec<SourceIdAlias> {
    let existing_rows = registry_rows(vault);
    let mut aliases = Vec::new();
    let mut seen = HashSet::new();

    for entry in registry {
        for row in &existing_rows {
            if registry_row_source_hash(row).as_deref() != Some(entry.source_sha256.as_str()) {
                continue;
            }
            let Some(old_path) = preferred_registry_row_path(row) else {
                continue;
            };
            if same_vault_path(vault, &old_path, &entry.source_path) {
                continue;
            }
            push_unique_source_alias(
                &mut aliases,
                &mut seen,
                source_alias_row(
                    registry_row_source_uuid(row),
                    entry.source_uuid.clone(),
                    entry
                        .source_id
                        .clone()
                        .or_else(|| registry_row_source_id(row)),
                    Some(rel_path(vault, &PathBuf::from(&old_path))),
                    entry.source_path.clone(),
                    "renamed_or_moved_same_sha256".to_string(),
                    vec![
                        format!("sha256:{}", entry.source_sha256),
                        format!("old_path:{}", rel_path(vault, &PathBuf::from(&old_path))),
                        format!("new_path:{}", entry.source_path),
                    ],
                    false,
                ),
            );
        }
    }

    for line in read_text(&vault.join("_state").join("import-report.jsonl")).lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(target_path) =
            json_string(&value, "targetPath").or_else(|| json_string(&value, "target_path"))
        else {
            continue;
        };
        let duplicate_reason = json_string(&value, "duplicateReason")
            .or_else(|| json_string(&value, "duplicate_reason"))
            .unwrap_or_default();
        if duplicate_reason == "sha256" {
            continue;
        }
        let Some(new_entry) = registry
            .iter()
            .find(|entry| same_vault_path(vault, &entry.source_path, &target_path))
        else {
            continue;
        };
        let old_path = json_string(&value, "duplicateOf")
            .or_else(|| json_string(&value, "duplicate_of"))
            .or_else(|| json_string(&value, "approximateDuplicateOf"))
            .or_else(|| json_string(&value, "approximate_duplicate_of"));
        let Some(old_path_value) = old_path.clone() else {
            continue;
        };
        let old_row = existing_rows
            .iter()
            .find(|row| registry_row_matches_path(vault, row, &old_path_value));
        let reason = match duplicate_reason.as_str() {
            "doi" => "same_doi_different_sha256",
            "arxiv" => "same_arxiv_different_sha256",
            "title" => "similar_title_different_sha256",
            _ => "possible_source_alias",
        };
        let mut signals = vec![
            format!("new_sha256:{}", new_entry.source_sha256),
            format!(
                "old_path:{}",
                rel_path(vault, &PathBuf::from(&old_path_value))
            ),
            format!("new_path:{}", new_entry.source_path),
        ];
        if let Some(doi) = json_string(&value, "doi") {
            signals.push(format!("doi:{doi}"));
        }
        if let Some(arxiv) =
            json_string(&value, "arxivId").or_else(|| json_string(&value, "arxiv_id"))
        {
            signals.push(format!("arxiv:{arxiv}"));
        }
        if let Some(title) =
            json_string(&value, "titleHint").or_else(|| json_string(&value, "title_hint"))
        {
            signals.push(format!("title:{title}"));
        }
        push_unique_source_alias(
            &mut aliases,
            &mut seen,
            source_alias_row(
                old_row.and_then(registry_row_source_uuid),
                new_entry.source_uuid.clone(),
                new_entry
                    .source_id
                    .clone()
                    .or_else(|| old_row.and_then(registry_row_source_id)),
                Some(rel_path(vault, &PathBuf::from(&old_path_value))),
                new_entry.source_path.clone(),
                reason.to_string(),
                signals,
                true,
            ),
        );
    }

    aliases.sort_by(|a, b| {
        a.needs_review
            .cmp(&b.needs_review)
            .reverse()
            .then_with(|| a.new_source_path.cmp(&b.new_source_path))
            .then_with(|| a.match_reason.cmp(&b.match_reason))
    });
    aliases
}

fn load_source_id_aliases(vault: &Path) -> Vec<SourceIdAlias> {
    read_text(&vault.join("_state").join("source-id-aliases.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<SourceIdAlias>(line).ok())
        .collect()
}

fn merge_source_id_aliases(vault: &Path, generated: Vec<SourceIdAlias>) -> Vec<SourceIdAlias> {
    let mut by_id = HashMap::new();
    for alias in load_source_id_aliases(vault) {
        by_id.insert(alias.alias_id.clone(), alias);
    }
    for alias in generated {
        by_id.entry(alias.alias_id.clone()).or_insert(alias);
    }
    let mut aliases = by_id.into_values().collect::<Vec<_>>();
    aliases.sort_by(|a, b| {
        a.needs_review
            .cmp(&b.needs_review)
            .reverse()
            .then_with(|| a.new_source_path.cmp(&b.new_source_path))
            .then_with(|| a.match_reason.cmp(&b.match_reason))
    });
    aliases
}

fn write_source_id_aliases(vault: &Path, aliases: &[SourceIdAlias]) -> Result<(), String> {
    write_jsonl(
        &vault.join("_state").join("source-id-aliases.jsonl"),
        aliases,
    )?;
    write_jsonl(
        &vault.join("_state").join("desktop-source-id-aliases.jsonl"),
        aliases,
    )
}

fn registry_key(value: &serde_json::Value) -> Option<String> {
    json_string(value, "source_uuid")
        .or_else(|| json_string(value, "sourceUuid"))
        .or_else(|| json_string(value, "source_sha256"))
        .or_else(|| json_string(value, "sourceSha256"))
        .or_else(|| json_string(value, "source_path"))
        .or_else(|| json_string(value, "raw_path"))
        .or_else(|| json_string(value, "canonical_path"))
}

fn set_json_if_missing(
    map: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: impl Into<serde_json::Value>,
) {
    if !map.contains_key(key) || map.get(key).is_some_and(serde_json::Value::is_null) {
        map.insert(key.to_string(), value.into());
    }
}

fn is_valid_runtime_source_status(status: &str) -> bool {
    matches!(
        status,
        "candidate"
            | "queued"
            | "parsed"
            | "chunked"
            | "drafted"
            | "qa_passed"
            | "published"
            | "stale"
            | "failed"
            | "archived"
    )
}

fn runtime_source_status_for_desktop_entry(
    vault: &Path,
    entry: &DesktopRegistryEntry,
    current_status: Option<&str>,
) -> String {
    let source_page_exists = entry
        .source_page
        .as_ref()
        .is_some_and(|path| vault.join(path).is_file());
    if entry.status == "published" || source_page_exists {
        return "published".to_string();
    }
    if let Some(status) = current_status.filter(|status| is_valid_runtime_source_status(status)) {
        return status.to_string();
    }
    match entry.status.as_str() {
        "ready" | "cached" => "parsed",
        "blocked" if entry.last_error.is_some() => "failed",
        "published" => "published",
        _ => "candidate",
    }
    .to_string()
}

fn runtime_source_status_for_legacy_row(
    vault: &Path,
    map: &serde_json::Map<String, serde_json::Value>,
    current_status: &str,
) -> String {
    if is_valid_runtime_source_status(current_status) {
        return current_status.to_string();
    }
    if matches!(current_status, "ready" | "cached") {
        if json_string_from_map(map, "source_page").is_some_and(|path| vault.join(path).is_file()) {
            return "published".to_string();
        }
        return "parsed".to_string();
    }
    if current_status == "blocked" && json_string_from_map(map, "last_error").is_some() {
        return "failed".to_string();
    }
    "candidate".to_string()
}

fn normalize_runtime_source_registry_rows(vault: &Path, values: &mut [serde_json::Value]) {
    let now = Local::now().to_rfc3339();
    for value in values {
        let Some(map) = value.as_object_mut() else {
            continue;
        };
        let Some(current_status) = map
            .get("status")
            .and_then(serde_json::Value::as_str)
            .map(ToString::to_string)
        else {
            continue;
        };
        if is_valid_runtime_source_status(&current_status) {
            continue;
        }
        let runtime_status = runtime_source_status_for_legacy_row(vault, map, &current_status);
        set_json_if_missing(map, "desktop_status", current_status);
        map.insert(
            "status".to_string(),
            serde_json::Value::String(runtime_status),
        );
        map.insert(
            "desktop_updated_at".to_string(),
            serde_json::Value::String(now.clone()),
        );
    }
}

fn merge_runtime_source_registry(
    vault: &Path,
    registry: &[DesktopRegistryEntry],
) -> Result<(), String> {
    let path = vault.join("_state").join("source-registry.jsonl");
    let mut values = read_text(&path)
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect::<Vec<_>>();
    normalize_runtime_source_registry_rows(vault, &mut values);
    let mut index_by_key = HashMap::new();
    for (index, value) in values.iter().enumerate() {
        for key in [
            registry_key(value),
            json_string(value, "source_uuid"),
            json_string(value, "source_sha256"),
            json_string(value, "source_path"),
            json_string(value, "raw_path"),
            json_string(value, "canonical_path"),
        ]
        .into_iter()
        .flatten()
        {
            index_by_key.insert(key, index);
        }
        for key in json_string_array(value, "duplicate_paths") {
            index_by_key.insert(key, index);
        }
    }

    for entry in registry {
        let idx = index_by_key
            .get(&entry.source_uuid)
            .copied()
            .or_else(|| index_by_key.get(&entry.source_sha256).copied())
            .or_else(|| index_by_key.get(&entry.source_path).copied())
            .or_else(|| index_by_key.get(&entry.raw_path).copied())
            .or_else(|| index_by_key.get(&entry.canonical_path).copied());
        if entry.duplicate_of.is_some() {
            if let Some(index) = idx {
                if let Some(map) = values[index].as_object_mut() {
                    let duplicate_paths = map
                        .entry("duplicate_paths".to_string())
                        .or_insert_with(|| serde_json::Value::Array(Vec::new()));
                    if let Some(items) = duplicate_paths.as_array_mut() {
                        let value = serde_json::Value::String(entry.source_path.clone());
                        if !items.contains(&value) {
                            items.push(value);
                        }
                    }
                }
            }
            continue;
        }
        let row = if let Some(index) = idx {
            &mut values[index]
        } else {
            values.push(serde_json::json!({}));
            let index = values.len() - 1;
            index_by_key.insert(entry.source_uuid.clone(), index);
            index_by_key.insert(entry.source_sha256.clone(), index);
            index_by_key.insert(entry.source_path.clone(), index);
            index_by_key.insert(entry.raw_path.clone(), index);
            index_by_key.insert(entry.canonical_path.clone(), index);
            &mut values[index]
        };
        if !row.is_object() {
            *row = serde_json::json!({});
        }
        if let Some(map) = row.as_object_mut() {
            let current_status = map
                .get("status")
                .and_then(serde_json::Value::as_str)
                .map(ToString::to_string);
            let runtime_status =
                runtime_source_status_for_desktop_entry(vault, entry, current_status.as_deref());
            map.insert(
                "source_uuid".to_string(),
                serde_json::Value::String(entry.source_uuid.clone()),
            );
            if let Some(source_id) = &entry.source_id {
                set_json_if_missing(map, "source_id", source_id.clone());
            }
            map.insert(
                "source_sha256".to_string(),
                serde_json::Value::String(entry.source_sha256.clone()),
            );
            set_json_if_missing(map, "raw_hash", entry.source_sha256.clone());
            map.insert(
                "source_path".to_string(),
                serde_json::Value::String(entry.source_path.clone()),
            );
            map.insert(
                "raw_path".to_string(),
                serde_json::Value::String(entry.raw_path.clone()),
            );
            map.insert(
                "canonical_path".to_string(),
                serde_json::Value::String(entry.canonical_path.clone()),
            );
            map.insert(
                "mime".to_string(),
                serde_json::Value::String(entry.mime.clone()),
            );
            if let Some(duplicate_of) = &entry.duplicate_of {
                map.insert(
                    "duplicate_of".to_string(),
                    serde_json::Value::String(duplicate_of.clone()),
                );
            }
            if let Some(path) = &entry.artifact_path {
                map.insert(
                    "artifact_path".to_string(),
                    serde_json::Value::String(path.clone()),
                );
            }
            if let Some(hash) = &entry.artifact_sha256 {
                map.insert(
                    "artifact_sha256".to_string(),
                    serde_json::Value::String(hash.clone()),
                );
            }
            if let Some(parser) = &entry.parser {
                map.insert(
                    "parser".to_string(),
                    serde_json::Value::String(parser.clone()),
                );
            }
            if let Some(version) = &entry.parser_version {
                map.insert(
                    "parser_version".to_string(),
                    serde_json::Value::String(version.clone()),
                );
            }
            if let Some(source_page) = &entry.source_page {
                set_json_if_missing(map, "source_page", source_page.clone());
            }
            map.insert(
                "status".to_string(),
                serde_json::Value::String(runtime_status),
            );
            map.insert(
                "desktop_status".to_string(),
                serde_json::Value::String(entry.status.clone()),
            );
            map.insert(
                "desktop_updated_at".to_string(),
                serde_json::Value::String(Local::now().to_rfc3339()),
            );
            if let Some(error) = &entry.last_error {
                map.insert(
                    "last_error".to_string(),
                    serde_json::Value::String(error.clone()),
                );
            }
            if let Some(created_at) = &entry.created_at {
                set_json_if_missing(map, "created_at", created_at.clone());
            }
            if let Some(updated_at) = &entry.updated_at {
                map.insert(
                    "updated_at".to_string(),
                    serde_json::Value::String(updated_at.clone()),
                );
            }
            if let Some(published_at) = &entry.published_at {
                set_json_if_missing(map, "published_at", published_at.clone());
            }
        }
    }

    write_jsonl(&path, &values)
}

fn job_for_plan_entry(
    vault: &Path,
    entry: &IngestPlanEntry,
    source_id: Option<&str>,
) -> DesktopIngestJob {
    let review_gated = entry.requires_human_approval
        || matches!(entry.current_state.as_str(), "duplicate" | "needs_review");
    let status = if review_gated {
        "blocked"
    } else {
        match entry.status.as_str() {
            "published" => "succeeded",
            "blocked" => "blocked",
            _ => "queued",
        }
    };
    let current_step = if review_gated {
        "review_gate"
    } else {
        match entry.action.as_str() {
            "stage_text_artifact" | "restage_text_artifact" => "stage_artifact",
            "parse_required" => "parse_artifact",
            "run_ingest_corpus" | "skip_staging" => "runtime_ingest",
            "skip_runtime" => "published",
            _ => "inspect",
        }
    };
    DesktopIngestJob {
        job_id: job_id_for_source_id(source_id, &entry.sha256),
        source_uuid: source_uuid(&entry.sha256),
        source_id: source_id.map(ToString::to_string),
        source_path: rel_path(vault, &PathBuf::from(&entry.source_path)),
        file_name: entry.file_name.clone(),
        kind: current_step.to_string(),
        artifact_path: entry
            .artifact_path
            .as_ref()
            .map(|path| rel_path(vault, &PathBuf::from(path))),
        status: status.to_string(),
        current_step: current_step.to_string(),
        next_action: if review_gated {
            "inspect_source".to_string()
        } else {
            entry.action.clone()
        },
        reason: entry.reason.clone(),
        attempt: 0,
        max_attempts: 3,
        started_at: None,
        ended_at: None,
        last_error: if review_gated || entry.status == "blocked" {
            Some(entry.reason.clone())
        } else {
            None
        },
        log_path: None,
        inputs: entry.inputs.clone(),
        outputs: entry.outputs.clone(),
    }
}

fn job_from_value(value: &serde_json::Value) -> Option<DesktopIngestJob> {
    let job_id = json_string(value, "job_id").or_else(|| json_string(value, "jobId"))?;
    Some(DesktopIngestJob {
        job_id,
        source_uuid: json_string(value, "source_uuid")
            .or_else(|| json_string(value, "sourceUuid"))?,
        source_id: json_string(value, "source_id").or_else(|| json_string(value, "sourceId")),
        source_path: json_string(value, "source_path")
            .or_else(|| json_string(value, "sourcePath"))
            .unwrap_or_default(),
        file_name: json_string(value, "file_name")
            .or_else(|| json_string(value, "fileName"))
            .unwrap_or_default(),
        kind: json_string(value, "kind").unwrap_or_else(|| "inspect".to_string()),
        artifact_path: json_string(value, "artifact_path")
            .or_else(|| json_string(value, "artifactPath")),
        status: json_string(value, "status").unwrap_or_else(|| "queued".to_string()),
        current_step: json_string(value, "current_step")
            .or_else(|| json_string(value, "currentStep"))
            .unwrap_or_else(|| "inspect".to_string()),
        next_action: json_string(value, "next_action")
            .or_else(|| json_string(value, "nextAction"))
            .unwrap_or_default(),
        reason: json_string(value, "reason").unwrap_or_default(),
        attempt: json_usize(value, "attempt").unwrap_or(0),
        max_attempts: json_usize(value, "max_attempts")
            .or_else(|| json_usize(value, "maxAttempts"))
            .unwrap_or(3),
        started_at: json_string(value, "started_at").or_else(|| json_string(value, "startedAt")),
        ended_at: json_string(value, "ended_at").or_else(|| json_string(value, "endedAt")),
        last_error: json_string(value, "last_error").or_else(|| json_string(value, "lastError")),
        log_path: json_string(value, "log_path").or_else(|| json_string(value, "logPath")),
        inputs: json_string_array(value, "inputs"),
        outputs: json_string_array(value, "outputs"),
    })
}

fn load_ingest_jobs(vault: &Path) -> HashMap<String, DesktopIngestJob> {
    read_text(&vault.join("_state").join("ingest-jobs.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|value| job_from_value(&value))
        .map(|job| (job.job_id.clone(), job))
        .collect()
}

fn merge_ingest_jobs(vault: &Path, planned: Vec<DesktopIngestJob>) -> Vec<DesktopIngestJob> {
    let existing = load_ingest_jobs(vault);
    planned
        .into_iter()
        .map(|mut job| {
            if let Some(previous) = existing.get(&job.job_id) {
                job.attempt = previous.attempt;
                job.max_attempts = previous.max_attempts.max(1);
                job.started_at = previous.started_at.clone();
                job.ended_at = previous.ended_at.clone();
                job.last_error = previous.last_error.clone().or(job.last_error);
                job.log_path = previous.log_path.clone();
                if matches!(
                    previous.status.as_str(),
                    "queued" | "running" | "failed" | "cancelled"
                ) && job.status != "blocked"
                    && job.status != "succeeded"
                {
                    job.status = previous.status.clone();
                }
            }
            job
        })
        .collect()
}

fn write_ingest_jobs(vault: &Path, jobs: &[DesktopIngestJob]) -> Result<(), String> {
    write_jsonl(&vault.join("_state").join("ingest-jobs.jsonl"), jobs)
}

fn update_ingest_job_record(
    vault: &Path,
    job_id: &str,
    status: &str,
    last_error: Option<String>,
    log_path: Option<String>,
) -> Result<(), String> {
    let mut jobs = load_ingest_jobs(vault)
        .into_values()
        .collect::<Vec<DesktopIngestJob>>();
    let now = Local::now().to_rfc3339();
    let mut found = false;
    for job in &mut jobs {
        if job.job_id != job_id {
            continue;
        }
        found = true;
        if status == "queued" && matches!(job.status.as_str(), "failed" | "cancelled" | "blocked") {
            job.attempt = job.attempt.saturating_add(1);
            job.started_at = None;
            job.ended_at = None;
            job.last_error = None;
        } else if status == "running" {
            job.started_at = Some(now.clone());
            job.ended_at = None;
        } else if matches!(status, "succeeded" | "failed" | "cancelled" | "blocked") {
            job.ended_at = Some(now.clone());
        }
        job.status = status.to_string();
        if let Some(error) = last_error.clone() {
            job.last_error = Some(error);
        }
        if let Some(path) = log_path.clone() {
            job.log_path = Some(path);
        }
    }
    if !found {
        return Err(format!("job not found: {job_id}"));
    }
    jobs.sort_by(|a, b| a.job_id.cmp(&b.job_id));
    write_ingest_jobs(vault, &jobs)
}

fn action_for_plan_entry(vault: &Path, entry: &IngestPlanEntry) -> Option<DashboardAction> {
    let mut links = vec![DashboardLink {
        label: "source".to_string(),
        path: rel_path(vault, &PathBuf::from(&entry.source_path)),
    }];
    if let Some(path) = &entry.artifact_path {
        links.push(DashboardLink {
            label: "artifact".to_string(),
            path: rel_path(vault, &PathBuf::from(path)),
        });
    }
    if plan_entry_is_review_gated(entry) {
        let severity = if entry.current_state == "blocked_contract" {
            "p1"
        } else {
            "p2"
        };
        return Some(DashboardAction {
            action_id: format!("act-source-review-{}", short_hash(&entry.sha256)),
            kind: "source_review_required".to_string(),
            severity: severity.to_string(),
            title: format!("{} 需要人工确认后再进入 ingest", entry.file_name),
            body: entry.next_action_label.clone(),
            reason: entry.reason.clone(),
            status: "open".to_string(),
            recommended_action: "inspect_source".to_string(),
            primary_object_type: "source".to_string(),
            primary_object_id: source_uuid(&entry.sha256),
            affected_objects: vec![DashboardAffectedObject {
                object_type: "source".to_string(),
                object_id: source_uuid(&entry.sha256),
                status: entry.current_state.clone(),
            }],
            links,
        });
    }
    let (kind, severity, title, body, recommended_action) = match entry.status.as_str() {
        "blocked" if entry.action == "parse_required" => (
            "parse_required",
            "p1",
            format!("{} 需要解析或重新解析", entry.file_name),
            entry
                .parser_hint
                .clone()
                .unwrap_or_else(|| entry.reason.clone()),
            "parse_artifact",
        ),
        "blocked" if entry.action == "extract_archive_required" => (
            "archive_extract_required",
            "p1",
            format!("{} 需要先解包", entry.file_name),
            entry.reason.clone(),
            "extract_archive",
        ),
        "blocked" => (
            "ingest_blocked",
            "p2",
            format!("{} 暂不能进入 ingest", entry.file_name),
            entry.reason.clone(),
            "inspect_source",
        ),
        "stageable" => (
            "stage_artifact",
            "p2",
            format!("{} 可生成标准 artifact", entry.file_name),
            "将文本/Markdown staging 为 combined.md、manifest.json 和 chunks.jsonl。".to_string(),
            "run_ingest_pipeline",
        ),
        "ready" | "cached" => (
            "ingest_ready",
            "p2",
            format!("{} 可发布到 runtime", entry.file_name),
            "artifact 已准备好，可以进入 source ingest、claims、QA 和 lint 链路。".to_string(),
            "run_ingest_pipeline",
        ),
        _ => return None,
    };
    Some(DashboardAction {
        action_id: format!("act-{}-{}", kind, short_hash(&entry.sha256)),
        kind: kind.to_string(),
        severity: severity.to_string(),
        title,
        body,
        reason: entry.reason.clone(),
        status: "open".to_string(),
        recommended_action: recommended_action.to_string(),
        primary_object_type: "source".to_string(),
        primary_object_id: source_uuid(&entry.sha256),
        affected_objects: vec![
            DashboardAffectedObject {
                object_type: "source".to_string(),
                object_id: source_uuid(&entry.sha256),
                status: entry.status.clone(),
            },
            DashboardAffectedObject {
                object_type: "artifact".to_string(),
                object_id: entry.artifact_path.clone().unwrap_or_default(),
                status: entry.status.clone(),
            },
        ],
        links,
    })
}

fn impact_edges_for_plan_entry(vault: &Path, entry: &IngestPlanEntry) -> Vec<ImpactEdge> {
    let mut edges = Vec::new();
    let from_id = source_uuid(&entry.sha256);
    if let Some(artifact_path) = &entry.artifact_path {
        let artifact_rel = rel_path(vault, &PathBuf::from(artifact_path));
        edges.push(ImpactEdge {
            edge_id: format!("edge-{}-artifact", short_hash(&entry.sha256)),
            from_type: "source".to_string(),
            from_id: from_id.clone(),
            to_type: "artifact".to_string(),
            to_id: artifact_rel.clone(),
            relationship: "parsed_to".to_string(),
            status: entry.status.clone(),
        });
        let chunks = PathBuf::from(artifact_path)
            .parent()
            .map(|parent| parent.join("chunks.jsonl"));
        if let Some(chunks) = chunks.filter(|path| path.is_file()) {
            edges.push(ImpactEdge {
                edge_id: format!("edge-{}-chunks", short_hash(&entry.sha256)),
                from_type: "artifact".to_string(),
                from_id: artifact_rel,
                to_type: "chunks".to_string(),
                to_id: rel_path(vault, &chunks),
                relationship: "chunked_into".to_string(),
                status: entry.status.clone(),
            });
        }
    }
    edges
}

fn claim_impact_edges(vault: &Path) -> Vec<ImpactEdge> {
    let mut edges = Vec::new();
    for claim in claim_ledger_items(vault) {
        let status = if claim.verdict != "unknown" {
            claim.verdict.clone()
        } else {
            claim.status.clone()
        };
        if let Some(chunk_id) = &claim.chunk_id {
            let edge_hash = short_hash(&sha256_text(&format!("{chunk_id}:{}", claim.claim_id)));
            edges.push(ImpactEdge {
                edge_id: format!("edge-claim-chunk-{edge_hash}"),
                from_type: "chunk".to_string(),
                from_id: chunk_id.clone(),
                to_type: "claim".to_string(),
                to_id: claim.claim_id.clone(),
                relationship: "supports".to_string(),
                status: status.clone(),
            });
        }
        if let Some(source_uuid) = &claim.source_uuid {
            let edge_hash = short_hash(&sha256_text(&format!("{source_uuid}:{}", claim.claim_id)));
            edges.push(ImpactEdge {
                edge_id: format!("edge-source-claim-{edge_hash}"),
                from_type: "source".to_string(),
                from_id: source_uuid.clone(),
                to_type: "claim".to_string(),
                to_id: claim.claim_id.clone(),
                relationship: "asserts".to_string(),
                status: status.clone(),
            });
        }
        for concept in &claim.concepts {
            let edge_hash = short_hash(&sha256_text(&format!("{}:{concept}", claim.claim_id)));
            edges.push(ImpactEdge {
                edge_id: format!("edge-claim-concept-{edge_hash}"),
                from_type: "claim".to_string(),
                from_id: claim.claim_id.clone(),
                to_type: "concept".to_string(),
                to_id: concept.clone(),
                relationship: "affects".to_string(),
                status: status.clone(),
            });
        }
    }
    edges
}

fn apply_dashboard_action_overrides(vault: &Path, actions: &mut [DashboardAction]) {
    let overrides = load_status_overrides(vault, "desktop-action-overrides.jsonl");
    for action in actions {
        if let Some(status) = overrides.get(&action.action_id) {
            action.status = status.clone();
        }
    }
}

fn build_ingest_contracts(
    vault: &Path,
    entries: &[IngestPlanEntry],
) -> Result<IngestContracts, String> {
    let mut registry = entries
        .iter()
        .map(|entry| registry_entry_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    assign_stable_source_ids(vault, &mut registry)?;
    append_missing_runtime_registry_entries(vault, &mut registry);
    let source_aliases = source_id_aliases_for_registry(vault, &registry);
    let source_ids = registry
        .iter()
        .map(|entry| (entry.source_sha256.clone(), entry.source_id.clone()))
        .collect::<HashMap<_, _>>();
    let artifacts = entries
        .iter()
        .filter_map(|entry| {
            artifact_summary_for_entry(
                vault,
                entry,
                source_ids.get(&entry.sha256).and_then(Option::as_deref),
            )
        })
        .collect::<Vec<_>>();
    let jobs = entries
        .iter()
        .map(|entry| {
            job_for_plan_entry(
                vault,
                entry,
                source_ids.get(&entry.sha256).and_then(Option::as_deref),
            )
        })
        .collect::<Vec<_>>();
    let jobs = merge_ingest_jobs(vault, jobs);
    let mut actions = entries
        .iter()
        .filter_map(|entry| action_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    actions.extend(vault_level_actions(vault));
    apply_dashboard_action_overrides(vault, &mut actions);
    let mut impact_edges = entries
        .iter()
        .flat_map(|entry| impact_edges_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    impact_edges.extend(claim_impact_edges(vault));
    Ok(IngestContracts {
        registry,
        source_aliases,
        artifacts,
        jobs,
        actions,
        impact_edges,
    })
}

fn vault_level_actions(vault: &Path) -> Vec<DashboardAction> {
    let mut actions = Vec::new();
    let (_claims, review, stale, contradicted) =
        count_claims(&vault.join("claims").join("claims.jsonl"));
    let claims_path = rel_path(vault, &vault.join("claims").join("claims.jsonl"));
    if review > 0 {
        actions.push(DashboardAction {
            action_id: "act-claims-review".to_string(),
            kind: "claims_need_review".to_string(),
            severity: "p1".to_string(),
            title: format!("{review} 条 claims 需要 review"),
            body: "Claim Ledger 中仍有待审陈述，concept synthesis 不应默认吸收这些内容。"
                .to_string(),
            reason: "claims.jsonl contains needs_review rows".to_string(),
            status: "open".to_string(),
            recommended_action: "review_claims".to_string(),
            primary_object_type: "claim_ledger".to_string(),
            primary_object_id: "claims/claims.jsonl".to_string(),
            affected_objects: vec![DashboardAffectedObject {
                object_type: "claim".to_string(),
                object_id: format!("{review} needs_review rows"),
                status: "needs_review".to_string(),
            }],
            links: vec![DashboardLink {
                label: "claims".to_string(),
                path: claims_path.clone(),
            }],
        });
    }
    if stale > 0 {
        actions.push(DashboardAction {
            action_id: "act-claims-stale".to_string(),
            kind: "stale_claims".to_string(),
            severity: "p1".to_string(),
            title: format!("{stale} 条 claims 已失效"),
            body: "有 claims 标记为 stale，相关 source/concept 需要重新验证或刷新。".to_string(),
            reason: "claim verdict/status is stale".to_string(),
            status: "open".to_string(),
            recommended_action: "refresh_affected_sources".to_string(),
            primary_object_type: "claim_ledger".to_string(),
            primary_object_id: "claims/claims.jsonl".to_string(),
            affected_objects: vec![DashboardAffectedObject {
                object_type: "claim".to_string(),
                object_id: format!("{stale} stale rows"),
                status: "stale".to_string(),
            }],
            links: vec![DashboardLink {
                label: "claims".to_string(),
                path: claims_path.clone(),
            }],
        });
    }
    if contradicted > 0 {
        actions.push(DashboardAction {
            action_id: "act-claims-contradicted".to_string(),
            kind: "contradiction_review".to_string(),
            severity: "p1".to_string(),
            title: format!("{contradicted} 条 claims 存在冲突"),
            body: "存在 contradicted claims，相关 concept 页面应进入 review，而不是直接稳定发布。"
                .to_string(),
            reason: "claim verdict/status is contradicted".to_string(),
            status: "open".to_string(),
            recommended_action: "review_contradictions".to_string(),
            primary_object_type: "claim_ledger".to_string(),
            primary_object_id: "claims/claims.jsonl".to_string(),
            affected_objects: vec![DashboardAffectedObject {
                object_type: "claim".to_string(),
                object_id: format!("{contradicted} contradicted rows"),
                status: "contradicted".to_string(),
            }],
            links: vec![DashboardLink {
                label: "claims".to_string(),
                path: claims_path,
            }],
        });
    }
    let science_review = count_jsonl(&vault.join("_state").join("science-review-queue.jsonl"));
    if science_review > 0 {
        actions.push(DashboardAction {
            action_id: "act-science-review".to_string(),
            kind: "science_review".to_string(),
            severity: "p2".to_string(),
            title: format!("{science_review} 个 science review 项"),
            body: "Science review queue 中仍有待处理对象，建议先处理后再做长期 concept 合成。"
                .to_string(),
            reason: "science-review-queue.jsonl is not empty".to_string(),
            status: "open".to_string(),
            recommended_action: "run_science_review".to_string(),
            primary_object_type: "review_queue".to_string(),
            primary_object_id: "_state/science-review-queue.jsonl".to_string(),
            affected_objects: vec![DashboardAffectedObject {
                object_type: "review_queue".to_string(),
                object_id: format!("{science_review} items"),
                status: "open".to_string(),
            }],
            links: vec![DashboardLink {
                label: "science review queue".to_string(),
                path: "_state/science-review-queue.jsonl".to_string(),
            }],
        });
    }
    actions
}

fn contract_finding(
    severity: &str,
    kind: &str,
    object_type: &str,
    object_id: &str,
    title: String,
    detail: String,
    path: Option<String>,
) -> ContractFinding {
    let finding_id = format!(
        "lint-{}",
        short_hash(&sha256_text(&format!(
            "{severity}:{kind}:{object_type}:{object_id}:{detail}"
        )))
    );
    ContractFinding {
        finding_id,
        severity: severity.to_string(),
        kind: kind.to_string(),
        object_type: object_type.to_string(),
        object_id: object_id.to_string(),
        title,
        detail,
        status: "open".to_string(),
        path,
    }
}

fn lint_ingest_contracts(
    vault: &Path,
    registry: &[DesktopRegistryEntry],
    artifacts: &[ArtifactContractSummary],
    jobs: &[DesktopIngestJob],
    impact_edges: &[ImpactEdge],
) -> Vec<ContractFinding> {
    let mut findings = Vec::new();
    let mut id_to_uuid = HashMap::new();
    let mut known_sources = HashSet::new();
    for entry in registry {
        known_sources.insert(entry.source_uuid.clone());
        let object_id = entry
            .source_id
            .clone()
            .unwrap_or_else(|| entry.source_uuid.clone());
        if entry.source_id.is_none() {
            findings.push(contract_finding(
                "p0",
                "missing_source_id",
                "source",
                &entry.source_uuid,
                "source registry 缺少 stable source_id".to_string(),
                "每个 source_uuid 必须分配稳定 LLM-NNNN，不能依赖文件排序。".to_string(),
                Some(entry.source_path.clone()),
            ));
        }
        if let Some(source_id) = &entry.source_id {
            if let Some(previous_uuid) =
                id_to_uuid.insert(source_id.clone(), entry.source_uuid.clone())
            {
                if previous_uuid != entry.source_uuid && entry.duplicate_of.is_none() {
                    findings.push(contract_finding(
                        "p0",
                        "duplicate_source_id",
                        "source",
                        source_id,
                        format!("{source_id} 被多个 source_uuid 使用"),
                        "source_id 必须唯一；重复 raw 文件应使用 duplicate_of 指向既有 identity。"
                            .to_string(),
                        Some(entry.source_path.clone()),
                    ));
                }
            }
        }
        if !vault.join(&entry.source_path).is_file() {
            findings.push(contract_finding(
                "p1",
                "missing_raw_source",
                "source",
                &object_id,
                "registry 指向的 raw source 不存在".to_string(),
                format!("missing {}", entry.source_path),
                Some(entry.source_path.clone()),
            ));
        }
        if matches!(entry.status.as_str(), "ready" | "cached" | "published")
            && entry
                .artifact_path
                .as_ref()
                .is_none_or(|path| !vault.join(path).is_file())
        {
            findings.push(contract_finding(
                "p1",
                "missing_artifact",
                "source",
                &object_id,
                "可运行 source 缺少 parse artifact".to_string(),
                "ready/cached/published 状态必须能追溯到 combined.md artifact。".to_string(),
                entry.artifact_path.clone(),
            ));
        }
        if entry.status == "published"
            && entry
                .source_page
                .as_ref()
                .is_none_or(|path| !vault.join(path).is_file())
        {
            findings.push(contract_finding(
                "p1",
                "missing_source_page",
                "source",
                &object_id,
                "published source 缺少 source page".to_string(),
                "published registry row 必须能追溯到 sources/LLM-NNNN.md。".to_string(),
                entry.source_page.clone(),
            ));
        }
    }

    for artifact in artifacts {
        if artifact.manifest_path.is_none() {
            findings.push(contract_finding(
                "p1",
                "missing_manifest",
                "artifact",
                &artifact.artifact_path,
                "artifact 缺少 manifest.json".to_string(),
                "正式 parser contract 要求每个 artifact 都提供 manifest.json。".to_string(),
                Some(artifact.artifact_path.clone()),
            ));
        }
        if artifact.status == "stale" {
            findings.push(contract_finding(
                "p1",
                "stale_artifact",
                "artifact",
                &artifact.artifact_path,
                "artifact source hash 已过期".to_string(),
                "source_sha256 与 manifest 不一致，必须重新解析后再 ingest。".to_string(),
                artifact.manifest_path.clone(),
            ));
        }
        if artifact.manifest_path.is_some() && artifact.schema_version.is_none() {
            findings.push(contract_finding(
                "p2",
                "missing_manifest_schema_version",
                "artifact",
                &artifact.artifact_path,
                "manifest 缺少 schema_version".to_string(),
                "缺少 schema_version 会让未来 migration 和 lint 难以判断 contract 版本。"
                    .to_string(),
                artifact.manifest_path.clone(),
            ));
        }
        if artifact.manifest_path.is_some() && artifact.chunks_path.is_none() {
            findings.push(contract_finding(
                "p1",
                "missing_chunks",
                "artifact",
                &artifact.artifact_path,
                "artifact 缺少 chunks.jsonl".to_string(),
                "claim/evidence path 依赖 chunk_id，不能只保留 combined.md。".to_string(),
                artifact.manifest_path.clone(),
            ));
        }
        if artifact.manifest_path.is_some() && !artifact.contract_valid {
            findings.push(contract_finding(
                "p1",
                "invalid_artifact_hash",
                "artifact",
                &artifact.artifact_path,
                "artifact hash 与 manifest 不一致".to_string(),
                "manifest.artifact_sha256 必须匹配当前 combined.md。".to_string(),
                artifact.manifest_path.clone(),
            ));
        }
        if artifact.chunk_count == 0 && artifact.chunks_path.is_some() {
            findings.push(contract_finding(
                "p2",
                "empty_chunks",
                "artifact",
                &artifact.artifact_path,
                "chunks.jsonl 为空".to_string(),
                "没有 chunk row 时，claim 无法绑定 evidence anchor。".to_string(),
                artifact.chunks_path.clone(),
            ));
        }
        if artifact.anchors_pages
            || artifact.anchors_tables
            || artifact.anchors_figures
            || artifact.anchors_equations
        {
            continue;
        }
        if artifact
            .limitations
            .iter()
            .all(|item| !item.contains("line anchors"))
        {
            findings.push(contract_finding(
                "p3",
                "limited_anchor_coverage",
                "artifact",
                &artifact.artifact_path,
                "artifact 只有有限 evidence anchors".to_string(),
                "建议 parser 明确写出 pages/tables/figures/equations 的覆盖情况和 limitations。"
                    .to_string(),
                artifact.manifest_path.clone(),
            ));
        }
    }

    for job in jobs {
        if job.inputs.is_empty() {
            findings.push(contract_finding(
                "p2",
                "job_missing_inputs",
                "job",
                &job.job_id,
                "ingest job 缺少 inputs".to_string(),
                "queue row 必须记录输入对象，方便恢复和审计。".to_string(),
                job.log_path.clone(),
            ));
        }
        if job.status == "failed" && job.last_error.is_none() {
            findings.push(contract_finding(
                "p2",
                "failed_job_missing_error",
                "job",
                &job.job_id,
                "failed job 缺少 last_error".to_string(),
                "失败状态必须能解释原因，不能只显示 failed。".to_string(),
                job.log_path.clone(),
            ));
        }
        if job.attempt > job.max_attempts {
            findings.push(contract_finding(
                "p1",
                "job_attempt_exceeded",
                "job",
                &job.job_id,
                "job retry 次数超过上限".to_string(),
                format!(
                    "attempt {} > max_attempts {}",
                    job.attempt, job.max_attempts
                ),
                job.log_path.clone(),
            ));
        }
    }

    for claim in claim_ledger_items(vault) {
        if matches!(claim.verdict.as_str(), "supported" | "needs_review")
            && (claim.evidence_quote.is_none() || claim.evidence_hash.is_none())
        {
            findings.push(contract_finding(
                "p1",
                "claim_missing_evidence",
                "claim",
                &claim.claim_id,
                "claim 缺少 evidence quote/hash".to_string(),
                "长期 synthesis 依赖的 claim 必须有短 quote 和 hash。".to_string(),
                Some("claims/claims.jsonl".to_string()),
            ));
        }
        if claim.source_uuid.is_some()
            && claim
                .source_uuid
                .as_ref()
                .is_some_and(|source_uuid| !known_sources.contains(source_uuid))
        {
            findings.push(contract_finding(
                "p2",
                "claim_unknown_source",
                "claim",
                &claim.claim_id,
                "claim 指向未知 source_uuid".to_string(),
                "Claim Ledger 与 source registry 不一致。".to_string(),
                Some("claims/claims.jsonl".to_string()),
            ));
        }
    }

    for edge in impact_edges {
        if edge.from_id.is_empty() || edge.to_id.is_empty() {
            findings.push(contract_finding(
                "p2",
                "broken_impact_edge",
                "impact_edge",
                &edge.edge_id,
                "impact graph 存在空节点".to_string(),
                "dependency edge 必须有完整 from_id/to_id。".to_string(),
                Some("_state/impact-graph.jsonl".to_string()),
            ));
        }
    }

    findings.sort_by(|a, b| a.severity.cmp(&b.severity).then(a.kind.cmp(&b.kind)));
    findings
}

fn actions_for_lint_findings(findings: &[ContractFinding]) -> Vec<DashboardAction> {
    findings
        .iter()
        .filter(|finding| matches!(finding.severity.as_str(), "p0" | "p1"))
        .map(|finding| DashboardAction {
            action_id: format!("act-{}", finding.finding_id),
            kind: "lint_error".to_string(),
            severity: finding.severity.clone(),
            title: finding.title.clone(),
            body: finding.detail.clone(),
            reason: finding.kind.clone(),
            status: "open".to_string(),
            recommended_action: "run_ingest_lint".to_string(),
            primary_object_type: finding.object_type.clone(),
            primary_object_id: finding.object_id.clone(),
            affected_objects: vec![DashboardAffectedObject {
                object_type: finding.object_type.clone(),
                object_id: finding.object_id.clone(),
                status: finding.severity.clone(),
            }],
            links: finding
                .path
                .as_ref()
                .map(|path| {
                    vec![DashboardLink {
                        label: "object".to_string(),
                        path: path.clone(),
                    }]
                })
                .unwrap_or_default(),
        })
        .collect()
}

fn write_lint_findings(vault: &Path, findings: &[ContractFinding]) -> Result<(), String> {
    write_jsonl(&vault.join("_state").join("lint-findings.jsonl"), findings)?;
    write_jsonl(
        &vault.join("_state").join("desktop-lint-findings.jsonl"),
        findings,
    )
}

fn is_evidence_anchor_finding(finding: &ContractFinding) -> bool {
    let text = format!(
        "{} {} {}",
        finding.kind.to_ascii_lowercase(),
        finding.title.to_ascii_lowercase(),
        finding.detail.to_ascii_lowercase()
    );
    text.contains("evidence") && (text.contains("anchor") || text.contains("heading"))
}

fn load_existing_evidence_anchor_findings(vault: &Path) -> Vec<ContractFinding> {
    read_text(&vault.join("_state").join("lint-findings.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .map(|value| ContractFinding {
            finding_id: json_string(&value, "findingId")
                .or_else(|| json_string(&value, "finding_id"))
                .or_else(|| json_string(&value, "id"))
                .unwrap_or_else(|| {
                    format!(
                        "runtime-{}",
                        short_hash(&sha256_text(
                            &serde_json::to_string(&value).unwrap_or_default()
                        ))
                    )
                }),
            severity: json_string(&value, "severity").unwrap_or_else(|| "p2".to_string()),
            kind: json_string(&value, "kind")
                .or_else(|| json_string(&value, "check"))
                .unwrap_or_else(|| "evidence_anchor_warning".to_string()),
            object_type: json_string(&value, "objectType")
                .or_else(|| json_string(&value, "object_type"))
                .unwrap_or_else(|| "claim".to_string()),
            object_id: json_string(&value, "objectId")
                .or_else(|| json_string(&value, "object_id"))
                .or_else(|| json_string(&value, "claim_id"))
                .unwrap_or_else(|| "unknown-claim".to_string()),
            title: json_string(&value, "title")
                .unwrap_or_else(|| "Evidence anchor warning".to_string()),
            detail: json_string(&value, "detail")
                .or_else(|| json_string(&value, "message"))
                .unwrap_or_else(|| serde_json::to_string(&value).unwrap_or_default()),
            status: json_string(&value, "status").unwrap_or_else(|| "open".to_string()),
            path: json_string(&value, "path")
                .or_else(|| json_string(&value, "source_path"))
                .or_else(|| json_string(&value, "claim_path")),
        })
        .filter(is_evidence_anchor_finding)
        .collect()
}

fn write_ingest_plan(
    vault: &Path,
    mut entries: Vec<IngestPlanEntry>,
) -> Result<IngestPlan, String> {
    let summary = IngestPlanSummary {
        total: entries.len(),
        ready: entries
            .iter()
            .filter(|entry| entry.status == "ready")
            .count(),
        stageable: entries
            .iter()
            .filter(|entry| entry.status == "stageable")
            .count(),
        blocked: entries
            .iter()
            .filter(|entry| entry.status == "blocked")
            .count(),
        cached: entries
            .iter()
            .filter(|entry| entry.status == "cached")
            .count(),
        published: entries
            .iter()
            .filter(|entry| entry.status == "published")
            .count(),
    };
    let IngestContracts {
        registry,
        source_aliases,
        artifacts,
        jobs,
        actions: _pre_enrichment_actions,
        impact_edges,
    } = build_ingest_contracts(vault, &entries)?;
    let source_aliases = merge_source_id_aliases(vault, source_aliases);
    enrich_ingest_plan_entries(vault, &mut entries, &registry, &jobs);
    let source_ids = registry
        .iter()
        .map(|entry| (entry.source_sha256.clone(), entry.source_id.clone()))
        .collect::<HashMap<_, _>>();
    let jobs = entries
        .iter()
        .map(|entry| {
            job_for_plan_entry(
                vault,
                entry,
                source_ids.get(&entry.sha256).and_then(Option::as_deref),
            )
        })
        .collect::<Vec<_>>();
    let jobs = merge_ingest_jobs(vault, jobs);
    let mut actions = entries
        .iter()
        .filter_map(|entry| action_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    actions.extend(vault_level_actions(vault));
    apply_dashboard_action_overrides(vault, &mut actions);
    let mut lint_findings =
        lint_ingest_contracts(vault, &registry, &artifacts, &jobs, &impact_edges);
    let mut seen_findings = lint_findings
        .iter()
        .map(|finding| format!("{}:{}:{}", finding.kind, finding.object_id, finding.detail))
        .collect::<HashSet<_>>();
    for finding in load_existing_evidence_anchor_findings(vault) {
        let key = format!("{}:{}:{}", finding.kind, finding.object_id, finding.detail);
        if seen_findings.insert(key) {
            lint_findings.push(finding);
        }
    }
    actions.extend(actions_for_lint_findings(&lint_findings));
    apply_dashboard_action_overrides(vault, &mut actions);
    let state = vault.join("_state");
    write_jsonl(&state.join("artifacts.jsonl"), &artifacts)?;
    write_ingest_jobs(vault, &jobs)?;
    write_jsonl(&state.join("actions.jsonl"), &actions)?;
    write_jsonl(&state.join("impact-graph.jsonl"), &impact_edges)?;
    write_lint_findings(vault, &lint_findings)?;
    write_jsonl(&state.join("desktop-source-registry.jsonl"), &registry)?;
    write_source_id_aliases(vault, &source_aliases)?;
    merge_runtime_source_registry(vault, &registry)?;
    write_jsonl(&state.join("desktop-artifacts.jsonl"), &artifacts)?;
    write_jsonl(&state.join("desktop-ingest-jobs.jsonl"), &jobs)?;
    write_jsonl(&state.join("desktop-actions.jsonl"), &actions)?;
    write_jsonl(&state.join("desktop-impact-graph.jsonl"), &impact_edges)?;
    let plan_path = vault.join("_state").join("desktop-ingest-plan.json");
    let plan = IngestPlan {
        generated_at: Local::now().to_rfc3339(),
        vault_path: to_display(vault),
        plan_path: to_display(&plan_path),
        summary,
        entries,
        registry,
        source_aliases,
        artifacts,
        jobs,
        actions,
        impact_edges,
        lint_findings,
    };
    let rendered = serde_json::to_string_pretty(&plan)
        .map_err(|e| format!("failed to serialize ingest plan: {e}"))?;
    write_text(&plan_path, &(rendered + "\n"))?;
    Ok(plan)
}

#[tauri::command]
fn plan_ingest(vault_path: String) -> Result<IngestPlan, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let cached_hashes = load_cached_ingest_hashes(&vault);
    let published_keys = load_published_ingest_keys(&vault);
    let mut entries = Vec::new();
    let mut artifact_paths = HashSet::new();

    for source in collect_ingest_inputs(&vault) {
        let entry = plan_entry_for_source(&vault, &source, &cached_hashes, &published_keys)?;
        if let Some(path) = &entry.artifact_path {
            artifact_paths.insert(PathBuf::from(path));
        }
        entries.push(entry);
    }

    let raw = vault.join("raw");
    let mut parsed_artifact_dirs = Vec::new();
    collect_parsed_artifact_dirs(&raw, &mut parsed_artifact_dirs);
    parsed_artifact_dirs.sort();
    for path in parsed_artifact_dirs {
        let combined = path.join("combined.md");
        if combined.is_file() && !artifact_paths.contains(&combined) {
            let hash = sha256_file(&combined)?;
            let published = published_keys.contains(&(hash.clone(), hash.clone()));
            let status = if published { "published" } else { "ready" }.to_string();
            let action = if published {
                "skip_runtime"
            } else {
                "run_ingest_corpus"
            }
            .to_string();
            let reason = if published {
                "standalone parsed artifact already completed a desktop ingest pipeline"
            } else {
                "parsed artifact exists without a matching raw source in the desktop scan"
            }
            .to_string();
            let current_state = plan_current_state(&status, &action);
            let next_action_label = plan_next_action_label(&status, &action);
            let command = plan_command_for_action(&action, None);
            let inputs = vec![rel_path(&vault, &combined)];
            let outputs = plan_outputs_for_action(&vault, &combined, &action);
            entries.push(IngestPlanEntry {
                source_path: to_display(&combined),
                file_name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                sha256: hash,
                artifact_sha256: sha256_file(&combined).ok(),
                artifact_path: Some(to_display(&combined)),
                status,
                action,
                reason,
                parser_hint: None,
                current_state,
                next_action_label,
                command,
                inputs,
                outputs,
                last_log_path: None,
                requires_human_approval: false,
                uses_network: false,
            });
        }
    }

    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    write_ingest_plan(&vault, entries)
}

#[tauri::command]
fn run_ingest_lint(vault_path: String) -> Result<Vec<ContractFinding>, String> {
    let plan = plan_ingest(vault_path)?;
    Ok(plan.lint_findings)
}

#[tauri::command]
fn set_dashboard_action_status(
    vault_path: String,
    action_id: String,
    status: String,
) -> Result<IngestPlan, String> {
    validate_status(&status, &["open", "resolved", "ignored"])?;
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    append_status_override(
        &vault,
        "desktop-action-overrides.jsonl",
        &action_id,
        &status,
    )?;
    plan_ingest(to_display(&vault))
}

#[tauri::command]
fn set_ingest_job_status(
    vault_path: String,
    job_id: String,
    status: String,
) -> Result<IngestPlan, String> {
    validate_status(
        &status,
        &[
            "queued",
            "running",
            "blocked",
            "cancelled",
            "succeeded",
            "failed",
        ],
    )?;
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    if load_ingest_jobs(&vault).is_empty() {
        let _ = plan_ingest(to_display(&vault))?;
    }
    update_ingest_job_record(&vault, &job_id, &status, None, None)?;
    plan_ingest(to_display(&vault))
}

#[tauri::command]
fn list_claim_ledger(vault_path: String) -> Result<Vec<ClaimLedgerItem>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    Ok(claim_ledger_items(&vault))
}

#[tauri::command]
fn set_claim_verdict(
    vault_path: String,
    claim_id: String,
    verdict: String,
) -> Result<Vec<ClaimLedgerItem>, String> {
    validate_status(
        &verdict,
        &[
            "supported",
            "needs_review",
            "stale",
            "contradicted",
            "ignored",
            "unknown",
        ],
    )?;
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let claims_path = vault.join("claims").join("claims.jsonl");
    let original = read_text(&claims_path);
    let mut found = false;
    let mut rendered = String::new();
    for (index, line) in original.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            rendered.push('\n');
            continue;
        }
        let mut value = serde_json::from_str::<serde_json::Value>(trimmed)
            .map_err(|e| format!("failed to parse claims.jsonl line {}: {e}", index + 1))?;
        let row_claim_id = claim_id_for_value(&value, index + 1);
        if row_claim_id == claim_id {
            found = true;
            set_json_string(&mut value, "claim_id", &row_claim_id);
            set_json_string(&mut value, "verdict", &verdict);
            set_json_string(&mut value, "status", &verdict);
            set_json_string(&mut value, "updated_at", &Local::now().to_rfc3339());
            set_json_bool(&mut value, "needs_review", verdict == "needs_review");
            if json_string(&value, "evidence_hash").is_none() {
                let item = claim_item_from_value(&value, index + 1, true);
                if let Some(hash) = item.evidence_hash {
                    set_json_string(&mut value, "evidence_hash", &hash);
                }
            }
        }
        rendered.push_str(
            &serde_json::to_string(&value)
                .map_err(|e| format!("failed to serialize claims.jsonl row: {e}"))?,
        );
        rendered.push('\n');
    }
    if !found {
        return Err(format!("claim not found: {claim_id}"));
    }
    write_text(&claims_path, &rendered)?;
    let _ = plan_ingest(to_display(&vault));
    Ok(claim_ledger_items(&vault))
}

fn desktop_settings_path(vault: &Path) -> PathBuf {
    vault.join("_state").join("desktop-settings.json")
}

fn render_project_purpose_note(settings: &DesktopSettings) -> Option<String> {
    let project_name = settings.project_name.trim();
    let project_purpose = settings.project_purpose.trim();
    if project_name.is_empty() && project_purpose.is_empty() {
        return None;
    }
    let title = if project_name.is_empty() {
        "LLM Wiki Purpose"
    } else {
        project_name
    };
    let template = settings.project_template.trim();
    let output_language = settings.ai_output_language.trim();
    let purpose = if project_purpose.is_empty() {
        "Use this page to keep the wiki goal, scope, and recurring questions visible to readers and agents."
    } else {
        project_purpose
    };
    Some(format!(
        "# {title}\n\n{GENERATED_PURPOSE_MARKER}\n\n## Project Direction\n\n{purpose}\n\n## Operating Context\n\n- Template: `{}`\n- Output language: {}\n\n## Trust Boundary\n\nThis page records user-provided project direction. It is not evidence by itself; source pages, claims, review state, and writeback approvals remain the evidence boundary for synthesis.\n",
        if template.is_empty() {
            "unspecified"
        } else {
            template
        },
        if output_language.is_empty() {
            "unspecified"
        } else {
            output_language
        }
    ))
}

fn sync_project_purpose_note(vault: &Path, settings: &DesktopSettings) -> Result<(), String> {
    let Some(rendered) = render_project_purpose_note(settings) else {
        return Ok(());
    };
    let path = vault.join("purpose.md");
    if path.is_file() {
        let existing = read_text(&path);
        if !existing.contains(GENERATED_PURPOSE_MARKER) {
            return Ok(());
        }
    }
    write_text(&path, &rendered)
}

fn is_loopback_http_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("http://") else {
        return false;
    };
    let authority = rest
        .split(|ch| matches!(ch, '/' | '?' | '#'))
        .next()
        .unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return false;
    }
    if let Some(bracketed) = authority.strip_prefix('[') {
        let Some(end) = bracketed.find(']') else {
            return false;
        };
        let host = &bracketed[..end];
        let suffix = &bracketed[end + 1..];
        return host == "::1" && (suffix.is_empty() || suffix.starts_with(':'));
    }
    let host = authority.split(':').next().unwrap_or("");
    matches!(host, "localhost" | "127.0.0.1")
}

fn validate_desktop_settings(settings: &DesktopSettings) -> Result<(), String> {
    let web_search_provider = settings.web_search_provider.trim().to_ascii_lowercase();
    let web_search_endpoint = settings.web_search_endpoint.trim();
    if web_search_provider == "searxng" && !web_search_endpoint.is_empty() {
        let lower = web_search_endpoint.to_ascii_lowercase();
        if !(lower.starts_with("https://") || is_loopback_http_url(web_search_endpoint)) {
            return Err("SearXNG endpoint must use HTTPS unless it is localhost HTTP".to_string());
        }
    }
    Ok(())
}

fn normalize_desktop_settings(mut settings: DesktopSettings) -> Result<DesktopSettings, String> {
    settings.default_pdf_parser = selected_pdf_parser(&settings.default_pdf_parser)?;
    settings.scheduled_import_path =
        normalize_scheduled_import_path(&settings.scheduled_import_path)?;
    settings.source_watch_auto_ingest = false;
    Ok(settings)
}

#[tauri::command]
fn load_desktop_settings(vault_path: String) -> Result<DesktopSettings, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let path = desktop_settings_path(&vault);
    if !path.is_file() {
        return Ok(DesktopSettings::default());
    }
    let mut settings = serde_json::from_str::<DesktopSettings>(&read_text(&path))
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
    if std::env::var("OPEN_LLM_WIKI_LAYOUT_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .is_some()
        || std::env::var("LLM_WIKI_LAYOUT_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some()
    {
        settings.layout_parsing_token_present = true;
    }
    normalize_desktop_settings(settings)
}

#[tauri::command]
fn save_desktop_settings(
    vault_path: String,
    mut settings: DesktopSettings,
) -> Result<DesktopSettings, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    settings.layout_parsing_token_present = settings.layout_parsing_token_present
        || std::env::var("OPEN_LLM_WIKI_LAYOUT_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some()
        || std::env::var("LLM_WIKI_LAYOUT_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .is_some();
    settings = normalize_desktop_settings(settings)?;
    settings.layout_parsing_api_url =
        validate_layout_parsing_api_url(&settings.layout_parsing_api_url)?;
    settings.embedding_endpoint = validate_embedding_endpoint(&settings.embedding_endpoint)?;
    settings.captioning_endpoint = validate_captioning_endpoint(&settings.captioning_endpoint)?;
    validate_desktop_settings(&settings)?;
    let rendered = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("failed to serialize desktop settings: {e}"))?;
    write_text(&desktop_settings_path(&vault), &(rendered + "\n"))?;
    sync_project_purpose_note(&vault, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn check_local_llm_cli(command: String) -> Result<LlmCliCheckResult, String> {
    let command = match command.trim() {
        "codex" => "codex",
        "claude" | "claude-code" => "claude",
        other => {
            return Err(format!(
                "unsupported local LLM CLI '{other}', expected codex or claude"
            ))
        }
    };
    let lookup_spec = local_cli_lookup_command(current_desktop_platform(), command);
    let lookup = lookup_spec
        .command()
        .output()
        .map_err(|e| format!("failed to check {command}: {e}"))?;
    if !lookup.status.success() {
        return Ok(LlmCliCheckResult {
            command: command.to_string(),
            available: false,
            version: None,
            path: None,
            message: format!("{command} was not found on PATH"),
        });
    }
    let path = String::from_utf8_lossy(&lookup.stdout).trim().to_string();
    let version = Command::new(command)
        .arg("--version")
        .output()
        .ok()
        .and_then(|output| {
            let rendered = if output.stdout.is_empty() {
                String::from_utf8_lossy(&output.stderr).to_string()
            } else {
                String::from_utf8_lossy(&output.stdout).to_string()
            };
            rendered
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(ToString::to_string)
        });
    Ok(LlmCliCheckResult {
        command: command.to_string(),
        available: true,
        version,
        path: (!path.is_empty()).then_some(path),
        message: format!("{command} is available"),
    })
}

fn sanitize_env_var_name(value: &str) -> Result<String, String> {
    let name = value.trim();
    if name.is_empty() {
        return Err("API key environment variable is required".to_string());
    }
    if name.len() > 128 {
        return Err("API key environment variable is too long".to_string());
    }
    if !name
        .chars()
        .all(|ch| ch == '_' || ch.is_ascii_uppercase() || ch.is_ascii_digit())
    {
        return Err(
            "API key environment variable must use uppercase letters, digits, or underscore"
                .to_string(),
        );
    }
    Ok(name.to_string())
}

#[tauri::command]
fn check_llm_api_key(
    provider_id: String,
    api_key_env_var: String,
) -> Result<LlmApiKeyCheckResult, String> {
    let provider_id = provider_id.trim().to_string();
    if provider_id.is_empty() {
        return Err("provider id is required".to_string());
    }
    let env_var = sanitize_env_var_name(&api_key_env_var)?;
    let available = std::env::var(&env_var)
        .ok()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let message = if available {
        format!("{env_var} is configured for {provider_id}")
    } else {
        format!("{env_var} is not visible to this desktop process")
    };
    Ok(LlmApiKeyCheckResult {
        provider_id,
        env_var,
        available,
        message,
    })
}

fn sanitize_optional_env_var_name(value: &str) -> Result<Option<String>, String> {
    let name = value.trim();
    if name.is_empty() {
        return Ok(None);
    }
    sanitize_env_var_name(name).map(Some)
}

fn is_local_http_endpoint(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix("http://") else {
        return false;
    };
    let authority = rest
        .split(|ch| matches!(ch, '/' | '?' | '#'))
        .next()
        .unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return false;
    }
    if let Some(bracketed) = authority.strip_prefix('[') {
        let Some(end) = bracketed.find(']') else {
            return false;
        };
        let host = &bracketed[..end];
        let suffix = &bracketed[end + 1..];
        return host == "::1" && (suffix.is_empty() || suffix.starts_with(':'));
    }
    let host = authority.split(':').next().unwrap_or("");
    matches!(host, "localhost" | "127.0.0.1")
}

fn validate_llm_base_url(value: &str) -> Result<String, String> {
    let base = value.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("API Base URL is required for model calls".to_string());
    }
    if base.starts_with("https://") || is_local_http_endpoint(&base) {
        return Ok(base);
    }
    Err("Only HTTPS endpoints or localhost HTTP endpoints are allowed for model calls".to_string())
}

fn is_exact_loopback_http_endpoint(value: &str) -> bool {
    let trimmed = value.trim();
    if !trimmed.to_ascii_lowercase().starts_with("http://") {
        return false;
    }
    let rest = &trimmed["http://".len()..];
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return false;
    }
    if let Some(after_open) = authority.strip_prefix('[') {
        let Some(close_index) = after_open.find(']') else {
            return false;
        };
        let host = &after_open[..close_index];
        let suffix = &after_open[close_index + 1..];
        if !suffix.is_empty() {
            let Some(port) = suffix.strip_prefix(':') else {
                return false;
            };
            if port.is_empty() || !port.chars().all(|ch| ch.is_ascii_digit()) {
                return false;
            }
        }
        return host.eq_ignore_ascii_case("::1");
    }
    let mut pieces = authority.splitn(2, ':');
    let host = pieces.next().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() {
        return false;
    }
    if let Some(port) = pieces.next() {
        if port.is_empty() || !port.chars().all(|ch| ch.is_ascii_digit()) {
            return false;
        }
    }
    matches!(host.as_str(), "localhost" | "127.0.0.1")
}

fn validate_layout_parsing_api_url(value: &str) -> Result<String, String> {
    let api_url = value.trim().to_string();
    if api_url.is_empty() {
        return Ok(api_url);
    }
    if api_url.to_ascii_lowercase().starts_with("https://")
        || is_exact_loopback_http_endpoint(&api_url)
    {
        return Ok(api_url);
    }
    Err("Layout parsing API URL must use HTTPS unless it is localhost HTTP".to_string())
}

fn validate_embedding_endpoint(value: &str) -> Result<String, String> {
    let endpoint = value.trim().to_string();
    if endpoint.is_empty() {
        return Ok(endpoint);
    }
    if endpoint.to_ascii_lowercase().starts_with("https://")
        || is_exact_loopback_http_endpoint(&endpoint)
    {
        return Ok(endpoint);
    }
    Err("Embedding endpoint must use HTTPS unless it is localhost HTTP".to_string())
}

fn validate_captioning_endpoint(value: &str) -> Result<String, String> {
    let endpoint = value.trim().to_string();
    if endpoint.is_empty() {
        return Ok(endpoint);
    }
    if endpoint.to_ascii_lowercase().starts_with("https://")
        || is_exact_loopback_http_endpoint(&endpoint)
    {
        return Ok(endpoint);
    }
    Err("Captioning endpoint must use HTTPS unless it is localhost HTTP".to_string())
}

fn openai_chat_completions_url(base: &str) -> String {
    if base.to_ascii_lowercase().ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

fn anthropic_messages_url(base: &str) -> String {
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/v1/messages") || lower.ends_with("/messages") {
        base.to_string()
    } else if lower.ends_with("/v1") || lower.ends_with("/v2") || lower.ends_with("/v3") {
        format!("{base}/messages")
    } else {
        format!("{base}/v1/messages")
    }
}

fn anthropic_uses_bearer_auth(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://api.minimax.io/anthropic")
        || lower.starts_with("https://api.minimaxi.com/anthropic")
        || lower.starts_with("https://coding.dashscope.aliyuncs.com/apps/anthropic")
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        let ch = *byte as char;
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
            out.push(ch);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn read_llm_api_key(env_var: Option<&str>) -> Result<Option<String>, String> {
    let Some(env_var) = env_var else {
        return Ok(None);
    };
    let value = env::var(env_var)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Ok(value)
}

fn short_error_body(value: &str) -> String {
    let text = value.replace('\n', " ").trim().to_string();
    if text.len() <= 600 {
        text
    } else {
        format!("{}...", &text[..600])
    }
}

fn build_llm_answer_prompts(request: &LlmAnswerRequest) -> (String, String) {
    let is_zh = request.language == "zh";
    let system = if is_zh {
        "你是 LLM Wiki 的证据回答生成器。只能基于用户提供的知识库证据回答；必须区分证据、推断、假设和预测；不能声称已经写回或批准；不能输出隐藏推理过程。"
    } else {
        "You are the evidence answer composer for LLM Wiki. Answer only from the supplied vault evidence; distinguish evidence, inference, hypothesis, and forecast; do not claim that anything was written back or approved; do not expose hidden reasoning."
    };
    let evidence = if request.evidence.is_empty() {
        if is_zh {
            "未提供已加载证据。".to_string()
        } else {
            "No loaded evidence was supplied.".to_string()
        }
    } else {
        request
            .evidence
            .iter()
            .take(12)
            .enumerate()
            .map(|(index, item)| {
                let status = item
                    .status
                    .as_deref()
                    .or(item.severity.as_deref())
                    .unwrap_or("loaded");
                let evidence = item.evidence.as_deref().unwrap_or("");
                let relations = if item.relations.is_empty() {
                    "".to_string()
                } else {
                    format!("\n  relations: {}", item.relations.join(" | "))
                };
                format!(
                    "E{} [{}] {} ({})\n  id: {}\n  status: {}\n  snippet: {}\n  evidence: {}{}",
                    index + 1,
                    item.evidence_type,
                    item.title,
                    item.path,
                    item.id,
                    status,
                    item.snippet,
                    evidence,
                    relations
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    };
    let user = if is_zh {
        format!(
            "问题：{}\n\n写回目标：{}\n\n可用证据：\n{}\n\n请用简体中文输出，结构必须包含：\n1. Evidence / 证据\n2. Inference / 推断\n3. Hypothesis / 假设\n4. Forecast / 预测\n5. Writeback plan / 写回计划\n\n要求：每条确定性结论必须引用 E 编号；证据不足时标为 unsupported draft；预测必须写成可能性，不要写成事实；写回计划必须列出 target page、diff preview、evidence map、risk 和 human confirmation checklist。",
            request.question.trim(),
            request.target_path.trim(),
            evidence
        )
    } else {
        format!(
            "Question: {}\n\nWriteback target: {}\n\nAvailable evidence:\n{}\n\nAnswer in English with these sections:\n1. Evidence\n2. Inference\n3. Hypothesis\n4. Forecast\n5. Writeback plan\n\nEvery deterministic conclusion must cite E references. If evidence is insufficient, mark the answer as an unsupported draft. Forecasts must be phrased as possibilities, not facts. The writeback plan must list target page, diff preview, evidence map, risk, and human confirmation checklist.",
            request.question.trim(),
            request.target_path.trim(),
            evidence
        )
    };
    let user = if is_zh {
        format!(
            "模型配置：上下文窗口 {} 令牌；推理强度 {}。\n\n{}",
            request.context_window, request.reasoning_mode, user
        )
    } else {
        format!(
            "Model config: context window {} tokens; reasoning mode {}.\n\n{}",
            request.context_window, request.reasoning_mode, user
        )
    };
    (system.to_string(), user)
}

fn parse_openai_answer(value: &serde_json::Value) -> Result<String, String> {
    if let Some(error) = value.get("error") {
        return Err(format!(
            "provider error: {}",
            short_error_body(&error.to_string())
        ));
    }
    let message = value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .ok_or_else(|| "provider response did not include choices[0].message".to_string())?;
    if let Some(content) = message.get("content").and_then(|content| content.as_str()) {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Some(parts) = message
        .get("content")
        .and_then(|content| content.as_array())
    {
        let text = parts
            .iter()
            .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
            .collect::<Vec<_>>()
            .join("");
        if !text.trim().is_empty() {
            return Ok(text.trim().to_string());
        }
    }
    Err("provider returned an empty assistant message".to_string())
}

fn parse_anthropic_answer(value: &serde_json::Value) -> Result<String, String> {
    if let Some(error) = value.get("error") {
        return Err(format!(
            "provider error: {}",
            short_error_body(&error.to_string())
        ));
    }
    let text = value
        .get("content")
        .and_then(|content| content.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    if text.trim().is_empty() {
        Err("provider returned no Anthropic content text".to_string())
    } else {
        Ok(text.trim().to_string())
    }
}

fn parse_gemini_answer(value: &serde_json::Value) -> Result<String, String> {
    if let Some(error) = value.get("error") {
        return Err(format!(
            "provider error: {}",
            short_error_body(&error.to_string())
        ));
    }
    let parts = value
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .ok_or_else(|| {
            "provider response did not include candidates[0].content.parts".to_string()
        })?;
    let text = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
        .collect::<Vec<_>>()
        .join("");
    if text.trim().is_empty() {
        Err("provider returned no Gemini text parts".to_string())
    } else {
        Ok(text.trim().to_string())
    }
}

#[tauri::command]
async fn generate_llm_answer(
    vault_path: String,
    request: LlmAnswerRequest,
) -> Result<LlmAnswerResult, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let protocol = request.api_protocol.trim().to_ascii_lowercase();
    let base_url = validate_llm_base_url(&request.api_base_url)?;
    let env_var = sanitize_optional_env_var_name(&request.api_key_env_var)?;
    let api_key = read_llm_api_key(env_var.as_deref())?;
    if api_key.is_none() && !is_local_http_endpoint(&base_url) {
        let label = env_var.unwrap_or_else(|| "API key environment variable".to_string());
        return Err(format!("{label} is not visible to this desktop process"));
    }
    let model = request.model.trim().to_string();
    if model.is_empty() {
        return Err("model is required for provider answer generation".to_string());
    }
    let (system_prompt, user_prompt) = build_llm_answer_prompts(&request);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("failed to create HTTP client: {e}"))?;

    let (url, body, parser_kind) = if protocol == "anthropic-compatible"
        || (protocol == "native" && request.provider_id == "anthropic")
    {
        (
            anthropic_messages_url(&base_url),
            serde_json::json!({
                "model": model.as_str(),
                "system": system_prompt,
                "messages": [{ "role": "user", "content": user_prompt }],
                "max_tokens": 1800,
                "stream": false
            }),
            "anthropic",
        )
    } else if protocol == "native" && request.provider_id == "google" {
        (
            format!(
                "{}/models/{}:generateContent",
                base_url,
                percent_encode_path_segment(&model)
            ),
            serde_json::json!({
                "systemInstruction": { "parts": [{ "text": system_prompt }] },
                "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
                "generationConfig": { "maxOutputTokens": 1800 }
            }),
            "gemini",
        )
    } else {
        (
            openai_chat_completions_url(&base_url),
            serde_json::json!({
                "model": model.as_str(),
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_prompt }
                ],
                "stream": false
            }),
            "openai",
        )
    };

    let mut builder = client.post(&url).header("Content-Type", "application/json");
    if let Some(token) = api_key.as_deref() {
        if parser_kind == "gemini" {
            builder = builder.header("x-goog-api-key", token);
        } else if parser_kind == "anthropic" && !anthropic_uses_bearer_auth(&url) {
            builder = builder
                .header("x-api-key", token)
                .header("anthropic-version", "2023-06-01");
        } else {
            builder = builder.header("Authorization", format!("Bearer {token}"));
        }
    }
    if is_local_http_endpoint(&base_url) {
        builder = builder.header("Origin", "http://localhost");
    }

    let response = builder
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("model request failed: {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("failed to read model response: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "model request returned HTTP {}: {}",
            status.as_u16(),
            short_error_body(&text)
        ));
    }
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("provider returned non-JSON response: {e}"))?;
    let answer = match parser_kind {
        "anthropic" => parse_anthropic_answer(&value)?,
        "gemini" => parse_gemini_answer(&value)?,
        _ => parse_openai_answer(&value)?,
    };

    Ok(LlmAnswerResult {
        provider_id: request.provider_id,
        provider_name: request.provider_name,
        model,
        protocol,
        generated_at: Local::now().to_rfc3339(),
        answer,
        evidence_count: request.evidence.len(),
    })
}

fn qa_report_for_source(
    vault: &Path,
    source_id: Option<&str>,
    source_page: Option<&str>,
) -> Option<String> {
    if let Some(source_id) = source_id {
        let path = vault.join("qa-reports").join(format!("{source_id}.md"));
        if path.is_file() {
            return Some(rel_path(vault, &path));
        }
    }
    if let Some(source_page) = source_page {
        let stem = Path::new(source_page)
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or_default();
        if !stem.is_empty() {
            let path = vault.join("qa-reports").join(format!("{stem}.md"));
            if path.is_file() {
                return Some(rel_path(vault, &path));
            }
        }
    }
    None
}

#[tauri::command]
fn list_evidence_paths(vault_path: String) -> Result<Vec<EvidencePathItem>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let plan = plan_ingest(to_display(&vault))?;
    let registry_by_uuid = plan
        .registry
        .iter()
        .map(|entry| (entry.source_uuid.clone(), entry.clone()))
        .collect::<HashMap<_, _>>();
    let registry_by_id = plan
        .registry
        .iter()
        .filter_map(|entry| entry.source_id.clone().map(|id| (id, entry.clone())))
        .collect::<HashMap<_, _>>();
    let artifact_by_source = plan
        .artifacts
        .iter()
        .map(|artifact| (artifact.source_uuid.clone(), artifact.clone()))
        .collect::<HashMap<_, _>>();
    let lint_by_claim = plan
        .lint_findings
        .iter()
        .filter(|finding| finding.object_type == "claim")
        .map(|finding| (finding.object_id.clone(), finding.clone()))
        .collect::<HashMap<_, _>>();

    let items = claim_ledger_items(&vault)
        .into_iter()
        .map(|claim| {
            let registry = claim
                .source_uuid
                .as_ref()
                .and_then(|uuid| registry_by_uuid.get(uuid))
                .or_else(|| {
                    claim
                        .source_id
                        .as_ref()
                        .and_then(|id| registry_by_id.get(id))
                });
            let artifact = claim
                .source_uuid
                .as_ref()
                .and_then(|uuid| artifact_by_source.get(uuid))
                .or_else(|| registry.and_then(|entry| artifact_by_source.get(&entry.source_uuid)));
            let source_page = registry
                .and_then(|entry| entry.source_page.clone())
                .or_else(|| claim.source_path.clone());
            let qa_report = qa_report_for_source(
                &vault,
                claim
                    .source_id
                    .as_deref()
                    .or_else(|| registry.and_then(|entry| entry.source_id.as_deref())),
                source_page.as_deref(),
            );
            let mut missing = Vec::new();
            if claim.source_uuid.is_none()
                && claim.source_id.is_none()
                && claim.source_path.is_none()
            {
                missing.push("missing source".to_string());
            }
            if registry.is_none()
                && source_page
                    .as_ref()
                    .is_none_or(|path| !vault.join(path).is_file())
            {
                missing.push("missing source page".to_string());
            }
            if claim.evidence_quote.is_none() || claim.evidence_hash.is_none() {
                missing.push("missing evidence".to_string());
            }
            if artifact.is_none()
                || artifact.is_some_and(|item| !vault.join(&item.artifact_path).is_file())
            {
                missing.push("missing raw/artifact".to_string());
            }
            if qa_report.is_none() {
                missing.push("missing QA".to_string());
            }
            if claim.needs_review || claim.verdict == "needs_review" {
                missing.push("needs science review".to_string());
            }
            missing.sort();
            missing.dedup();
            let chain_status = if missing.iter().any(|item| item.starts_with("missing")) {
                "broken"
            } else if missing.iter().any(|item| item.contains("review")) {
                "needs_review"
            } else {
                "ok"
            }
            .to_string();
            let semantic_status = lint_by_claim
                .get(&claim.claim_id)
                .map(|finding| format!("{}:{}", finding.severity, finding.kind));
            EvidencePathItem {
                claim_id: claim.claim_id,
                concept: claim.concepts.first().cloned(),
                claim_text: claim.claim_text,
                chain_status,
                missing,
                source_id: claim
                    .source_id
                    .or_else(|| registry.and_then(|entry| entry.source_id.clone())),
                source_uuid: claim
                    .source_uuid
                    .or_else(|| registry.map(|entry| entry.source_uuid.clone())),
                source_page,
                evidence_anchor: claim.chunk_id.or(claim.evidence_hash.clone()),
                evidence_quote: claim.evidence_quote,
                raw_path: registry.map(|entry| entry.raw_path.clone()),
                artifact_path: artifact.map(|item| item.artifact_path.clone()),
                chunks_path: artifact.and_then(|item| item.chunks_path.clone()),
                qa_report_path: qa_report,
                semantic_status,
                science_review_status: claim.needs_review.then(|| "needs_review".to_string()),
            }
        })
        .collect();
    Ok(items)
}

fn missing_anchor_hint(finding: &ContractFinding) -> String {
    for marker in ["missing heading", "heading anchor", "anchor", "not found"] {
        if finding.detail.to_ascii_lowercase().contains(marker) {
            return finding.detail.clone();
        }
    }
    finding.title.clone()
}

fn traceability_action_text(
    vault: &Path,
    finding: &ContractFinding,
    source_path: Option<&str>,
    claim_text: Option<&str>,
) -> String {
    let context = format!(
        "{} {} {} {}",
        vault
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase(),
        source_path.unwrap_or_default().to_ascii_lowercase(),
        claim_text.unwrap_or_default().to_ascii_lowercase(),
        finding.detail.to_ascii_lowercase()
    );
    if context.contains("deepseek") {
        return "DeepSeek evidence chain is broken: open the claim, source, and artifact; repair or regenerate the missing anchor; rerun traceability/lint before trusting the insight or query writeback.".to_string();
    }
    if finding.kind == "claim_unknown_source" {
        return "Open the claim ledger and source registry, then connect this claim to a generated source page before review.".to_string();
    }
    if finding.kind == "claim_missing_evidence" {
        return "Open the claim and artifact, restore the evidence quote/hash, then rerun claim extraction or lint.".to_string();
    }
    "Open the claim and source page, repair the cited heading/anchor, then rerun lint after regenerating source pages.".to_string()
}

#[tauri::command]
fn list_traceability_warnings(vault_path: String) -> Result<Vec<TraceabilityWarning>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let plan = plan_ingest(to_display(&vault))?;
    let evidence = list_evidence_paths(to_display(&vault))?;
    let evidence_by_claim = evidence
        .into_iter()
        .map(|item| (item.claim_id.clone(), item))
        .collect::<HashMap<_, _>>();
    let mut warnings = Vec::new();
    for finding in plan.lint_findings.iter().filter(|finding| {
        is_evidence_anchor_finding(finding)
            || finding.kind == "claim_missing_evidence"
            || finding.kind == "claim_unknown_source"
    }) {
        let evidence = evidence_by_claim.get(&finding.object_id);
        let claim_id = if finding.object_type == "claim" {
            finding.object_id.clone()
        } else {
            evidence
                .map(|item| item.claim_id.clone())
                .unwrap_or_else(|| finding.object_id.clone())
        };
        let claim_text = evidence.map(|item| item.claim_text.clone());
        let source_id = evidence.and_then(|item| item.source_id.clone());
        let source_path = evidence
            .and_then(|item| item.source_page.clone())
            .or_else(|| finding.path.clone());
        let artifact_path = evidence.and_then(|item| item.artifact_path.clone());
        let missing_anchor = missing_anchor_hint(finding);
        let next_action = traceability_action_text(
            &vault,
            finding,
            source_path.as_deref(),
            claim_text.as_deref(),
        );
        let summary = format!(
            "Claim {claim_id} cannot be traced to {} because {}.",
            source_path.as_deref().unwrap_or("a generated source page"),
            missing_anchor
        );
        warnings.push(TraceabilityWarning {
            warning_id: format!("trace-{}", finding.finding_id),
            claim_id,
            claim_text,
            claim_path: "claims/claims.jsonl".to_string(),
            source_id,
            source_path,
            artifact_path,
            missing_heading: missing_anchor.clone(),
            missing_anchor,
            severity: finding.severity.clone(),
            summary,
            suggested_action: next_action.clone(),
            next_action,
            finding_id: Some(finding.finding_id.clone()),
        });
    }
    warnings.sort_by(|a, b| {
        a.severity
            .cmp(&b.severity)
            .then(a.claim_id.cmp(&b.claim_id))
    });
    Ok(warnings)
}

fn review_decisions(vault: &Path) -> HashMap<String, String> {
    read_text(&vault.join("_state").join("review-decisions.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .filter_map(|value| {
            Some((
                json_string(&value, "item_id").or_else(|| json_string(&value, "itemId"))?,
                json_string(&value, "status")?,
            ))
        })
        .collect()
}

fn push_review_item(
    items: &mut Vec<ReviewQueueItem>,
    decisions: &HashMap<String, String>,
    mut item: ReviewQueueItem,
) {
    if let Some(status) = decisions.get(&item.item_id) {
        item.status = status.clone();
    }
    items.push(item);
}

#[tauri::command]
fn list_review_queue(vault_path: String) -> Result<Vec<ReviewQueueItem>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let plan = plan_ingest(to_display(&vault))?;
    let decisions = review_decisions(&vault);
    let mut items = Vec::new();

    for path in list_markdown(&vault.join("drafts")) {
        let rel = rel_path(&vault, &path);
        push_review_item(
            &mut items,
            &decisions,
            ReviewQueueItem {
                item_id: format!("draft:{rel}"),
                kind: "draft_qa".to_string(),
                severity: "p2".to_string(),
                title: format!(
                    "draft 待 QA: {}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
                body: "draft 不能直接进入 sources，需要 runtime QA/publish。".to_string(),
                status: "open".to_string(),
                target_path: Some(rel),
                source_id: None,
                claim_id: None,
                evidence_path: None,
                recommended_action: "open_draft_or_run_ingest".to_string(),
            },
        );
    }

    for file in list_markdown(&vault.join("sources")) {
        if qa_verdict(&vault.join("qa-reports").join(format!(
            "{}.md",
            file.file_stem().and_then(OsStr::to_str).unwrap_or_default()
        ))) == Some("FAIL".to_string())
        {
            let rel = rel_path(&vault, &file);
            push_review_item(
                &mut items,
                &decisions,
                ReviewQueueItem {
                    item_id: format!("qa_failed:{rel}"),
                    kind: "qa_failed_source".to_string(),
                    severity: "p1".to_string(),
                    title: format!(
                        "QA failed: {}",
                        file.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    body: "source QA report 为 FAIL，相关 claims 不应进入长期 synthesis。"
                        .to_string(),
                    status: "open".to_string(),
                    target_path: Some(rel),
                    source_id: file
                        .file_stem()
                        .and_then(OsStr::to_str)
                        .map(ToString::to_string),
                    claim_id: None,
                    evidence_path: None,
                    recommended_action: "open_qa_report".to_string(),
                },
            );
        }
    }

    for claim in claim_ledger_items(&vault) {
        if claim.needs_review
            || matches!(
                claim.verdict.as_str(),
                "needs_review" | "stale" | "contradicted"
            )
        {
            push_review_item(
                &mut items,
                &decisions,
                ReviewQueueItem {
                    item_id: format!("claim:{}", claim.claim_id),
                    kind: "claim_review".to_string(),
                    severity: "p1".to_string(),
                    title: format!("claim 需要审核: {}", claim.claim_id),
                    body: claim.claim_text.clone(),
                    status: claim.verdict.clone(),
                    target_path: Some("claims/claims.jsonl".to_string()),
                    source_id: claim.source_id.clone(),
                    claim_id: Some(claim.claim_id.clone()),
                    evidence_path: claim.source_path.clone(),
                    recommended_action: "approve_or_reject_claim".to_string(),
                },
            );
        }
    }

    for finding in plan
        .lint_findings
        .iter()
        .filter(|finding| matches!(finding.severity.as_str(), "p0" | "p1"))
    {
        push_review_item(
            &mut items,
            &decisions,
            ReviewQueueItem {
                item_id: format!("lint:{}", finding.finding_id),
                kind: "semantic_or_contract_finding".to_string(),
                severity: finding.severity.clone(),
                title: finding.title.clone(),
                body: finding.detail.clone(),
                status: finding.status.clone(),
                target_path: finding.path.clone(),
                source_id: None,
                claim_id: (finding.object_type == "claim").then(|| finding.object_id.clone()),
                evidence_path: finding.path.clone(),
                recommended_action: "rerun_lint_after_fix".to_string(),
            },
        );
    }

    for (index, line) in read_text(&vault.join("_state").join("science-review-queue.jsonl"))
        .lines()
        .enumerate()
    {
        if line.trim().is_empty() {
            continue;
        }
        let value = serde_json::from_str::<serde_json::Value>(line)
            .unwrap_or_else(|_| serde_json::json!({}));
        let id = json_string(&value, "id")
            .or_else(|| json_string(&value, "claim_id"))
            .unwrap_or_else(|| format!("line-{}", index + 1));
        push_review_item(
            &mut items,
            &decisions,
            ReviewQueueItem {
                item_id: format!("science_review:{id}"),
                kind: "science_review".to_string(),
                severity: "p2".to_string(),
                title: json_string(&value, "title")
                    .unwrap_or_else(|| format!("science review: {id}")),
                body: json_string(&value, "reason")
                    .or_else(|| json_string(&value, "body"))
                    .unwrap_or_else(|| line.to_string()),
                status: json_string(&value, "status").unwrap_or_else(|| "open".to_string()),
                target_path: Some("_state/science-review-queue.jsonl".to_string()),
                source_id: json_string(&value, "source_id"),
                claim_id: json_string(&value, "claim_id"),
                evidence_path: json_string(&value, "evidence_path"),
                recommended_action: "approve_or_reject_science_review".to_string(),
            },
        );
    }
    items.sort_by(|a, b| a.severity.cmp(&b.severity).then(a.kind.cmp(&b.kind)));
    Ok(items)
}

#[tauri::command]
fn set_review_item_status(
    vault_path: String,
    item_id: String,
    status: String,
    note: Option<String>,
) -> Result<Vec<ReviewQueueItem>, String> {
    validate_status(
        &status,
        &[
            "open",
            "approved",
            "rejected",
            "resolved",
            "ignored",
            "needs_review",
        ],
    )?;
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let row = serde_json::json!({
        "item_id": item_id,
        "status": status,
        "note": note.unwrap_or_default(),
        "updated_at": Local::now().to_rfc3339(),
    });
    append_jsonl_value(&vault.join("_state").join("review-decisions.jsonl"), &row)?;
    if row
        .get("item_id")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|id| id.starts_with("science_review:"))
    {
        append_jsonl_value(
            &vault.join("_state").join("science-review-decisions.jsonl"),
            &row,
        )?;
    }
    if let Some(claim_id) = row
        .get("item_id")
        .and_then(serde_json::Value::as_str)
        .and_then(|id| id.strip_prefix("claim:"))
    {
        let verdict = match row
            .get("status")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
        {
            "approved" | "resolved" => "supported",
            "rejected" => "ignored",
            "needs_review" => "needs_review",
            _ => "",
        };
        if !verdict.is_empty() {
            let _ = set_claim_verdict(
                to_display(&vault),
                claim_id.to_string(),
                verdict.to_string(),
            );
        }
    }
    list_review_queue(to_display(&vault))
}

#[tauri::command]
fn create_followup_action(
    vault_path: String,
    title: String,
    body: String,
    target_path: Option<String>,
) -> Result<Vec<ReviewQueueItem>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let action_id = format!(
        "followup-{}",
        short_hash(&sha256_text(&format!("{}:{body}", title)))
    );
    let row = serde_json::json!({
        "id": action_id,
        "title": title,
        "body": body,
        "target_path": target_path,
        "status": "open",
        "created_at": Local::now().to_rfc3339(),
        "source": "llm-wiki-desktop-review-workbench"
    });
    append_jsonl_value(&vault.join("_state").join("growth-queue.jsonl"), &row)?;
    append_jsonl_value(
        &vault.join("_state").join("desktop-followup-actions.jsonl"),
        &row,
    )?;
    list_review_queue(to_display(&vault))
}

fn resolve_vault_target(vault: &Path, target_path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(target_path);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        vault.join(candidate)
    };
    ensure_inside(
        &resolved,
        vault,
        "writeback target must stay inside the vault",
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WritebackTargetKind {
    Concept,
    ReviewProposal,
}

fn writeback_target_kind(vault: &Path, target: &Path) -> Result<WritebackTargetKind, String> {
    let target_resolved =
        resolve_with_existing_parent(target).unwrap_or_else(|_| target.to_path_buf());
    let concepts_root = vault.join("concepts");
    let concepts_resolved = resolve_with_existing_parent(&concepts_root).unwrap_or(concepts_root);
    if target_resolved.starts_with(&concepts_resolved) {
        return Ok(WritebackTargetKind::Concept);
    }
    let review_root = vault.join("reviews").join("query-writeback");
    let review_resolved = resolve_with_existing_parent(&review_root).unwrap_or(review_root);
    if target_resolved.starts_with(&review_resolved) {
        return Ok(WritebackTargetKind::ReviewProposal);
    }
    Err("writeback target must be under concepts/ or reviews/query-writeback/".to_string())
}

fn query_writeback_proposal_document(title: &str, content: &str, created_at: &str) -> String {
    format!(
        "# Query Writeback Proposal\n\n- created_at: {created_at}\n- status: proposed\n- writeback_applied: false\n- title: {title}\n\n## Proposed Content\n\n{}\n\n## Approval Gate\n\n- This proposal is review evidence only.\n- Do not copy it into source or concept pages until a human explicitly approves the writeback target and content.\n",
        content.trim()
    )
}

fn simple_diff(old: &str, new: &str) -> String {
    if old == new {
        return "(no textual changes)\n".to_string();
    }
    let old_lines = old.lines().collect::<Vec<_>>();
    let new_lines = new.lines().collect::<Vec<_>>();
    let max_len = old_lines.len().max(new_lines.len());
    let mut out = String::new();
    for index in 0..max_len {
        match (old_lines.get(index), new_lines.get(index)) {
            (Some(left), Some(right)) if left == right => {
                out.push_str("  ");
                out.push_str(left);
                out.push('\n');
            }
            (Some(left), Some(right)) => {
                out.push_str("- ");
                out.push_str(left);
                out.push('\n');
                out.push_str("+ ");
                out.push_str(right);
                out.push('\n');
            }
            (Some(left), None) => {
                out.push_str("- ");
                out.push_str(left);
                out.push('\n');
            }
            (None, Some(right)) => {
                out.push_str("+ ");
                out.push_str(right);
                out.push('\n');
            }
            (None, None) => {}
        }
    }
    out
}

fn writeback_proposals_dir(vault: &Path) -> PathBuf {
    vault.join("_state").join("writeback-proposals")
}

fn writeback_proposal_path(vault: &Path, proposal_id: &str) -> PathBuf {
    writeback_proposals_dir(vault).join(format!("{proposal_id}.json"))
}

#[derive(Default)]
struct WritebackProposalState {
    proposals: Vec<WritebackProposal>,
    invalid_paths: Vec<String>,
}

fn read_writeback_proposal_state(vault: &Path) -> WritebackProposalState {
    let mut state = WritebackProposalState::default();
    if let Ok(read_dir) = fs::read_dir(writeback_proposals_dir(vault)) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(OsStr::to_str) != Some("json") {
                continue;
            }
            match serde_json::from_str::<WritebackProposal>(&read_text(&path)) {
                Ok(proposal) => state.proposals.push(proposal),
                Err(_) => state.invalid_paths.push(rel_path(vault, &path)),
            }
        }
    }
    state
        .proposals
        .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    state.invalid_paths.sort();
    state
}

fn writeback_proposal_contract_issues(vault: &Path, proposal: &WritebackProposal) -> Vec<String> {
    let mut issues = Vec::new();
    if proposal.diff.trim().is_empty() {
        issues.push("missing diff preview".to_string());
    }
    if proposal.applied_at.is_some() {
        issues.push("proposed proposal has applied_at set".to_string());
    }
    let target = match resolve_vault_target(vault, &proposal.target_path) {
        Ok(target) => target,
        Err(error) => {
            issues.push(error);
            return issues;
        }
    };
    let extension = target
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
        issues.push("target is not Markdown or text".to_string());
    }
    match writeback_target_kind(vault, &target) {
        Ok(WritebackTargetKind::ReviewProposal) => {
            let content = proposal.content.to_ascii_lowercase();
            if !content.contains("writeback_applied: false") {
                issues.push("missing writeback_applied: false marker".to_string());
            }
            if !content.contains("approval gate") || !content.contains("human") {
                issues.push("missing human approval gate".to_string());
            }
        }
        Ok(WritebackTargetKind::Concept) => {
            if !target.is_file() {
                issues.push("concept target is missing".to_string());
            }
        }
        Err(error) => issues.push(error),
    }
    issues
}

fn save_writeback_proposal(vault: &Path, proposal: &WritebackProposal) -> Result<(), String> {
    let rendered = serde_json::to_string_pretty(proposal)
        .map_err(|e| format!("failed to serialize writeback proposal: {e}"))?;
    write_text(
        &writeback_proposal_path(vault, &proposal.proposal_id),
        &(rendered + "\n"),
    )
}

fn load_writeback_proposal(vault: &Path, proposal_id: &str) -> Result<WritebackProposal, String> {
    let path = writeback_proposal_path(vault, proposal_id);
    serde_json::from_str(&read_text(&path))
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))
}

fn markdown_bullet_value(text: &str, key: &str) -> Option<String> {
    let prefix = format!("- {key}:");
    text.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix(&prefix)
            .map(|value| value.trim().trim_matches('`').trim_matches('"').to_string())
            .filter(|value| !value.is_empty())
    })
}

fn fenced_diff(text: &str) -> String {
    let mut in_diff = false;
    let mut diff = String::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if !in_diff && trimmed == "```diff" {
            in_diff = true;
            continue;
        }
        if in_diff && trimmed == "```" {
            break;
        }
        if in_diff {
            diff.push_str(line);
            diff.push('\n');
        }
    }
    diff
}

fn review_artifact_writeback_proposal(vault: &Path, path: &Path) -> Option<WritebackProposal> {
    let text = read_text(path);
    if !text.contains("# Query Writeback Proposal") || !text.contains("writeback_applied: false") {
        return None;
    }
    let relative = rel_path(vault, path);
    let now = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| {
            let datetime: DateTime<Local> = modified.into();
            datetime.to_rfc3339()
        })
        .unwrap_or_else(|_| Local::now().to_rfc3339());
    let timestamp = markdown_bullet_value(&text, "generated_at")
        .or_else(|| markdown_bullet_value(&text, "created_at"))
        .unwrap_or(now);
    let title = markdown_bullet_value(&text, "title")
        .or_else(|| markdown_bullet_value(&text, "query"))
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(OsStr::to_str)
                .unwrap_or("query writeback proposal")
                .replace(['-', '_'], " ")
        });
    let diff = fenced_diff(&text);
    Some(WritebackProposal {
        proposal_id: format!("artifact-{}", short_hash(&sha256_text(&relative))),
        target_path: relative,
        title,
        status: "review_only".to_string(),
        diff: if diff.trim().is_empty() {
            text.clone()
        } else {
            diff
        },
        content: text,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        applied_at: None,
        log_path: None,
    })
}

struct QueryEvidenceGate {
    freshness_status: String,
    blocked_reason: Option<String>,
}

fn gate_query_evidence(
    claim: &ClaimLedgerItem,
    sources: &[ReadingSourceRecord],
    artifacts: &[ReadingArtifactRecord],
) -> QueryEvidenceGate {
    let mut reasons = Vec::new();
    let verdict = claim.verdict.to_ascii_lowercase();
    let status = claim.status.to_ascii_lowercase();
    if matches!(verdict.as_str(), "stale" | "contradicted")
        || matches!(status.as_str(), "stale" | "contradicted")
    {
        reasons.push(format!(
            "claim verdict/status is {}/{}",
            claim.verdict, claim.status
        ));
    }
    if claim.evidence_quote.is_none() && claim.evidence_hash.is_none() {
        reasons.push("missing evidence quote/hash anchor".to_string());
    }
    let matched_sources = sources
        .iter()
        .filter(|source| source_record_matches_claim(source, claim))
        .collect::<Vec<_>>();
    if matched_sources.is_empty() {
        if let Some(uuid) = &claim.source_uuid {
            reasons.push(format!("unknown source_uuid {uuid}"));
        } else if claim.source_id.is_some() || claim.source_path.is_some() {
            reasons.push("source registry entry is missing".to_string());
        } else {
            reasons.push("missing source identity".to_string());
        }
    }
    for source in matched_sources {
        if matches!(source.status.as_str(), "stale" | "blocked" | "failed") {
            reasons.push(format!(
                "source {} status is {}",
                source
                    .source_id
                    .as_deref()
                    .unwrap_or(source.source_uuid.as_str()),
                source.status
            ));
        }
        if let Some(artifact) = reading_artifact_for_source(source, artifacts) {
            if artifact.status == "stale" {
                reasons.push(format!("artifact {} is stale", artifact.artifact_path));
            }
            if artifact.contract_valid == Some(false) {
                reasons.push(format!(
                    "artifact {} hash does not match manifest",
                    artifact.artifact_path
                ));
            }
        } else if source.artifact_path.is_some() {
            reasons.push("source artifact contract row is missing".to_string());
        }
    }
    reasons.sort();
    reasons.dedup();

    if reasons.is_empty() {
        let freshness_status = if claim.needs_review || verdict == "needs_review" {
            "needs_review"
        } else {
            "fresh"
        };
        QueryEvidenceGate {
            freshness_status: freshness_status.to_string(),
            blocked_reason: None,
        }
    } else {
        QueryEvidenceGate {
            freshness_status: "blocked".to_string(),
            blocked_reason: Some(reasons.join("; ")),
        }
    }
}

fn query_evidence_items(vault: &Path) -> Vec<QueryEvidence> {
    let sources = reading_source_records(vault);
    let artifacts = reading_artifact_records(vault);
    let mut claims = claim_ledger_items_with_fallback(vault, false)
        .into_iter()
        .filter(|claim| {
            claim.evidence_quote.is_some()
                || claim.evidence_hash.is_some()
                || !claim.claim_text.trim().is_empty()
        })
        .collect::<Vec<_>>();
    claims.sort_by_key(|claim| {
        let review_rank = match claim.verdict.as_str() {
            "supported" => 0,
            "needs_review" => 1,
            "stale" | "contradicted" => 2,
            _ => 3,
        };
        let evidence_rank = usize::from(claim.evidence_quote.is_none());
        (review_rank, evidence_rank, claim.line)
    });
    claims
        .into_iter()
        .take(16)
        .map(|claim| {
            let gate = gate_query_evidence(&claim, &sources, &artifacts);
            let blocked = gate.freshness_status == "blocked";
            let conclusion_type = if blocked {
                "blocked evidence - risk only"
            } else if matches!(claim.verdict.as_str(), "supported") {
                "evidence-backed conclusion"
            } else if matches!(claim.verdict.as_str(), "contradicted" | "stale") {
                "conflict or stale evidence"
            } else {
                "inference needs review"
            };
            let confidence = if blocked {
                "blocked until evidence is repaired"
            } else if matches!(claim.verdict.as_str(), "supported")
                && (claim.evidence_quote.is_some() || claim.evidence_hash.is_some())
            {
                "medium"
            } else if matches!(claim.verdict.as_str(), "contradicted" | "stale") {
                "blocked by conflict"
            } else {
                "low until reviewed"
            };
            QueryEvidence {
                claim_id: claim.claim_id,
                claim_path: "claims/claims.jsonl".to_string(),
                claim_text: claim.claim_text,
                source_id: claim.source_id,
                source_path: claim.source_path,
                evidence_hash: claim.evidence_hash,
                quote: claim.evidence_quote,
                verdict: claim.verdict,
                status: claim.status,
                concepts: claim.concepts,
                conclusion_type: conclusion_type.to_string(),
                confidence: confidence.to_string(),
                freshness_status: gate.freshness_status,
                blocked_reason: gate.blocked_reason,
            }
        })
        .collect()
}

fn is_fresh_supported_query_evidence(item: &QueryEvidence) -> bool {
    item.conclusion_type == "evidence-backed conclusion" && item.freshness_status == "fresh"
}

fn is_stale_or_risky_query_evidence(item: &QueryEvidence) -> bool {
    let verdict = item.verdict.to_ascii_lowercase();
    let status = item.status.to_ascii_lowercase();
    item.freshness_status == "blocked"
        || matches!(verdict.as_str(), "stale" | "contradicted")
        || matches!(
            status.as_str(),
            "stale" | "contradicted" | "blocked" | "failed"
        )
        || item.conclusion_type.contains("risk")
        || item.conclusion_type.contains("stale")
        || item.conclusion_type.contains("conflict")
}

fn query_citation_coverage(evidence: &[QueryEvidence]) -> CitationCoverageSummary {
    let cited = evidence
        .iter()
        .filter(|item| is_fresh_supported_query_evidence(item))
        .count();
    let stale_or_risky = evidence
        .iter()
        .filter(|item| is_stale_or_risky_query_evidence(item))
        .count();
    let review_or_unsupported = evidence
        .iter()
        .filter(|item| {
            !is_fresh_supported_query_evidence(item) && !is_stale_or_risky_query_evidence(item)
        })
        .count();
    let unsupported = review_or_unsupported + usize::from(cited == 0);
    let conclusions = cited + unsupported + stale_or_risky;
    let needs_evidence_review = unsupported > 0 || stale_or_risky > 0;
    CitationCoverageSummary {
        conclusions,
        cited,
        unsupported,
        stale_or_risky,
        needs_evidence_review,
        summary: format!(
            "{conclusions} conclusions / {cited} cited / {unsupported} unsupported / {stale_or_risky} stale-or-risky"
        ),
    }
}

fn render_query_writeback_content(
    vault: &Path,
    query: &str,
    target_path: &str,
    evidence: &[QueryEvidence],
) -> (String, CitationCoverageSummary, Vec<String>, Vec<String>) {
    let status = inspect_vault(to_display(vault)).ok();
    let review_count = status
        .as_ref()
        .map(|status| status.counts.claims_needing_review + status.counts.science_review_queue)
        .unwrap_or_default();
    let contradicted = status
        .as_ref()
        .map(|status| status.counts.contradicted_claims)
        .unwrap_or_default();
    let source_count = status
        .as_ref()
        .map(|status| status.counts.sources)
        .unwrap_or_default();
    let concept_count = status
        .as_ref()
        .map(|status| status.counts.concepts)
        .unwrap_or_default();
    let source_refs = list_markdown(&vault.join("sources"))
        .into_iter()
        .take(8)
        .map(|path| rel_path(vault, &path))
        .collect::<Vec<_>>();
    let concept_refs = list_markdown(&vault.join("concepts"))
        .into_iter()
        .take(8)
        .map(|path| rel_path(vault, &path))
        .collect::<Vec<_>>();
    let coverage = query_citation_coverage(evidence);
    let supported_count = coverage.cited;
    let blocked_evidence = evidence
        .iter()
        .filter(|item| item.freshness_status == "blocked")
        .collect::<Vec<_>>();
    let review_evidence_count = evidence.len().saturating_sub(supported_count);

    let mut evidence_map = String::new();
    if evidence.is_empty() {
        evidence_map.push_str("- No claim evidence with quote/hash was found in this vault.\n");
    } else {
        evidence_map.push_str("### Usable evidence-backed claims\n\n");
        let usable = evidence
            .iter()
            .filter(|item| {
                item.conclusion_type == "evidence-backed conclusion"
                    && item.freshness_status == "fresh"
            })
            .collect::<Vec<_>>();
        if usable.is_empty() {
            evidence_map
                .push_str("- No fresh supported evidence can be used as a firm conclusion.\n");
        } else {
            for item in usable {
                evidence_map.push_str(&format!(
                    "- `{}` ({}) -> {} | claim: {}{}{}{}\n",
                    item.claim_id,
                    item.conclusion_type,
                    item.quote
                        .as_deref()
                        .unwrap_or("evidence hash present, quote missing"),
                    item.claim_text,
                    item.source_path
                        .as_ref()
                        .map(|path| format!(" | source: `{path}`"))
                        .unwrap_or_default(),
                    item.evidence_hash
                        .as_ref()
                        .map(|hash| format!(
                            " | hash: `{}`",
                            hash.chars().take(16).collect::<String>()
                        ))
                        .unwrap_or_default(),
                    if item.concepts.is_empty() {
                        String::new()
                    } else {
                        format!(" | concepts: {}", item.concepts.join(", "))
                    }
                ));
            }
        }
        let needs_review = evidence
            .iter()
            .filter(|item| {
                item.freshness_status != "blocked"
                    && item.conclusion_type != "evidence-backed conclusion"
            })
            .collect::<Vec<_>>();
        if !needs_review.is_empty() {
            evidence_map.push_str("\n### Review-required evidence\n\n");
            for item in needs_review {
                evidence_map.push_str(&format!(
                    "- `{}` ({}) -> claim: {} | status: {}/{}\n",
                    item.claim_id, item.conclusion_type, item.claim_text, item.verdict, item.status
                ));
            }
        }
        evidence_map.push_str("\n### Blocked evidence / risks\n\n");
        if blocked_evidence.is_empty() {
            evidence_map.push_str("- No stale, contradicted, unknown-source, missing-anchor, or artifact-mismatch evidence was selected.\n");
        } else {
            for item in &blocked_evidence {
                evidence_map.push_str(&format!(
                    "- `{}` (blocked evidence - risk only) -> claim: {} | reason: {}{}{}\n",
                    item.claim_id,
                    item.claim_text,
                    item.blocked_reason
                        .as_deref()
                        .unwrap_or("blocked evidence requires human confirmation"),
                    item.source_path
                        .as_ref()
                        .map(|path| format!(" | source: `{path}`"))
                        .unwrap_or_default(),
                    if item.concepts.is_empty() {
                        String::new()
                    } else {
                        format!(" | concepts: {}", item.concepts.join(", "))
                    }
                ));
            }
        }
    }

    let mut blocked_evidence_summary = String::new();
    if blocked_evidence.is_empty() {
        blocked_evidence_summary.push_str("- No blocked evidence selected for this proposal.\n");
    } else {
        for item in &blocked_evidence {
            blocked_evidence_summary.push_str(&format!(
                "- `{}` must remain risk-only: {}.\n",
                item.claim_id,
                item.blocked_reason
                    .as_deref()
                    .unwrap_or("requires human confirmation")
            ));
        }
    }

    let firm_evidence = evidence
        .iter()
        .filter(|item| is_fresh_supported_query_evidence(item))
        .collect::<Vec<_>>();
    let unsupported_draft = firm_evidence.is_empty();

    let strongest_claims = firm_evidence
        .iter()
        .take(4)
        .map(|item| format!("`{}`: {}", item.claim_id, item.claim_text))
        .collect::<Vec<_>>();

    let mut source_index = String::new();
    if source_refs.is_empty() {
        source_index.push_str("- No generated source pages found yet.\n");
    } else {
        for path in &source_refs {
            source_index.push_str(&format!("- `{path}`\n"));
        }
    }

    let mut concept_index = String::new();
    if concept_refs.is_empty() {
        concept_index.push_str("- No concept pages found yet.\n");
    } else {
        for path in &concept_refs {
            concept_index.push_str(&format!("- `{path}`\n"));
        }
    }

    let strongest_summary = if strongest_claims.is_empty() {
        "当前 vault 尚未提供足够 claim 证据，回答只能停留在待补证据的 proposal。".to_string()
    } else {
        strongest_claims.join("; ")
    };

    let mut insight_candidates = Vec::new();
    if supported_count == 0 {
        insight_candidates.push(
            "Needs review: 当前 vault 没有 fresh supported claim，不能生成确定性写回正文。"
                .to_string(),
        );
        insight_candidates.push(format!("Risk-only summary: {strongest_summary}"));
    } else {
        insight_candidates.push(format!(
            "Evidence-backed conclusion: 当前 vault 已有 {source_count} 个 source、{concept_count} 个 concept、{supported_count} 条 fresh supported evidence claim，可作为研发路线总结的稳定输入。"
        ));
        insight_candidates.push(format!(
            "Evidence-backed conclusion: 先从这些 claim 提炼确定性内容：{strongest_summary}"
        ));
    }
    insight_candidates.extend([
        "Inference: DeepSeek 的研发叙事应按问题选择、资源约束、架构/训练/数据/eval 决策拆开，并要求每个小结回链到 claim/source。".to_string(),
        "Hypothesis: 若 review queue 中的 claims 未解决，策略洞察应标记为待确认，不应进入稳定 concept。".to_string(),
        "Forecast: 后续演进方向只能作为预测候选，需要保留证据缺口、冲突说明和人工确认项。".to_string(),
    ]);
    let uncertainty_conflicts = vec![
        format!("{review_count} 个 claim/review 项仍需要人工确认。"),
        format!("{review_evidence_count} 条 composer evidence 不是 supported verdict，必须标为 inference 或待审证据。"),
        format!(
            "{} 条 blocked evidence 只能进入 Risk / Needs human confirmation，不能作为 evidence-backed conclusion 或稳定写回正文。",
            blocked_evidence.len()
        ),
        format!("{contradicted} 个 contradicted claim 可能影响最终 insight。"),
        "Composer 不调用外部 LLM；当前草稿基于 vault 内 evidence map 生成，需要人工审阅后再 apply。".to_string(),
    ];
    let evidence_section = if firm_evidence.is_empty() {
        "- Empty / unsupported: 当前 vault 没有 fresh supported evidence claim；不得生成可应用的确定性正文。\n".to_string()
    } else {
        let mut section = format!(
            "- 以 {supported_count} 条 supported/evidence-backed claim 为确定性输入；当前可引用规模为 {source_count} sources / {concept_count} concepts。\n"
        );
        for item in &firm_evidence {
            section.push_str(&format!(
                "- Evidence `{}`: {}{}{}{}\n",
                item.claim_id,
                item.claim_text,
                item.source_path
                    .as_ref()
                    .map(|path| format!(" | source: `{path}`"))
                    .unwrap_or_default(),
                item.evidence_hash
                    .as_ref()
                    .map(|hash| format!(
                        " | evidence_hash: `{}`",
                        hash.chars().take(16).collect::<String>()
                    ))
                    .unwrap_or_default(),
                if item.concepts.is_empty() {
                    String::new()
                } else {
                    format!(" | concepts: {}", item.concepts.join(", "))
                }
            ));
        }
        section
    };

    let mut rendered = format!(
        "unsupported_draft: {}\n\n## Citation coverage\n\n- summary: {}\n- status: {}\n- rule: stale, contradicted, broken, or unknown-source evidence is risky only and does not count as supported coverage.\n\n## Query\n\n{}\n\n## Answer schema\n\n",
        unsupported_draft,
        coverage.summary,
        if coverage.needs_evidence_review {
            "needs evidence review"
        } else {
            "supported coverage ready"
        },
        query.trim()
    );
    rendered.push_str("### Evidence\n\n");
    rendered.push_str(&evidence_section);
    rendered.push('\n');
    rendered.push_str("### Inference\n\n");
    rendered.push_str("- 将 DeepSeek 研发思路拆为问题选择、资源约束、架构/训练/数据/eval 决策逻辑；任何没有 supported verdict 的内容必须保留为 inference。\n\n");
    rendered.push_str("### Hypothesis\n\n");
    rendered.push_str("- 未完成 science review 的 claim 只能支持待确认洞察，不能直接写成事实。若 evidence-anchor 或 review 状态异常，应先生成 follow-up action。\n\n");
    rendered.push_str("### Forecast\n\n");
    rendered.push_str("- 技术演进方向应作为 forecast 保存，不能写成事实；forecast 必须列出来源、证据缺口、冲突和人工确认要求。\n\n");
    rendered.push_str("### Writeback plan\n\n");
    rendered.push_str(&format!(
        "- target_page: `{}`\n- write_content: review proposal only until explicit human approval.\n- evidence_map: see claim/source links below; every Evidence item must cite a claim/source/concept path.\n- risk: Forecast and unsupported statements must remain labeled and must not enter deterministic concept正文.\n- human_confirmation_checklist: verify target page, diff preview, evidence links, blocked evidence, forecast labels, and approval status before apply.\n\n",
        target_path.trim()
    ));
    rendered.push_str("## Evidence map\n\n");
    rendered.push_str(&evidence_map);
    rendered.push_str("\n## Source index\n\n");
    rendered.push_str(&source_index);
    rendered.push_str("\n## Concept index\n\n");
    rendered.push_str(&concept_index);
    rendered.push_str("\n## Insight candidates\n\n");
    for insight in &insight_candidates {
        rendered.push_str(&format!("- {insight}\n"));
    }
    rendered.push_str("\n## Uncertainty / conflicts\n\n");
    for item in &uncertainty_conflicts {
        rendered.push_str(&format!("- {item}\n"));
    }
    rendered.push_str("\n## Risk / Needs human confirmation\n\n");
    rendered.push_str(&blocked_evidence_summary);
    rendered.push_str(
        "\n## Writeback proposal\n\nTarget this as a review artifact first. Do not apply to concepts until a human approves the proposal.\n\n## Diff preview\n\nGenerated by desktop writeback proposal before apply; the diff is stored on the proposal object and shown in the desktop approval gate.\n\n## Approval status\n\nproposed\n",
    );
    (
        rendered,
        coverage,
        insight_candidates,
        uncertainty_conflicts,
    )
}

#[tauri::command]
fn create_query_writeback_proposal(
    vault_path: String,
    query: String,
    target_path: String,
    title: String,
) -> Result<QueryWritebackDraft, String> {
    let vault = PathBuf::from(&vault_path);
    require_existing_dir(&vault, "vault")?;
    if query.trim().is_empty() {
        return Err("query is required".to_string());
    }
    let evidence = query_evidence_items(&vault);
    let has_fresh_supported_evidence = evidence
        .iter()
        .any(|item| is_fresh_supported_query_evidence(item));
    if !has_fresh_supported_evidence {
        let target = resolve_vault_target(&vault, &target_path)?;
        if matches!(
            writeback_target_kind(&vault, &target),
            Ok(WritebackTargetKind::Concept)
        ) {
            return Err(
                "unsupported query draft cannot target concepts/ without fresh supported evidence; use reviews/query-writeback/ first"
                    .to_string(),
            );
        }
    }
    let (answer, citation_coverage, insight_candidates, uncertainty_conflicts) =
        render_query_writeback_content(&vault, &query, &target_path, &evidence);
    let proposal = create_writeback_proposal(
        vault_path,
        target_path,
        if title.trim().is_empty() {
            "Evidence-backed query writeback".to_string()
        } else {
            title
        },
        answer.clone(),
    )?;
    let writeback_proposal = format!(
        "Target: {}\nProposal ID: {}\nStatus: {}\nCitation coverage: {}\nCoverage gate: {}\nApproval gate: human approval required before apply",
        proposal.target_path,
        proposal.proposal_id,
        proposal.status,
        citation_coverage.summary,
        if citation_coverage.needs_evidence_review {
            "needs evidence review"
        } else {
            "supported coverage ready"
        }
    );
    Ok(QueryWritebackDraft {
        query,
        answer,
        citation_coverage,
        evidence_map: evidence,
        insight_candidates,
        uncertainty_conflicts,
        writeback_proposal,
        diff_preview: proposal.diff.clone(),
        approval_status: proposal.status.clone(),
        proposal,
    })
}

#[tauri::command]
fn create_writeback_proposal(
    vault_path: String,
    target_path: String,
    title: String,
    content: String,
) -> Result<WritebackProposal, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let target = resolve_vault_target(&vault, &target_path)?;
    if target.is_dir() {
        return Err("writeback target must be a file path, not a directory".to_string());
    }
    let extension = target
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
        return Err("writeback target must be Markdown or text".to_string());
    }
    let target_kind = writeback_target_kind(&vault, &target)?;
    if target_kind == WritebackTargetKind::Concept && !target.is_file() {
        return Err("concept writeback target must already exist".to_string());
    }
    let old = read_text(&target);
    let now = Local::now().to_rfc3339();
    let proposal_content = if target_kind == WritebackTargetKind::ReviewProposal {
        query_writeback_proposal_document(&title, &content, &now)
    } else {
        content
    };
    let proposal_id = format!(
        "wb-{}",
        short_hash(&sha256_text(&format!("{}:{now}", target.display())))
    );
    let proposal = WritebackProposal {
        proposal_id,
        target_path: rel_path(&vault, &target),
        title,
        status: "proposed".to_string(),
        diff: simple_diff(&old, &proposal_content),
        content: proposal_content,
        created_at: now.clone(),
        updated_at: now,
        applied_at: None,
        log_path: None,
    };
    save_writeback_proposal(&vault, &proposal)?;
    append_jsonl_value(
        &vault.join("_state").join("writeback-log.jsonl"),
        &serde_json::json!({
            "proposal_id": proposal.proposal_id,
            "target_path": proposal.target_path,
            "status": proposal.status,
            "created_at": proposal.created_at,
        }),
    )?;
    Ok(proposal)
}

#[tauri::command]
fn list_writeback_proposals(vault_path: String) -> Result<Vec<WritebackProposal>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let mut proposals = read_writeback_proposal_state(&vault).proposals;
    let managed_targets = proposals
        .iter()
        .map(|proposal| proposal.target_path.clone())
        .collect::<HashSet<_>>();
    for path in list_markdown(&vault.join("reviews").join("query-writeback")) {
        let relative = rel_path(&vault, &path);
        if managed_targets.contains(&relative) {
            continue;
        }
        if let Some(proposal) = review_artifact_writeback_proposal(&vault, &path) {
            proposals.push(proposal);
        }
    }
    proposals.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(proposals)
}

#[tauri::command]
fn set_writeback_status(
    vault_path: String,
    proposal_id: String,
    status: String,
) -> Result<WritebackProposal, String> {
    validate_status(&status, &["proposed", "approved", "rejected"])?;
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let mut proposal = load_writeback_proposal(&vault, &proposal_id)?;
    if proposal.status == "applied" {
        return Err("applied writeback proposals cannot be changed".to_string());
    }
    proposal.status = status;
    proposal.updated_at = Local::now().to_rfc3339();
    save_writeback_proposal(&vault, &proposal)?;
    append_jsonl_value(
        &vault.join("_state").join("writeback-log.jsonl"),
        &serde_json::json!({
            "proposal_id": proposal.proposal_id,
            "target_path": proposal.target_path,
            "status": proposal.status,
            "updated_at": proposal.updated_at,
        }),
    )?;
    Ok(proposal)
}

#[tauri::command]
fn apply_writeback_proposal(
    vault_path: String,
    proposal_id: String,
) -> Result<WritebackApplyResult, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let mut proposal = load_writeback_proposal(&vault, &proposal_id)?;
    if proposal.status != "approved" {
        return Err("writeback proposal must be approved before apply".to_string());
    }
    let target = resolve_vault_target(&vault, &proposal.target_path)?;
    let _target_kind = writeback_target_kind(&vault, &target)?;
    write_text(&target, &proposal.content)?;
    let log_path = vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{}-writeback.log", proposal.proposal_id));
    let rendered = format!(
        "# Writeback Apply Log\n\nproposal_id: {}\ntarget_path: {}\napplied_at: {}\nstatus: applied\n\n## Diff\n\n```diff\n{}```\n",
        proposal.proposal_id,
        proposal.target_path,
        Local::now().to_rfc3339(),
        proposal.diff
    );
    write_text(&log_path, &rendered)?;
    proposal.status = "applied".to_string();
    proposal.updated_at = Local::now().to_rfc3339();
    proposal.applied_at = Some(proposal.updated_at.clone());
    proposal.log_path = Some(rel_path(&vault, &log_path));
    save_writeback_proposal(&vault, &proposal)?;
    append_jsonl_value(
        &vault.join("_state").join("writeback-log.jsonl"),
        &serde_json::json!({
            "proposal_id": proposal.proposal_id,
            "target_path": proposal.target_path,
            "status": proposal.status,
            "applied_at": proposal.applied_at,
            "log_path": proposal.log_path,
        }),
    )?;
    let dashboard_error = plan_ingest(to_display(&vault)).err();
    Ok(WritebackApplyResult {
        proposal,
        dashboard_refreshed: dashboard_error.is_none(),
        dashboard_error,
    })
}

#[tauri::command]
fn create_diagnostic_bundle(vault_path: String) -> Result<String, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let status = inspect_vault(to_display(&vault))?;
    let plan = plan_ingest(to_display(&vault))?;
    let bundle_path = vault.join("log-archive").join("desktop").join(format!(
        "{}-diagnostic.md",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    let state_files = [
        "_state/source-registry.jsonl",
        "_state/ingest-jobs.jsonl",
        "_state/actions.jsonl",
        "_state/lint-findings.jsonl",
        "_state/science-review-queue.jsonl",
        "claims/claims.jsonl",
    ];
    let mut rendered = format!(
        "# Desktop Diagnostic Bundle\n\ncreated_at: {}\nvault: {}\nschema_valid: {}\nruntime_installed: {}\nobsidian_enabled: {}\n\n## Counts\n\n```json\n{}\n```\n\n## Ingest Summary\n\n```json\n{}\n```\n\n",
        Local::now().to_rfc3339(),
        status.path,
        status.schema_valid,
        status.runtime_installed,
        status.obsidian_enabled,
        serde_json::to_string_pretty(&status.counts).unwrap_or_default(),
        serde_json::to_string_pretty(&plan.summary).unwrap_or_default()
    );
    if !status.errors.is_empty() {
        rendered.push_str("## Schema Errors\n\n");
        for error in status.errors {
            rendered.push_str(&format!("- {error}\n"));
        }
        rendered.push('\n');
    }
    rendered.push_str("## Recent State\n\n");
    for path in state_files {
        rendered.push_str(&format!("### {path}\n\n```jsonl\n"));
        let text = read_text(&vault.join(path));
        for line in text
            .lines()
            .rev()
            .take(20)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            rendered.push_str(line);
            rendered.push('\n');
        }
        rendered.push_str("```\n\n");
    }
    write_text(&bundle_path, &rendered)?;
    Ok(to_display(&bundle_path))
}

fn stage_text_artifacts(vault: &Path) -> Result<Vec<String>, String> {
    let plan = plan_ingest(to_display(vault))?;
    let cancelled = cancelled_job_ids(vault);
    let mut staged = Vec::new();
    for entry in plan.entries {
        if !plan_entry_is_pipeline_runnable(&entry) || entry.status != "stageable" {
            continue;
        }
        let source = PathBuf::from(&entry.source_path);
        let source_id = source_id_for_hash(vault, &entry.sha256);
        if cancelled.contains(&job_id_for_source_id(source_id.as_deref(), &entry.sha256)) {
            continue;
        }
        let artifact = entry
            .artifact_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| "missing artifact path for stageable source".to_string())?;
        let content = fs::read_to_string(&source)
            .map_err(|e| format!("failed to read {}: {e}", source.display()))?;
        write_text_artifact_contract(
            vault,
            &source,
            &artifact,
            &entry.sha256,
            source_id.as_deref(),
            &content,
        )?;
        append_cache_row(vault, &source, &entry.sha256, &artifact)?;
        staged.push(to_display(&artifact));
    }
    Ok(staged)
}

#[tauri::command]
fn run_runtime_command(
    app: AppHandle,
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    kind: String,
    obsidian_profile: String,
    skip_downloads: bool,
    pdf_parser: String,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: String,
    timeout_seconds: usize,
    retry_count: usize,
) -> Result<TaskLog, String> {
    run_runtime_command_impl(
        app,
        vault_path,
        runtime_path,
        python_path,
        kind,
        obsidian_profile,
        skip_downloads,
        pdf_parser,
        cloud_parsing_allowed,
        layout_parsing_api_url,
        timeout_seconds,
        retry_count,
        None,
    )
}

fn run_runtime_command_impl(
    app: AppHandle,
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    kind: String,
    obsidian_profile: String,
    skip_downloads: bool,
    pdf_parser: String,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: String,
    timeout_seconds: usize,
    retry_count: usize,
    job_id_override: Option<String>,
) -> Result<TaskLog, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    if kind == "parse_pdfs" {
        let plan = plan_ingest(to_display(&vault))?;
        let (_artifacts, mut logs) = parse_pdf_artifacts(
            Some(&app),
            &vault,
            &plan,
            runtime_path.as_deref(),
            &python_path,
            &pdf_parser,
            cloud_parsing_allowed,
            &layout_parsing_api_url,
            timeout_seconds,
            retry_count,
            job_id_override,
        )?;
        if logs.is_empty() {
            return synthetic_task_log(
                &vault,
                "parse_pdfs",
                "no parse_required PDF artifacts found\n",
            );
        }
        return Ok(logs.remove(0));
    }
    run_runtime_task(
        Some(&app),
        &vault,
        runtime_path.as_deref(),
        &python_path,
        &kind,
        &obsidian_profile,
        skip_downloads,
        timeout_seconds,
        retry_count,
        job_id_override,
    )
}

#[tauri::command]
fn start_runtime_command_job(
    app: AppHandle,
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    kind: String,
    obsidian_profile: String,
    skip_downloads: bool,
    pdf_parser: String,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: String,
    timeout_seconds: usize,
    retry_count: usize,
) -> Result<RuntimeJobEvent, String> {
    let vault = PathBuf::from(&vault_path);
    require_existing_dir(&vault, "vault")?;
    let job_id = new_runtime_job_id(&kind);
    let started_at = Local::now().to_rfc3339();
    let command = vec!["desktop:runtime_command".to_string(), kind.clone()];
    let max_attempts = runtime_job_max_attempts_for_kind(&kind, retry_count);
    let live_log_path = Some(to_display(&runtime_task_log_path(&vault, &job_id)));
    let start_event = runtime_job_start_event(
        &job_id,
        &kind,
        command.clone(),
        started_at.clone(),
        max_attempts,
        "background runtime job queued",
        live_log_path,
        None,
    );
    append_runtime_job_state(&vault, &start_event)?;
    emit_runtime_event(Some(&app), start_event.clone());

    thread::spawn(move || {
        let started = Instant::now();
        let result = run_runtime_command_impl(
            app.clone(),
            vault_path.clone(),
            runtime_path,
            python_path,
            kind.clone(),
            obsidian_profile,
            skip_downloads,
            pdf_parser,
            cloud_parsing_allowed,
            layout_parsing_api_url,
            timeout_seconds,
            retry_count,
            Some(job_id.clone()),
        );
        match result {
            Ok(log) if log.id == job_id => {}
            other => {
                let finish_event = runtime_job_finish_event(
                    job_id,
                    kind,
                    command,
                    started_at,
                    started,
                    max_attempts,
                    other,
                );
                emit_runtime_event(Some(&app), finish_event.clone());
                let _ = append_runtime_job_state(&PathBuf::from(vault_path), &finish_event);
            }
        }
    });

    Ok(start_event)
}

fn synthetic_task_log(vault: &Path, kind: &str, stdout: &str) -> Result<TaskLog, String> {
    let started_at = Local::now().to_rfc3339();
    let ended_at = Local::now().to_rfc3339();
    let id = format!("{}-{}", Local::now().format("%Y%m%d-%H%M%S"), kind);
    let log_path = vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{id}.log"));
    let rendered = format!(
        "# Runtime Task Log\n\nkind: {kind}\nstarted_at: {started_at}\nended_at: {ended_at}\nexit_code: 0\ncommand: synthetic:{kind}\n\n## stdout\n\n{stdout}\n\n## stderr\n\n\n",
    );
    write_text(&log_path, &rendered)?;
    Ok(TaskLog {
        id,
        kind: kind.to_string(),
        command: vec![format!("synthetic:{kind}")],
        started_at,
        ended_at,
        exit_code: 0,
        stdout: stdout.to_string(),
        stderr: String::new(),
        log_path: to_display(&log_path),
    })
}

static JOB_CANCELS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn job_cancels() -> &'static Mutex<HashSet<String>> {
    JOB_CANCELS.get_or_init(|| Mutex::new(HashSet::new()))
}

#[tauri::command]
fn cancel_runtime_job(job_id: String) -> Result<(), String> {
    job_cancels()
        .lock()
        .map_err(|_| "runtime job cancel registry is poisoned".to_string())?
        .insert(job_id);
    Ok(())
}

fn runtime_job_cancelled(job_id: &str) -> bool {
    job_cancels()
        .lock()
        .map(|items| items.contains(job_id))
        .unwrap_or(false)
}

fn clear_runtime_job_cancel(job_id: &str) {
    if let Ok(mut items) = job_cancels().lock() {
        items.remove(job_id);
    }
}

fn sanitize_job_kind(kind: &str) -> String {
    let sanitized = kind
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "runtime".to_string()
    } else {
        sanitized
    }
}

fn new_runtime_job_id(kind: &str) -> String {
    let now = Local::now();
    format!(
        "{}-{:03}-{}",
        now.format("%Y%m%d-%H%M%S"),
        now.timestamp_subsec_millis(),
        sanitize_job_kind(kind)
    )
}

fn emit_runtime_event(app: Option<&AppHandle>, event: RuntimeJobEvent) {
    if let Some(app) = app {
        let _ = app.emit("runtime-job-event", event);
    }
}

fn runtime_task_log_path(vault: &Path, id: &str) -> PathBuf {
    vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{id}.log"))
}

fn append_text(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create {}: {e}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("failed to open {}: {e}", path.display()))?;
    file.write_all(text.as_bytes())
        .map_err(|e| format!("failed to append {}: {e}", path.display()))
}

fn text_tail(value: &str, max_chars: usize) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let mut tail = value.chars().rev().take(max_chars).collect::<Vec<_>>();
    let truncated = tail.len() == max_chars && value.chars().count() > max_chars;
    tail.reverse();
    let rendered = tail.into_iter().collect::<String>();
    Some(if truncated {
        format!("...{rendered}")
    } else {
        rendered
    })
}

fn append_runtime_job_state(vault: &Path, event: &RuntimeJobEvent) -> Result<(), String> {
    append_jsonl_value(
        &vault.join("_state").join("desktop-runtime-jobs.jsonl"),
        &serde_json::to_value(event)
            .map_err(|e| format!("failed to serialize runtime job state: {e}"))?,
    )
}

#[tauri::command]
fn list_runtime_jobs(vault_path: String) -> Result<Vec<RuntimeJobEvent>, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let mut by_job = HashMap::<String, RuntimeJobEvent>::new();
    for event in read_text(&vault.join("_state").join("desktop-runtime-jobs.jsonl"))
        .lines()
        .filter_map(|line| serde_json::from_str::<RuntimeJobEvent>(line).ok())
    {
        by_job.insert(event.job_id.clone(), event);
    }
    let mut jobs = by_job.into_values().collect::<Vec<_>>();
    jobs.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    jobs.truncate(40);
    Ok(jobs)
}

fn runtime_job_start_event(
    job_id: &str,
    kind: &str,
    command: Vec<String>,
    started_at: String,
    max_attempts: usize,
    message: &str,
    live_log_path: Option<String>,
    retry_of: Option<String>,
) -> RuntimeJobEvent {
    RuntimeJobEvent {
        job_id: job_id.to_string(),
        kind: kind.to_string(),
        status: "queued".to_string(),
        stream: None,
        line: None,
        stage: "queued".to_string(),
        attempt: 1,
        max_attempts,
        retry_count: max_attempts,
        command,
        started_at,
        ended_at: None,
        elapsed_ms: 0,
        duration_ms: 0,
        exit_code: None,
        log_path: None,
        live_log_path,
        stdout_tail: None,
        stderr_tail: None,
        retry_of,
        message: Some(message.to_string()),
    }
}

fn runtime_job_finish_event(
    job_id: String,
    kind: String,
    command: Vec<String>,
    started_at: String,
    started: Instant,
    max_attempts: usize,
    result: Result<TaskLog, String>,
) -> RuntimeJobEvent {
    let ended_at = Local::now().to_rfc3339();
    let elapsed_ms = started.elapsed().as_millis();
    match result {
        Ok(log) => RuntimeJobEvent {
            job_id,
            kind,
            status: if log.exit_code == 0 {
                "succeeded".to_string()
            } else {
                "failed".to_string()
            },
            stream: None,
            line: None,
            stage: "finished".to_string(),
            attempt: max_attempts,
            max_attempts,
            retry_count: max_attempts,
            command,
            started_at,
            ended_at: Some(ended_at),
            elapsed_ms,
            duration_ms: elapsed_ms,
            exit_code: Some(log.exit_code),
            log_path: Some(log.log_path.clone()),
            live_log_path: Some(log.log_path),
            stdout_tail: text_tail(&log.stdout, 1200),
            stderr_tail: text_tail(&log.stderr, 1200),
            retry_of: None,
            message: Some(if log.exit_code == 0 {
                "completed".to_string()
            } else {
                "completed with non-zero exit; see child task log".to_string()
            }),
        },
        Err(error) => RuntimeJobEvent {
            job_id,
            kind,
            status: "failed".to_string(),
            stream: None,
            line: None,
            stage: "finished".to_string(),
            attempt: 1,
            max_attempts,
            retry_count: max_attempts,
            command,
            started_at,
            ended_at: Some(ended_at),
            elapsed_ms,
            duration_ms: elapsed_ms,
            exit_code: Some(-1),
            log_path: None,
            live_log_path: None,
            stdout_tail: None,
            stderr_tail: None,
            retry_of: None,
            message: Some(error),
        },
    }
}

fn shell_command(script: &str) -> Vec<String> {
    if cfg!(target_os = "windows") {
        vec!["cmd".to_string(), "/C".to_string(), script.to_string()]
    } else {
        vec!["/bin/sh".to_string(), "-c".to_string(), script.to_string()]
    }
}

fn runtime_probe_command(kind: &str) -> Option<(Vec<String>, usize, usize)> {
    match kind {
        "cancel_probe" => Some((
            shell_command(
                "echo cancel-probe-start; i=1; while [ $i -le 30 ]; do echo cancel-probe-tick-$i; i=$((i+1)); sleep 1; done; echo cancel-probe-finished",
            ),
            45,
            1,
        )),
        "timeout_probe" => Some((
            shell_command("echo timeout-probe-start; sleep 8; echo timeout-probe-finished"),
            2,
            1,
        )),
        _ => None,
    }
}

fn runtime_job_max_attempts_for_kind(kind: &str, retry_count: usize) -> usize {
    if runtime_probe_command(kind).is_some() {
        1
    } else {
        retry_count.max(1)
    }
}

fn run_process_job(
    app: Option<&AppHandle>,
    vault: &Path,
    job_id: String,
    kind: &str,
    command: Vec<String>,
    timeout_seconds: usize,
    retry_count: usize,
) -> Result<TaskLog, String> {
    if command.is_empty() {
        return Err("runtime command is empty".to_string());
    }
    let max_attempts = retry_count.max(1);
    let timeout = Duration::from_secs(timeout_seconds.max(1) as u64);
    let started_at = Local::now().to_rfc3339();
    let started = Instant::now();
    let log_path = runtime_task_log_path(vault, &job_id);
    let _ = ensure_inside(&log_path, vault, "task log must stay inside the vault")?;
    let live_log_path = Some(to_display(&log_path));
    write_text(
        &log_path,
        &format!(
            "# Runtime Task Log\n\nkind: {kind}\njob_id: {job_id}\nstarted_at: {started_at}\nstatus: running\ncommand: {}\ntimeout_seconds: {timeout_seconds}\nretry_count: {retry_count}\n\n## live events\n\n",
            command.join(" ")
        ),
    )?;
    let mut stdout_all = String::new();
    let mut stderr_all = String::new();
    let mut final_exit = -1;
    let mut final_status = "failed".to_string();
    let mut final_message = None;
    let mut last_attempt = 0usize;

    for attempt in 1..=max_attempts {
        last_attempt = attempt;
        let started_event = RuntimeJobEvent {
            job_id: job_id.clone(),
            kind: kind.to_string(),
            status: "running".to_string(),
            stream: None,
            line: None,
            stage: format!("attempt {attempt}/{max_attempts}"),
            attempt,
            max_attempts,
            retry_count: max_attempts,
            command: command.clone(),
            started_at: started_at.clone(),
            ended_at: None,
            elapsed_ms: started.elapsed().as_millis(),
            duration_ms: started.elapsed().as_millis(),
            exit_code: None,
            log_path: None,
            live_log_path: live_log_path.clone(),
            stdout_tail: None,
            stderr_tail: None,
            retry_of: None,
            message: Some("started".to_string()),
        };
        emit_runtime_event(app, started_event.clone());
        if attempt == 1 {
            let _ = append_runtime_job_state(vault, &started_event);
        }

        let mut child = Command::new(&command[0])
            .args(command.iter().skip(1))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to run {kind}: {e}"))?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let (tx, rx) = mpsc::channel::<(String, String)>();
        let mut readers = Vec::new();

        if let Some(stdout) = stdout {
            let tx = tx.clone();
            readers.push(thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    let _ = tx.send(("stdout".to_string(), line.unwrap_or_default()));
                }
            }));
        }
        if let Some(stderr) = stderr {
            let tx = tx.clone();
            readers.push(thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    let _ = tx.send(("stderr".to_string(), line.unwrap_or_default()));
                }
            }));
        }
        drop(tx);

        let attempt_started = Instant::now();
        let mut last_heartbeat = Instant::now();
        let attempt_exit: i32;
        let mut timed_out = false;
        let mut cancelled = false;

        loop {
            while let Ok((stream, line)) = rx.try_recv() {
                if stream == "stdout" {
                    stdout_all.push_str(&line);
                    stdout_all.push('\n');
                } else {
                    stderr_all.push_str(&line);
                    stderr_all.push('\n');
                }
                let _ = append_text(&log_path, &format!("[{stream}] {line}\n"));
                let elapsed_ms = started.elapsed().as_millis();
                emit_runtime_event(
                    app,
                    RuntimeJobEvent {
                        job_id: job_id.clone(),
                        kind: kind.to_string(),
                        status: "running".to_string(),
                        stream: Some(stream),
                        line: Some(line),
                        stage: format!("attempt {attempt}/{max_attempts}"),
                        attempt,
                        max_attempts,
                        retry_count: max_attempts,
                        command: command.clone(),
                        started_at: started_at.clone(),
                        ended_at: None,
                        elapsed_ms,
                        duration_ms: elapsed_ms,
                        exit_code: None,
                        log_path: None,
                        live_log_path: live_log_path.clone(),
                        stdout_tail: text_tail(&stdout_all, 1200),
                        stderr_tail: text_tail(&stderr_all, 1200),
                        retry_of: None,
                        message: None,
                    },
                );
            }

            if last_heartbeat.elapsed() >= Duration::from_secs(2) {
                let elapsed_ms = started.elapsed().as_millis();
                emit_runtime_event(
                    app,
                    RuntimeJobEvent {
                        job_id: job_id.clone(),
                        kind: kind.to_string(),
                        status: "running".to_string(),
                        stream: None,
                        line: None,
                        stage: format!("attempt {attempt}/{max_attempts}"),
                        attempt,
                        max_attempts,
                        retry_count: max_attempts,
                        command: command.clone(),
                        started_at: started_at.clone(),
                        ended_at: None,
                        elapsed_ms,
                        duration_ms: elapsed_ms,
                        exit_code: None,
                        log_path: None,
                        live_log_path: live_log_path.clone(),
                        stdout_tail: text_tail(&stdout_all, 1200),
                        stderr_tail: text_tail(&stderr_all, 1200),
                        retry_of: None,
                        message: Some(format!("running for {}s", started.elapsed().as_secs())),
                    },
                );
                last_heartbeat = Instant::now();
            }

            if runtime_job_cancelled(&job_id) {
                cancelled = true;
                let _ = child.kill();
                let _ = child.wait();
                attempt_exit = -1;
                break;
            }
            if attempt_started.elapsed() >= timeout {
                timed_out = true;
                let _ = child.kill();
                let _ = child.wait();
                attempt_exit = -1;
                break;
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    attempt_exit = status.code().unwrap_or(-1);
                    break;
                }
                Ok(None) => thread::sleep(Duration::from_millis(100)),
                Err(error) => {
                    attempt_exit = -1;
                    stderr_all.push_str(&format!("failed to wait for {kind}: {error}\n"));
                    break;
                }
            }
        }

        for reader in readers {
            let _ = reader.join();
        }
        while let Ok((stream, line)) = rx.try_recv() {
            if stream == "stdout" {
                stdout_all.push_str(&line);
                stdout_all.push('\n');
            } else {
                stderr_all.push_str(&line);
                stderr_all.push('\n');
            }
            let _ = append_text(&log_path, &format!("[{stream}] {line}\n"));
        }

        final_exit = attempt_exit;
        if cancelled {
            final_status = "cancelled".to_string();
            final_message = Some("cancelled by user".to_string());
            break;
        }
        if timed_out {
            final_status = "timeout".to_string();
            final_message = Some(format!("timed out after {timeout_seconds} seconds"));
        } else if final_exit == 0 {
            final_status = "succeeded".to_string();
            final_message = Some("completed".to_string());
            break;
        } else {
            final_status = "failed".to_string();
            final_message = Some(format!("exit code {final_exit}"));
        }

        if attempt < max_attempts {
            let elapsed_ms = started.elapsed().as_millis();
            emit_runtime_event(
                app,
                RuntimeJobEvent {
                    job_id: job_id.clone(),
                    kind: kind.to_string(),
                    status: "retrying".to_string(),
                    stream: None,
                    line: None,
                    stage: format!("retry after attempt {attempt}"),
                    attempt,
                    max_attempts,
                    retry_count: max_attempts,
                    command: command.clone(),
                    started_at: started_at.clone(),
                    ended_at: None,
                    elapsed_ms,
                    duration_ms: elapsed_ms,
                    exit_code: Some(final_exit),
                    log_path: None,
                    live_log_path: live_log_path.clone(),
                    stdout_tail: text_tail(&stdout_all, 1200),
                    stderr_tail: text_tail(&stderr_all, 1200),
                    retry_of: None,
                    message: final_message.clone(),
                },
            );
        }
    }

    let ended_at = Local::now().to_rfc3339();
    let id = job_id;
    let rendered = format!(
        "# Runtime Task Log\n\nkind: {kind}\njob_id: {id}\nstarted_at: {started_at}\nended_at: {ended_at}\nstatus: {final_status}\nexit_code: {final_exit}\ncommand: {}\ntimeout_seconds: {timeout_seconds}\nretry_count: {retry_count}\n\n## stdout\n\n{}\n\n## stderr\n\n{}\n",
        command.join(" "),
        stdout_all,
        stderr_all
    );
    write_text(&log_path, &rendered)?;
    let _ = ensure_inside(&log_path, vault, "task log must stay inside the vault")?;
    let final_event = RuntimeJobEvent {
        job_id: id.clone(),
        kind: kind.to_string(),
        status: final_status,
        stream: None,
        line: None,
        stage: "finished".to_string(),
        attempt: last_attempt.max(1),
        max_attempts,
        retry_count: max_attempts,
        command: command.clone(),
        started_at: started_at.clone(),
        ended_at: Some(ended_at.clone()),
        elapsed_ms: started.elapsed().as_millis(),
        duration_ms: started.elapsed().as_millis(),
        exit_code: Some(final_exit),
        log_path: Some(to_display(&log_path)),
        live_log_path: live_log_path.clone(),
        stdout_tail: text_tail(&stdout_all, 1200),
        stderr_tail: text_tail(&stderr_all, 1200),
        retry_of: None,
        message: final_message,
    };
    emit_runtime_event(app, final_event.clone());
    append_runtime_job_state(vault, &final_event)?;
    clear_runtime_job_cancel(&id);
    Ok(TaskLog {
        id,
        kind: kind.to_string(),
        command,
        started_at,
        ended_at,
        exit_code: final_exit,
        stdout: stdout_all,
        stderr: stderr_all,
        log_path: to_display(&log_path),
    })
}

fn run_runtime_task(
    app: Option<&AppHandle>,
    vault: &Path,
    runtime_path: Option<&str>,
    python_path: &str,
    kind: &str,
    obsidian_profile: &str,
    skip_downloads: bool,
    timeout_seconds: usize,
    retry_count: usize,
    job_id_override: Option<String>,
) -> Result<TaskLog, String> {
    if let Some((command, probe_timeout, probe_retry)) = runtime_probe_command(kind) {
        let id = job_id_override.unwrap_or_else(|| new_runtime_job_id(kind));
        if kind == "cancel_probe" {
            let cancel_id = id.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(900));
                let _ = cancel_runtime_job(cancel_id);
            });
        }
        return run_process_job(app, vault, id, kind, command, probe_timeout, probe_retry);
    }
    let (script, mut args) = command_spec(kind, vault, obsidian_profile, skip_downloads)?;
    let scripts_dir = resolve_scripts_dir(vault, runtime_path)?;
    let script_path = scripts_dir.join(script);
    if !script_path.is_file() {
        return Err(format!(
            "runtime script not found: {}",
            script_path.display()
        ));
    }
    let mut command = vec![python_path.to_string(), to_display(&script_path)];
    command.append(&mut args);
    let id = job_id_override.unwrap_or_else(|| new_runtime_job_id(kind));
    run_process_job(app, vault, id, kind, command, timeout_seconds, retry_count)
}

fn selected_pdf_parser(value: &str) -> Result<String, String> {
    match value.trim() {
        "" | "auto" => Ok("auto".to_string()),
        "local-text" => Ok("local-text".to_string()),
        "layout-api" => Ok("layout-api".to_string()),
        other => Err(format!(
            "unsupported PDF parser '{other}', expected auto, local-text, or layout-api"
        )),
    }
}

fn run_python_script_log(
    app: Option<&AppHandle>,
    vault: &Path,
    kind: &str,
    python_path: &str,
    script_path: &Path,
    args: &[String],
    timeout_seconds: usize,
    retry_count: usize,
    job_id_override: Option<String>,
) -> Result<TaskLog, String> {
    let mut command = vec![python_path.to_string(), to_display(script_path)];
    command.extend(args.iter().cloned());
    let id = job_id_override.unwrap_or_else(|| new_runtime_job_id(kind));
    run_process_job(app, vault, id, kind, command, timeout_seconds, retry_count)
}

fn parse_pdf_artifacts(
    app: Option<&AppHandle>,
    vault: &Path,
    plan: &IngestPlan,
    runtime_path: Option<&str>,
    python_path: &str,
    pdf_parser: &str,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: &str,
    timeout_seconds: usize,
    retry_count: usize,
    job_id_override: Option<String>,
) -> Result<(Vec<String>, Vec<TaskLog>), String> {
    let parser = selected_pdf_parser(pdf_parser)?;
    if parser == "layout-api" && !cloud_parsing_allowed {
        return Err("layout-api parser requires explicit cloud parsing approval".to_string());
    }
    let scripts_dir = resolve_scripts_dir(vault, runtime_path)?;
    let script_path = scripts_dir.join("pdf_to_markdown.py");
    if !script_path.is_file() {
        return Err(format!(
            "runtime script not found: {}",
            script_path.display()
        ));
    }
    let cancelled = cancelled_job_ids(vault);
    let mut parsed_artifacts = Vec::new();
    let mut logs = Vec::new();
    let mut next_job_id_override = job_id_override;
    for entry in &plan.entries {
        if entry.action != "parse_required" || !plan_entry_is_pipeline_runnable(entry) {
            continue;
        }
        let source = PathBuf::from(&entry.source_path);
        if !is_parseable_binary(&source) {
            continue;
        }
        let source_id = source_id_for_hash(vault, &entry.sha256);
        let job_id = job_id_for_source_id(source_id.as_deref(), &entry.sha256);
        if cancelled.contains(&job_id) {
            continue;
        }
        let Some(artifact_path) = &entry.artifact_path else {
            continue;
        };
        let artifact = PathBuf::from(artifact_path);
        let output_dir = artifact
            .parent()
            .ok_or_else(|| "artifact path has no parent".to_string())?;
        ensure_inside(
            &source,
            vault,
            "PDF parse source must stay inside the vault",
        )?;
        ensure_inside(
            output_dir,
            vault,
            "PDF parse output must stay inside the vault",
        )?;
        let _ = update_ingest_job_record(vault, &job_id, "running", None, None);
        let mut args = vec![
            to_display(&source),
            "--output".to_string(),
            to_display(output_dir),
            "--parser".to_string(),
            parser.clone(),
            "--no-download-images".to_string(),
        ];
        if parser == "layout-api" && !layout_parsing_api_url.trim().is_empty() {
            args.extend([
                "--api-url".to_string(),
                layout_parsing_api_url.trim().to_string(),
            ]);
        }
        let log = run_python_script_log(
            app,
            vault,
            "parse_pdfs",
            python_path,
            &script_path,
            &args,
            timeout_seconds,
            retry_count,
            next_job_id_override.take(),
        )?;
        if log.exit_code != 0 {
            let _ = update_ingest_job_record(
                vault,
                &job_id,
                "failed",
                Some(format!("PDF parse failed with exit {}", log.exit_code)),
                Some(log.log_path.clone()),
            );
            logs.push(log);
            return Err("PDF parse failed; see desktop task log for details".to_string());
        }
        let _ = update_ingest_job_record(
            vault,
            &job_id,
            "succeeded",
            None,
            Some(log.log_path.clone()),
        );
        parsed_artifacts.push(rel_path(vault, &artifact));
        logs.push(log);
    }
    Ok((parsed_artifacts, logs))
}

fn record_published_ingest(
    vault: &Path,
    plan: &IngestPlan,
    pipeline_id: &str,
    pipeline_log_path: &Path,
) -> Result<Vec<String>, String> {
    let registry = vault.join("_state").join("desktop-ingest-registry.jsonl");
    let existing = read_text(&registry);
    let mut published_keys = load_published_ingest_keys(vault);
    let cancelled = cancelled_job_ids(vault);
    let mut rows = String::new();
    let mut published_sources = Vec::new();

    for entry in &plan.entries {
        let source_id = source_id_for_hash(vault, &entry.sha256);
        if cancelled.contains(&job_id_for_source_id(source_id.as_deref(), &entry.sha256)) {
            continue;
        }
        if !plan_entry_is_runtime_ready(entry) {
            continue;
        }
        let Some(artifact_path) = &entry.artifact_path else {
            continue;
        };
        let artifact = PathBuf::from(artifact_path);
        if !artifact.is_file() {
            continue;
        }
        let artifact_sha256 = sha256_file(&artifact)?;
        let key = (entry.sha256.clone(), artifact_sha256.clone());
        if published_keys.contains(&key) {
            continue;
        }
        let source_path = PathBuf::from(&entry.source_path);
        let source_display = source_path
            .strip_prefix(vault)
            .unwrap_or(source_path.as_path())
            .to_string_lossy()
            .to_string();
        let artifact_display = artifact
            .strip_prefix(vault)
            .unwrap_or(artifact.as_path())
            .to_string_lossy()
            .to_string();
        let pipeline_log_display = pipeline_log_path
            .strip_prefix(vault)
            .unwrap_or(pipeline_log_path)
            .to_string_lossy()
            .to_string();
        let row = serde_json::json!({
            "source_path": source_display,
            "source_sha256": &entry.sha256,
            "artifact_path": artifact_display,
            "artifact_sha256": artifact_sha256,
            "pipeline_id": pipeline_id,
            "pipeline_log_path": pipeline_log_display,
            "published_at": Local::now().to_rfc3339(),
            "status": "published",
        });
        rows.push_str(
            &serde_json::to_string(&row)
                .map_err(|e| format!("failed to serialize ingest registry row: {e}"))?,
        );
        rows.push('\n');
        published_keys.insert(key);
        published_sources.push(entry.source_path.clone());
    }

    if rows.is_empty() {
        return Ok(published_sources);
    }
    write_text(&registry, &format!("{existing}{rows}"))?;
    Ok(published_sources)
}

#[tauri::command]
fn run_ingest_pipeline(
    app: AppHandle,
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    obsidian_profile: String,
    skip_downloads: bool,
    pdf_parser: String,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: String,
    timeout_seconds: usize,
    retry_count: usize,
) -> Result<IngestPipelineResult, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let _lock = acquire_ingest_lock(&vault)?;
    let initial_plan = plan_ingest(to_display(&vault))?;
    let cancelled = cancelled_job_ids(&vault);
    let runnable = initial_plan
        .entries
        .iter()
        .filter(|entry| {
            let source_id = source_id_for_hash(&vault, &entry.sha256);
            !cancelled.contains(&job_id_for_source_id(source_id.as_deref(), &entry.sha256))
        })
        .filter(|entry| plan_entry_is_pipeline_runnable(entry))
        .count();
    if runnable == 0 {
        let cancelled_runnable = initial_plan.entries.iter().any(|entry| {
            let source_id = source_id_for_hash(&vault, &entry.sha256);
            cancelled.contains(&job_id_for_source_id(source_id.as_deref(), &entry.sha256))
                && plan_entry_is_pipeline_runnable(entry)
        });
        if cancelled_runnable {
            return Err(
                "all runnable ingest inputs are cancelled; retry selected jobs before running the pipeline"
                    .to_string(),
            );
        }
        if initial_plan.summary.published > 0 && initial_plan.summary.blocked == 0 {
            return Err(
                "all ingest inputs are already published for their current source/artifact hash"
                    .to_string(),
            );
        }
        return Err("no unpublished ingest inputs are ready; parse blocked PDFs, extract archive packages, or import Markdown/txt".to_string());
    }
    let (parsed_artifacts, mut logs) = parse_pdf_artifacts(
        Some(&app),
        &vault,
        &initial_plan,
        runtime_path.as_deref(),
        &python_path,
        &pdf_parser,
        cloud_parsing_allowed,
        &layout_parsing_api_url,
        timeout_seconds,
        retry_count,
        None,
    )?;
    let staged_artifacts = stage_text_artifacts(&vault)?;
    let final_plan = plan_ingest(to_display(&vault))?;
    if final_plan.entries.iter().any(|entry| {
        plan_entry_is_review_gated(entry) && matches!(entry.status.as_str(), "ready" | "cached")
    }) {
        return Err(
            "review-gated ingest inputs have ready artifacts; inspect duplicate/review state before running the runtime pipeline"
                .to_string(),
        );
    }
    let runnable_job_ids = final_plan
        .entries
        .iter()
        .filter(|entry| plan_entry_is_runtime_ready(entry))
        .filter_map(|entry| {
            let source_id = source_id_for_hash(&vault, &entry.sha256);
            let job_id = job_id_for_source_id(source_id.as_deref(), &entry.sha256);
            (!cancelled.contains(&job_id)).then_some(job_id)
        })
        .collect::<Vec<_>>();

    let sequence = [
        "discover",
        "ingest_corpus",
        "claims",
        "normalize",
        "semantic_qa",
        "contradictions",
        "science_review",
        "concept_revision_apply",
        "lint",
        "status_dashboard",
    ];
    let id = format!("{}-ingest-pipeline", Local::now().format("%Y%m%d-%H%M%S"));
    let log_path = vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{id}.log"));
    let mut exit_code = 0;
    for job_id in &runnable_job_ids {
        let _ = update_ingest_job_record(&vault, job_id, "running", None, None);
    }
    for kind in sequence {
        let log = run_runtime_task(
            Some(&app),
            &vault,
            runtime_path.as_deref(),
            &python_path,
            kind,
            &obsidian_profile,
            skip_downloads,
            timeout_seconds,
            retry_count,
            None,
        )?;
        if log.exit_code != 0 {
            exit_code = log.exit_code;
            for job_id in &runnable_job_ids {
                let _ = update_ingest_job_record(
                    &vault,
                    job_id,
                    "failed",
                    Some(format!(
                        "runtime step {} failed with exit {}",
                        log.kind, log.exit_code
                    )),
                    Some(log.log_path.clone()),
                );
            }
            logs.push(log);
            break;
        }
        logs.push(log);
    }

    let published_sources = if exit_code == 0 {
        let sources = record_published_ingest(&vault, &final_plan, &id, &log_path)?;
        for job_id in &runnable_job_ids {
            let _ = update_ingest_job_record(
                &vault,
                job_id,
                "succeeded",
                None,
                Some(to_display(&log_path)),
            );
        }
        let _ = plan_ingest(to_display(&vault))?;
        sources
    } else {
        Vec::new()
    };
    let mut rendered = format!(
        "# Desktop Ingest Pipeline\n\nstarted_at: {}\nexit_code: {}\nparsed_artifacts: {}\nstaged_artifacts: {}\npublished_sources: {}\n\n",
        Local::now().to_rfc3339(),
        exit_code,
        parsed_artifacts.len(),
        staged_artifacts.len(),
        published_sources.len()
    );
    if !parsed_artifacts.is_empty() {
        rendered.push_str("## Parsed Artifacts\n\n");
        for artifact in &parsed_artifacts {
            rendered.push_str(&format!("- {artifact}\n"));
        }
        rendered.push('\n');
    }
    if !staged_artifacts.is_empty() {
        rendered.push_str("## Staged Artifacts\n\n");
        for artifact in &staged_artifacts {
            rendered.push_str(&format!("- {artifact}\n"));
        }
        rendered.push('\n');
    }
    if !published_sources.is_empty() {
        rendered.push_str("## Published Sources\n\n");
        for source in &published_sources {
            rendered.push_str(&format!("- {source}\n"));
        }
        rendered.push('\n');
    }
    rendered.push_str("## Runtime Steps\n\n");
    for log in &logs {
        rendered.push_str(&format!(
            "- {}: exit {} ({})\n",
            log.kind, log.exit_code, log.log_path
        ));
    }
    write_text(&log_path, &rendered)?;

    Ok(IngestPipelineResult {
        id,
        parsed_artifacts,
        staged_artifacts,
        published_sources,
        logs,
        exit_code,
        log_path: to_display(&log_path),
    })
}

#[tauri::command]
fn start_ingest_pipeline_job(
    app: AppHandle,
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    obsidian_profile: String,
    skip_downloads: bool,
    pdf_parser: String,
    cloud_parsing_allowed: bool,
    layout_parsing_api_url: String,
    timeout_seconds: usize,
    retry_count: usize,
) -> Result<RuntimeJobEvent, String> {
    let vault = PathBuf::from(&vault_path);
    require_existing_dir(&vault, "vault")?;
    let job_id = new_runtime_job_id("ingest_pipeline");
    let started_at = Local::now().to_rfc3339();
    let command = vec!["desktop:ingest_pipeline".to_string()];
    let start_event = runtime_job_start_event(
        &job_id,
        "ingest_pipeline",
        command.clone(),
        started_at.clone(),
        retry_count.max(1),
        "background ingest pipeline queued",
        None,
        None,
    );
    append_runtime_job_state(&vault, &start_event)?;
    emit_runtime_event(Some(&app), start_event.clone());

    thread::spawn(move || {
        let started = Instant::now();
        let result = run_ingest_pipeline(
            app.clone(),
            vault_path.clone(),
            runtime_path,
            python_path,
            obsidian_profile,
            skip_downloads,
            pdf_parser,
            cloud_parsing_allowed,
            layout_parsing_api_url,
            timeout_seconds,
            retry_count,
        )
        .map(|pipeline| {
            let stdout = format!(
                "parsed_artifacts={}\nstaged_artifacts={}\npublished_sources={}\n",
                pipeline.parsed_artifacts.len(),
                pipeline.staged_artifacts.len(),
                pipeline.published_sources.len()
            );
            TaskLog {
                id: pipeline.id,
                kind: "ingest_pipeline".to_string(),
                command: command.clone(),
                started_at: started_at.clone(),
                ended_at: Local::now().to_rfc3339(),
                exit_code: pipeline.exit_code,
                stdout,
                stderr: String::new(),
                log_path: pipeline.log_path,
            }
        });
        let finish_event = runtime_job_finish_event(
            job_id,
            "ingest_pipeline".to_string(),
            command,
            started_at,
            started,
            retry_count.max(1),
            result,
        );
        emit_runtime_event(Some(&app), finish_event.clone());
        let _ = append_runtime_job_state(&PathBuf::from(vault_path), &finish_event);
    });

    Ok(start_event)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn test_vault(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let vault = std::env::temp_dir().join(format!(
            "llm-wiki-desktop-{name}-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(vault.join("raw").join("inbox")).expect("create raw inbox");
        fs::create_dir_all(vault.join("_state")).expect("create state dir");
        vault
    }

    fn write_test_zip(path: &Path, entries: &[(&str, &[u8])]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create zip parent");
        }
        let file = fs::File::create(path).expect("create zip file");
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            zip.start_file(name, options).expect("start zip file");
            zip.write_all(content).expect("write zip entry");
        }
        zip.finish().expect("finish zip");
    }

    fn agent_http_request(
        port: u16,
        token: Option<&str>,
        method: &str,
        path: &str,
        body: &str,
    ) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect agent API");
        let auth = token
            .map(|value| format!("Authorization: Bearer {value}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{auth}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.as_bytes().len(),
        );
        stream.write_all(request.as_bytes()).expect("write request");
        let mut response = Vec::new();
        let mut chunk = [0_u8; 1024];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => response.extend_from_slice(&chunk[..read]),
                Err(err) if err.kind() == std::io::ErrorKind::ConnectionReset => break,
                Err(err) => panic!("read response: {err}"),
            }
        }
        String::from_utf8_lossy(&response).to_string()
    }

    #[test]
    fn load_desktop_settings_disables_deferred_source_auto_ingest() {
        let vault = test_vault("settings-load-source-auto-ingest");
        let mut settings = DesktopSettings::default();
        settings.source_watch_enabled = true;
        settings.source_watch_auto_ingest = true;
        let rendered = serde_json::to_string_pretty(&settings).expect("serialize settings");
        write_text(&desktop_settings_path(&vault), &(rendered + "\n")).expect("write settings");

        let loaded = load_desktop_settings(to_display(&vault)).expect("load settings");

        assert!(loaded.source_watch_enabled);
        assert!(!loaded.source_watch_auto_ingest);
    }

    #[test]
    fn save_desktop_settings_persists_deferred_source_auto_ingest_as_false() {
        let vault = test_vault("settings-save-source-auto-ingest");
        let mut settings = DesktopSettings::default();
        settings.source_watch_enabled = true;
        settings.source_watch_auto_ingest = true;

        let saved = save_desktop_settings(to_display(&vault), settings).expect("save settings");
        let rendered = read_text(&desktop_settings_path(&vault));

        assert!(saved.source_watch_enabled);
        assert!(!saved.source_watch_auto_ingest);
        assert!(rendered.contains("\"sourceWatchAutoIngest\": false"));
    }

    #[test]
    fn save_desktop_settings_syncs_generated_project_purpose_note() {
        let vault = test_vault("settings-project-purpose-note");
        let mut settings = DesktopSettings::default();
        settings.project_name = "DeepSeek Research Wiki".to_string();
        settings.project_template = "research".to_string();
        settings.project_purpose =
            "Track DeepSeek evidence, decisions, review state, and writeback ideas.".to_string();
        settings.ai_output_language = "简体中文".to_string();

        let saved = save_desktop_settings(to_display(&vault), settings).expect("save settings");
        let purpose = read_text(&vault.join("purpose.md"));

        assert_eq!(saved.project_name, "DeepSeek Research Wiki");
        assert!(purpose.contains("# DeepSeek Research Wiki"));
        assert!(purpose.contains(GENERATED_PURPOSE_MARKER));
        assert!(purpose
            .contains("Track DeepSeek evidence, decisions, review state, and writeback ideas."));
        assert!(purpose.contains("- Template: `research`"));
        assert!(purpose.contains("- Output language: 简体中文"));
        assert!(purpose.contains("It is not evidence by itself"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn save_desktop_settings_preserves_manual_project_purpose_note() {
        let vault = test_vault("settings-manual-purpose-note");
        write_text(
            &vault.join("purpose.md"),
            "# Manual Purpose\n\nDo not replace this user-authored note.\n",
        )
        .expect("write manual purpose");
        let mut settings = DesktopSettings::default();
        settings.project_name = "Generated Name".to_string();
        settings.project_purpose =
            "Generated purpose should not overwrite manual text.".to_string();

        save_desktop_settings(to_display(&vault), settings).expect("save settings");
        let purpose = read_text(&vault.join("purpose.md"));

        assert!(purpose.contains("# Manual Purpose"));
        assert!(purpose.contains("Do not replace this user-authored note."));
        assert!(!purpose.contains(GENERATED_PURPOSE_MARKER));
        assert!(!purpose.contains("Generated purpose should not overwrite manual text."));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn inspect_vault_and_agent_search_surface_root_wiki_notes() {
        let vault = test_vault("root-wiki-notes");
        create_minimal_vault(&vault).expect("create minimal vault");
        fs::create_dir_all(vault.join(".graph")).expect("create graph dir");
        write_text(
            &vault.join(".graph").join("graph-report.md"),
            "# Wiki Graph Report\n\nDeepSeek evidence anchor warning for graph QA.\n",
        )
        .expect("write graph report");
        write_text(
            &vault.join("canvas").join("wiki-graph.canvas"),
            "{\"nodes\":[{\"id\":\"deepseek\",\"label\":\"DeepSeek graph canvas\"}],\"edges\":[]}\n",
        )
        .expect("write graph canvas");
        let mut settings = DesktopSettings::default();
        settings.project_name = "DeepSeek Research Wiki".to_string();
        settings.project_purpose =
            "Keep DeepSeek research direction visible before ingest and writeback.".to_string();
        save_desktop_settings(to_display(&vault), settings).expect("save settings");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let note_paths = status
            .files
            .iter()
            .filter(|file| file.kind == "note")
            .map(|file| rel_path(&vault, &PathBuf::from(&file.path)))
            .collect::<Vec<_>>();

        assert!(status.counts.notes >= 5);
        assert!(note_paths.contains(&"purpose.md".to_string()));
        assert!(note_paths.contains(&"index.md".to_string()));
        assert!(note_paths.contains(&"log.md".to_string()));
        assert!(status.files.iter().any(|file| {
            file.kind == "note"
                && file.name == "purpose.md"
                && file.title.as_deref() == Some("DeepSeek Research Wiki")
                && file
                    .excerpt
                    .as_deref()
                    .is_some_and(|excerpt| excerpt.contains("research direction"))
        }));
        assert!(status.files.iter().any(|file| {
            file.kind == "report"
                && file.path.ends_with(".graph/graph-report.md")
                && file.title.as_deref() == Some("Wiki Graph Report")
        }));
        assert!(status.files.iter().any(|file| {
            file.kind == "report"
                && file.path.ends_with("canvas/wiki-graph.canvas")
                && file.name == "wiki-graph.canvas"
        }));

        let search = agent_search_vault(&vault, "research direction", 10).expect("search notes");
        assert!(search.iter().any(|item| item.path == "purpose.md"));
        let graph_search =
            agent_search_vault(&vault, "evidence anchor warning", 10).expect("search graph report");
        assert!(graph_search
            .iter()
            .any(|item| item.path == ".graph/graph-report.md"));
        let canvas_search =
            agent_search_vault(&vault, "graph canvas", 10).expect("search graph canvas");
        assert!(canvas_search
            .iter()
            .any(|item| item.path == "canvas/wiki-graph.canvas"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn desktop_settings_reject_remote_plain_http_searxng_endpoint() {
        let vault = test_vault("searxng-remote-http");
        let mut settings = DesktopSettings::default();
        settings.web_search_enabled = true;
        settings.web_search_provider = "searxng".to_string();
        settings.web_search_endpoint = "http://search.example.com".to_string();

        let rejected = save_desktop_settings(to_display(&vault), settings);

        assert!(rejected.is_err());
        assert!(rejected
            .unwrap_err()
            .contains("SearXNG endpoint must use HTTPS"));
        assert!(!desktop_settings_path(&vault).is_file());
    }

    #[test]
    fn desktop_settings_allow_https_and_loopback_searxng_endpoints() {
        for (index, endpoint) in [
            "https://search.example.com",
            "http://localhost:8080",
            "http://127.0.0.1:8080/search",
            "http://[::1]:8080",
        ]
        .iter()
        .enumerate()
        {
            let vault = test_vault(&format!("searxng-allowed-endpoint-{index}"));
            let mut settings = DesktopSettings::default();
            settings.web_search_enabled = true;
            settings.web_search_provider = "searxng".to_string();
            settings.web_search_endpoint = (*endpoint).to_string();

            let saved = save_desktop_settings(to_display(&vault), settings).expect(endpoint);

            assert_eq!(saved.web_search_endpoint, *endpoint);
            assert!(desktop_settings_path(&vault).is_file());
        }
    }

    #[test]
    fn desktop_settings_reject_localhost_prefix_searxng_endpoint() {
        for endpoint in [
            "http://localhost.evil.com",
            "http://127.0.0.1.evil.com",
            "http://[::1].evil.com",
            "http://localhost@search.example.com",
        ] {
            let vault = test_vault("searxng-localhost-prefix");
            let mut settings = DesktopSettings::default();
            settings.web_search_enabled = true;
            settings.web_search_provider = "searxng".to_string();
            settings.web_search_endpoint = endpoint.to_string();

            let rejected = save_desktop_settings(to_display(&vault), settings);

            assert!(rejected.is_err(), "{endpoint} should be rejected");
            assert!(!desktop_settings_path(&vault).is_file());
        }
    }

    #[test]
    fn llm_provider_urls_match_chat_endpoints() {
        assert_eq!(
            openai_chat_completions_url("https://api.deepseek.com/v1"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            openai_chat_completions_url("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            anthropic_messages_url("https://api.anthropic.com/v1"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            anthropic_messages_url("https://api.minimax.io/anthropic"),
            "https://api.minimax.io/anthropic/v1/messages"
        );
    }

    #[test]
    fn llm_provider_rejects_remote_plain_http() {
        assert!(validate_llm_base_url("http://api.example.com/v1").is_err());
        assert!(validate_llm_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_llm_base_url("http://127.0.0.1:11434/v1").is_ok());
        assert!(validate_llm_base_url("http://[::1]:11434/v1").is_ok());
        assert!(validate_llm_base_url("https://api.example.com/v1").is_ok());
    }

    #[test]
    fn llm_provider_rejects_localhost_prefix_spoofing() {
        assert!(validate_llm_base_url("http://localhost.evil.com/v1").is_err());
        assert!(validate_llm_base_url("http://127.0.0.1.evil.com/v1").is_err());
        assert!(validate_llm_base_url("http://[::1].evil.com/v1").is_err());
        assert!(validate_llm_base_url("http://localhost@api.example.com/v1").is_err());
    }

    #[test]
    fn desktop_settings_reject_remote_plain_http_layout_parser_endpoint() {
        for endpoint in [
            "http://api.example.com/layout",
            "http://localhost.evil.com/layout",
            "http://localhost@api.example.com/layout",
        ] {
            let vault = test_vault("layout-parser-endpoint");
            let mut settings = DesktopSettings::default();
            settings.default_pdf_parser = "layout-api".to_string();
            settings.cloud_parsing_allowed = true;
            settings.layout_parsing_api_url = endpoint.to_string();

            let error = save_desktop_settings(to_display(&vault), settings)
                .expect_err("unsafe layout parser endpoint should be rejected");
            assert!(
                error.contains("Layout parsing API URL must use HTTPS unless it is localhost HTTP")
            );
            assert!(!desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_reject_remote_plain_http_embedding_endpoint() {
        for endpoint in [
            "http://api.example.com/v1/embeddings",
            "http://localhost.evil.com/v1/embeddings",
            "http://localhost@api.example.com/v1/embeddings",
        ] {
            let vault = test_vault("embedding-endpoint");
            let mut settings = DesktopSettings::default();
            settings.embedding_enabled = true;
            settings.embedding_endpoint = endpoint.to_string();

            let error = save_desktop_settings(to_display(&vault), settings)
                .expect_err("unsafe embedding endpoint should be rejected");
            assert!(error.contains("Embedding endpoint must use HTTPS unless it is localhost HTTP"));
            assert!(!desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_reject_remote_plain_http_captioning_endpoint() {
        for endpoint in [
            "http://api.example.com/v1/chat/completions",
            "http://localhost.evil.com/v1/chat/completions",
            "http://localhost@api.example.com/v1/chat/completions",
        ] {
            let vault = test_vault("captioning-endpoint");
            let mut settings = DesktopSettings::default();
            settings.captioning_enabled = true;
            settings.captioning_use_main_provider = false;
            settings.captioning_provider = "openai-compatible".to_string();
            settings.captioning_endpoint = endpoint.to_string();

            let error = save_desktop_settings(to_display(&vault), settings)
                .expect_err("unsafe captioning endpoint should be rejected");
            assert!(
                error.contains("Captioning endpoint must use HTTPS unless it is localhost HTTP")
            );
            assert!(!desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_allow_https_and_loopback_layout_parser_endpoints() {
        for endpoint in [
            "https://api.example.com/layout",
            "http://localhost:8000/layout",
            "http://127.0.0.1:8000/layout",
            "http://[::1]:8000/layout",
        ] {
            let vault = test_vault("layout-parser-endpoint-allowed");
            let mut settings = DesktopSettings::default();
            settings.default_pdf_parser = "layout-api".to_string();
            settings.cloud_parsing_allowed = true;
            settings.layout_parsing_api_url = format!(" {endpoint} ");

            let saved =
                save_desktop_settings(to_display(&vault), settings).expect("save parser endpoint");
            assert_eq!(saved.layout_parsing_api_url, endpoint);
            assert!(desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_allow_https_and_loopback_embedding_endpoints() {
        for endpoint in [
            "https://api.example.com/v1/embeddings",
            "http://localhost:1234/v1/embeddings",
            "http://127.0.0.1:1234/v1/embeddings",
            "http://[::1]:1234/v1/embeddings",
        ] {
            let vault = test_vault("embedding-endpoint-allowed");
            let mut settings = DesktopSettings::default();
            settings.embedding_enabled = true;
            settings.embedding_endpoint = format!(" {endpoint} ");

            let saved = save_desktop_settings(to_display(&vault), settings)
                .expect("save embedding endpoint");
            assert_eq!(saved.embedding_endpoint, endpoint);
            assert!(desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_allow_https_and_loopback_captioning_endpoints() {
        for endpoint in [
            "https://api.example.com/v1/chat/completions",
            "http://localhost:11434/v1/chat/completions",
            "http://127.0.0.1:11434/v1/chat/completions",
            "http://[::1]:11434/v1/chat/completions",
        ] {
            let vault = test_vault("captioning-endpoint-allowed");
            let mut settings = DesktopSettings::default();
            settings.captioning_enabled = true;
            settings.captioning_use_main_provider = false;
            settings.captioning_provider = "openai-compatible".to_string();
            settings.captioning_endpoint = format!(" {endpoint} ");

            let saved = save_desktop_settings(to_display(&vault), settings)
                .expect("save captioning endpoint");
            assert_eq!(saved.captioning_endpoint, endpoint);
            assert!(desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn llm_answer_prompt_keeps_evidence_and_writeback_boundary() {
        let request = LlmAnswerRequest {
            provider_id: "deepseek".to_string(),
            provider_name: "DeepSeek".to_string(),
            api_protocol: "openai-compatible".to_string(),
            api_base_url: "https://api.deepseek.com/v1".to_string(),
            api_key_env_var: "DEEPSEEK_API_KEY".to_string(),
            model: "deepseek-chat".to_string(),
            context_window: 64_000,
            reasoning_mode: "balanced".to_string(),
            language: "zh".to_string(),
            question: "DeepSeek 的研发思路是什么？".to_string(),
            target_path: "reviews/query-writeback/deepseek-research-insights.md".to_string(),
            evidence: vec![LlmAnswerEvidenceRef {
                id: "claim:1".to_string(),
                evidence_type: "claim".to_string(),
                title: "claim-1".to_string(),
                path: "claims/claims.jsonl".to_string(),
                snippet: "reported claim".to_string(),
                evidence: Some("source quote".to_string()),
                status: Some("supported".to_string()),
                severity: None,
                relations: vec!["claim: claim-1".to_string(), "source: LLM-0001".to_string()],
            }],
        };
        let (system, user) = build_llm_answer_prompts(&request);
        assert!(system.contains("不能声称已经写回或批准"));
        assert!(user.contains("E1 [claim] claim-1"));
        assert!(user.contains("每条确定性结论必须引用 E 编号"));
    }

    #[test]
    fn llm_answer_calls_local_openai_compatible_endpoint_without_key() {
        let vault = test_vault("local-llm-answer");
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local mock server");
        let addr = listener.local_addr().expect("local addr");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut buffer = [0_u8; 4096];
            let _ = stream.read(&mut buffer).expect("read request");
            let body = r#"{"choices":[{"message":{"content":"Local model answer citing E1."}}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream
                .write_all(response.as_bytes())
                .expect("write response");
        });
        let request = LlmAnswerRequest {
            provider_id: "ollama-local".to_string(),
            provider_name: "Ollama Local".to_string(),
            api_protocol: "openai-compatible".to_string(),
            api_base_url: format!("http://{addr}/v1"),
            api_key_env_var: "".to_string(),
            model: "qwen3".to_string(),
            context_window: 32_768,
            reasoning_mode: "balanced".to_string(),
            language: "en".to_string(),
            question: "What does the evidence say?".to_string(),
            target_path: "reviews/query-writeback/research-insight.md".to_string(),
            evidence: vec![LlmAnswerEvidenceRef {
                id: "source:1".to_string(),
                evidence_type: "source".to_string(),
                title: "Source 1".to_string(),
                path: "sources/LLM-0001.md".to_string(),
                snippet: "snippet".to_string(),
                evidence: Some("quote".to_string()),
                status: Some("loaded".to_string()),
                severity: None,
                relations: vec!["source: LLM-0001".to_string()],
            }],
        };
        let result =
            tauri::async_runtime::block_on(generate_llm_answer(to_display(&vault), request))
                .expect("generate answer");
        server.join().expect("server join");
        assert_eq!(result.answer, "Local model answer citing E1.");
        assert_eq!(result.provider_id, "ollama-local");
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn plan_restages_changed_text_artifact() {
        let vault = test_vault("changed-text");
        let source = vault.join("raw").join("paper.md");
        write_text(&source, "old content\n").expect("write original source");
        let old_hash = sha256_file(&source).expect("hash original source");
        let artifact = artifact_for_source(&vault, &source, &old_hash);
        write_text(&artifact, "old content\n").expect("write original artifact");
        append_cache_row(&vault, &source, &old_hash, &artifact).expect("cache original artifact");

        write_text(&source, "new content\n").expect("write changed source");
        let entry = plan_entry_for_source(
            &vault,
            &source,
            &load_cached_ingest_hashes(&vault),
            &load_published_ingest_keys(&vault),
        )
        .expect("plan changed source");

        assert_eq!(entry.status, "stageable");
        assert_eq!(entry.action, "restage_text_artifact");
        assert_eq!(entry.current_state, "stale_artifact");
        assert_eq!(
            entry.command,
            vec!["desktop:run_ingest_pipeline".to_string()]
        );
        assert!(entry
            .inputs
            .iter()
            .any(|item| item.ends_with("raw/paper.md")));
        assert!(entry
            .outputs
            .iter()
            .any(|item| item.ends_with("manifest.json")));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn successful_pipeline_registry_marks_artifact_published() {
        let vault = test_vault("published");
        let source = vault.join("raw").join("note.md");
        write_text(&source, "# Note\n").expect("write source");
        let staged = stage_text_artifacts(&vault).expect("stage text artifact");
        assert_eq!(staged.len(), 1);
        let artifact = PathBuf::from(&staged[0]);
        let artifact_dir = artifact.parent().expect("artifact dir");
        assert!(artifact_dir.join("manifest.json").is_file());
        assert!(artifact_dir.join("chunks.jsonl").is_file());

        let plan = plan_ingest(to_display(&vault)).expect("plan staged source");
        assert_eq!(plan.summary.cached, 1);
        assert_eq!(plan.registry.len(), 1);
        assert_eq!(plan.artifacts.len(), 1);
        assert_eq!(plan.jobs.len(), 1);
        assert!(!plan.actions.is_empty());
        assert!(!plan.impact_edges.is_empty());
        assert_eq!(plan.artifacts[0].status, "fresh");
        assert!(plan.artifacts[0].anchors_lines);
        assert!(vault
            .join("_state")
            .join("desktop-source-registry.jsonl")
            .is_file());
        assert!(vault
            .join("_state")
            .join("desktop-artifacts.jsonl")
            .is_file());
        assert!(vault
            .join("_state")
            .join("desktop-ingest-jobs.jsonl")
            .is_file());
        assert!(vault.join("_state").join("desktop-actions.jsonl").is_file());
        assert!(vault
            .join("_state")
            .join("desktop-impact-graph.jsonl")
            .is_file());
        let log_path = vault.join("log-archive").join("desktop").join("test.log");
        let published =
            record_published_ingest(&vault, &plan, "test-pipeline", &log_path).expect("publish");
        assert_eq!(published.len(), 1);

        let next_plan = plan_ingest(to_display(&vault)).expect("plan published source");
        assert_eq!(next_plan.summary.published, 1);
        assert_eq!(next_plan.entries[0].status, "published");
        assert_eq!(next_plan.entries[0].current_state, "published");
        assert!(next_plan.entries[0].artifact_sha256.is_some());
        assert!(next_plan.entries[0].command.is_empty());
        assert!(next_plan.entries[0]
            .outputs
            .iter()
            .any(|item| item == "_state/published-ingest.jsonl"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn plan_blocks_stale_parsed_binary_artifact() {
        let vault = test_vault("stale-pdf");
        let source = vault.join("raw").join("paper.pdf");
        fs::write(&source, b"old pdf bytes").expect("write original pdf");
        let old_hash = sha256_file(&source).expect("hash original pdf");
        let artifact = artifact_for_source(&vault, &source, &old_hash);
        write_text(&artifact, "parsed markdown\n").expect("write parsed artifact");
        let manifest = artifact
            .parent()
            .expect("artifact parent")
            .join("manifest.json");
        write_text(
            &manifest,
            &format!(
                "{{\"source_path\":\"raw/paper.pdf\",\"sha256\":\"{}\"}}\n",
                old_hash
            ),
        )
        .expect("write parser manifest");

        fs::write(&source, b"new pdf bytes").expect("write changed pdf");
        let entry = plan_entry_for_source(
            &vault,
            &source,
            &load_cached_ingest_hashes(&vault),
            &load_published_ingest_keys(&vault),
        )
        .expect("plan changed pdf");

        assert_eq!(entry.status, "blocked");
        assert_eq!(entry.action, "parse_required");
        assert_eq!(entry.current_state, "stale_artifact");
        assert_eq!(
            entry.next_action_label,
            "Re-parse this source locally before ingest"
        );
        assert!(entry
            .parser_hint
            .as_deref()
            .is_some_and(|hint| hint.contains("--parser auto --no-download-images")));
        assert!(entry
            .command
            .iter()
            .any(|item| item.contains("pdf_to_markdown.py")));
        assert!(entry.outputs.iter().any(|item| item.ends_with("parse.log")));
        assert!(!entry.uses_network);

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn ingest_plan_entries_explain_pdf_next_action() {
        let vault = test_vault("pdf-plan-state");
        let source = vault.join("raw").join("paper.pdf");
        fs::write(&source, b"pdf bytes").expect("write pdf");

        let plan = plan_ingest(to_display(&vault)).expect("plan pdf");
        let entry = plan
            .entries
            .iter()
            .find(|entry| entry.file_name == "paper.pdf")
            .expect("pdf entry");

        assert_eq!(entry.status, "blocked");
        assert_eq!(entry.current_state, "parse_required");
        assert_eq!(
            entry.next_action_label,
            "Parse this source locally before ingest"
        );
        assert_eq!(entry.inputs, vec!["raw/paper.pdf".to_string()]);
        assert!(entry
            .command
            .iter()
            .any(|item| item.contains("pdf_to_markdown.py")));
        assert!(entry
            .outputs
            .iter()
            .any(|item| item.ends_with("combined.md")));
        assert!(entry
            .outputs
            .iter()
            .any(|item| item.ends_with("manifest.json")));
        assert!(!entry.requires_human_approval);
        assert!(!entry.uses_network);

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn ingest_plan_discovers_nested_raw_corpus_artifacts() {
        let vault = test_vault("nested-raw-corpus-plan");
        let corpus = vault.join("raw").join("deepseek_paper");
        fs::create_dir_all(&corpus).expect("create corpus dir");
        let source = corpus.join("DeepSeek_Test_2401.00001.pdf");
        fs::write(&source, b"pdf bytes").expect("write nested pdf");
        let source_hash = sha256_file(&source).expect("source hash");
        let artifact_dir = corpus.join("DeepSeek_Test_2401.00001_markdown");
        fs::create_dir_all(&artifact_dir).expect("create artifact dir");
        write_text(
            &artifact_dir.join("combined.md"),
            "# DeepSeek Test\n\nParsed evidence.\n",
        )
        .expect("write combined artifact");
        write_text(
            &artifact_dir.join("manifest.json"),
            &format!(
                "{{\"source_path\":\"raw/deepseek_paper/DeepSeek_Test_2401.00001.pdf\",\"source_sha256\":\"{}\"}}\n",
                source_hash
            ),
        )
        .expect("write manifest");
        write_text(
            &corpus.join("索引.md"),
            "# deepseek_paper 中文转换索引\n\n- helper note, not evidence\n",
        )
        .expect("write support index");
        #[cfg(unix)]
        let external_raw = {
            let external = test_vault("nested-raw-corpus-external-raw");
            fs::write(external.join("outside.pdf"), b"outside pdf").expect("write external raw");
            std::os::unix::fs::symlink(&external, corpus.join("linked-external"))
                .expect("create raw symlink");
            external
        };
        #[cfg(unix)]
        let external_artifact = {
            let external = test_vault("nested-raw-corpus-external-artifact");
            write_text(&external.join("combined.md"), "# external artifact\n")
                .expect("write external artifact");
            std::os::unix::fs::symlink(&external, corpus.join("external_markdown"))
                .expect("create artifact symlink");
            external
        };

        let plan = plan_ingest(to_display(&vault)).expect("plan nested corpus");

        assert_eq!(plan.summary.total, 1);
        assert_eq!(plan.summary.ready, 1);
        let entry = plan
            .entries
            .iter()
            .find(|entry| entry.file_name == "DeepSeek_Test_2401.00001.pdf")
            .expect("nested pdf entry");
        assert_eq!(entry.status, "ready");
        assert_eq!(entry.action, "run_ingest_corpus");
        assert_eq!(entry.current_state, "ingest_ready");
        assert_eq!(
            entry.inputs,
            vec!["raw/deepseek_paper/DeepSeek_Test_2401.00001.pdf".to_string()]
        );
        assert!(entry.artifact_path.as_deref().is_some_and(|path| path
            .ends_with("raw/deepseek_paper/DeepSeek_Test_2401.00001_markdown/combined.md")));
        assert!(plan
            .entries
            .iter()
            .all(|entry| entry.file_name != "索引.md"));

        let _ = fs::remove_dir_all(vault);
        #[cfg(unix)]
        {
            let _ = fs::remove_dir_all(external_raw);
            let _ = fs::remove_dir_all(external_artifact);
        }
    }

    #[test]
    fn inspect_vault_counts_nested_raw_corpus_sources() {
        let vault = test_vault("nested-raw-corpus-status");
        create_minimal_vault(&vault).expect("create minimal vault");
        let corpus = vault.join("raw").join("deepseek_paper");
        fs::create_dir_all(&corpus).expect("create corpus dir");
        fs::write(corpus.join("DeepSeek_Test_2401.00001.pdf"), b"pdf bytes")
            .expect("write nested pdf");
        write_text(
            &corpus.join("索引.md"),
            "# deepseek_paper 中文转换索引\n\n- helper note, not evidence\n",
        )
        .expect("write support index");
        let artifact_dir = corpus.join("DeepSeek_Test_2401.00001_markdown");
        fs::create_dir_all(&artifact_dir).expect("create parser artifact dir");
        write_text(&artifact_dir.join("combined.md"), "# parsed\n").expect("write artifact");
        #[cfg(unix)]
        let external_raw = {
            let external = test_vault("nested-raw-corpus-status-external");
            fs::write(external.join("outside.pdf"), b"outside pdf").expect("write outside raw");
            std::os::unix::fs::symlink(&external, corpus.join("linked-external"))
                .expect("create external raw symlink");
            external
        };

        let status = inspect_vault(to_display(&vault)).expect("inspect nested raw corpus");

        assert_eq!(status.counts.inbox, 1);
        let raw_files = status
            .files
            .iter()
            .filter(|file| file.kind == "inbox")
            .map(|file| file.path.clone())
            .collect::<Vec<_>>();
        assert_eq!(raw_files.len(), 1);
        assert!(raw_files[0].ends_with("raw/deepseek_paper/DeepSeek_Test_2401.00001.pdf"));
        assert!(status.files.iter().all(|file| file.name != "索引.md"));
        assert!(status
            .files
            .iter()
            .all(|file| !file.path.contains("linked-external")));
        assert!(status
            .files
            .iter()
            .all(|file| !file.path.ends_with("_markdown/combined.md")));

        let _ = fs::remove_dir_all(vault);
        #[cfg(unix)]
        {
            let _ = fs::remove_dir_all(external_raw);
        }
    }

    #[test]
    fn dashboard_action_and_job_overrides_persist_and_skip_cancelled_jobs() {
        let vault = test_vault("status-overrides");
        let source = vault.join("raw").join("paper.md");
        write_text(&source, "# Paper\n").expect("write source");

        let plan = plan_ingest(to_display(&vault)).expect("plan source");
        let action_id = plan.actions[0].action_id.clone();
        let job_id = plan.jobs[0].job_id.clone();

        let action_plan = set_dashboard_action_status(
            to_display(&vault),
            action_id.clone(),
            "ignored".to_string(),
        )
        .expect("set action status");
        assert_eq!(
            action_plan
                .actions
                .iter()
                .find(|action| action.action_id == action_id)
                .expect("action exists")
                .status,
            "ignored"
        );

        let job_plan =
            set_ingest_job_status(to_display(&vault), job_id.clone(), "cancelled".to_string())
                .expect("set job status");
        assert_eq!(
            job_plan
                .jobs
                .iter()
                .find(|job| job.job_id == job_id)
                .expect("job exists")
                .status,
            "cancelled"
        );
        assert!(vault.join("_state").join("ingest-jobs.jsonl").is_file());
        assert!(read_text(&vault.join("_state").join("ingest-jobs.jsonl")).contains("cancelled"));
        let staged = stage_text_artifacts(&vault).expect("stage text artifacts");
        assert!(staged.is_empty());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn source_ids_are_stable_across_rename_and_duplicates() {
        let vault = test_vault("stable-source-id");
        let source = vault.join("raw").join("alpha.md");
        write_text(&source, "# Same Source\n").expect("write source");

        let first_plan = plan_ingest(to_display(&vault)).expect("plan source");
        let first_id = first_plan.registry[0]
            .source_id
            .clone()
            .expect("source id allocated");
        assert_eq!(first_id, "LLM-0001");

        let renamed = vault.join("raw").join("zeta.md");
        fs::rename(&source, &renamed).expect("rename source");
        let second_plan = plan_ingest(to_display(&vault)).expect("plan renamed source");
        let renamed_entry = second_plan
            .registry
            .iter()
            .find(|entry| entry.source_path.ends_with("zeta.md"))
            .expect("renamed entry");
        assert_eq!(renamed_entry.source_id.as_deref(), Some(first_id.as_str()));
        let rename_alias = second_plan
            .source_aliases
            .iter()
            .find(|alias| alias.match_reason == "renamed_or_moved_same_sha256")
            .expect("rename alias");
        assert_eq!(rename_alias.source_id.as_deref(), Some(first_id.as_str()));
        assert_eq!(rename_alias.needs_review, false);
        assert!(rename_alias
            .signals
            .iter()
            .any(|signal| signal.starts_with("sha256:")));
        assert!(
            read_text(&vault.join("_state").join("source-id-aliases.jsonl"))
                .contains("renamed_or_moved_same_sha256")
        );

        let duplicate = vault.join("raw").join("duplicate.md");
        write_text(&duplicate, "# Same Source\n").expect("write duplicate source");
        let duplicate_plan = plan_ingest(to_display(&vault)).expect("plan duplicate source");
        let duplicates = duplicate_plan
            .registry
            .iter()
            .filter(|entry| entry.source_id.as_deref() == Some(first_id.as_str()))
            .count();
        assert_eq!(duplicates, 2);
        assert!(duplicate_plan
            .registry
            .iter()
            .any(|entry| entry.duplicate_of.as_deref() == Some(first_id.as_str())));
        assert!(read_text(&vault.join("_state").join("source-registry.jsonl")).contains(&first_id));

        write_text(&renamed, "# Same Source\nupdated\n").expect("mutate same source path");
        let changed_plan = plan_ingest(to_display(&vault)).expect("plan changed source");
        let changed_entry = changed_plan
            .registry
            .iter()
            .find(|entry| entry.source_path.ends_with("zeta.md"))
            .expect("changed entry");
        assert_eq!(changed_entry.source_id.as_deref(), Some(first_id.as_str()));
        assert!(changed_plan
            .source_aliases
            .iter()
            .any(|alias| alias.match_reason == "renamed_or_moved_same_sha256"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn review_gated_duplicate_sources_do_not_become_pipeline_runnable() {
        let vault = test_vault("duplicate-review-gate");
        let primary = vault.join("raw").join("a-primary.md");
        let duplicate = vault.join("raw").join("z-duplicate.md");
        write_text(&primary, "# Same Source\n").expect("write primary");
        write_text(&duplicate, "# Same Source\n").expect("write duplicate");

        let plan = plan_ingest(to_display(&vault)).expect("plan duplicate sources");
        let duplicate_entry = plan
            .entries
            .iter()
            .find(|entry| entry.file_name == "z-duplicate.md")
            .expect("duplicate plan entry");
        assert_eq!(duplicate_entry.current_state, "duplicate");
        assert!(duplicate_entry.requires_human_approval);
        assert!(!plan_entry_is_pipeline_runnable(duplicate_entry));

        let duplicate_job = plan
            .jobs
            .iter()
            .find(|job| job.file_name == "z-duplicate.md")
            .expect("duplicate ingest job");
        assert_eq!(duplicate_job.status, "blocked");
        assert_eq!(duplicate_job.current_step, "review_gate");
        assert_eq!(duplicate_job.next_action, "inspect_source");
        assert!(plan.actions.iter().any(|action| {
            action.kind == "source_review_required"
                && action.primary_object_id == source_uuid(&duplicate_entry.sha256)
        }));

        let staged = stage_text_artifacts(&vault).expect("stage non-gated text artifacts");
        assert_eq!(staged.len(), 1);
        assert!(staged
            .iter()
            .all(|path| !path.contains("z-duplicate_markdown")));
        let duplicate_artifact = artifact_for_source(&vault, &duplicate, &duplicate_entry.sha256);
        assert!(!duplicate_artifact.is_file());

        let after_stage = plan_ingest(to_display(&vault)).expect("plan after staging");
        let duplicate_after = after_stage
            .entries
            .iter()
            .find(|entry| entry.file_name == "z-duplicate.md")
            .expect("duplicate plan entry after staging");
        assert_eq!(duplicate_after.current_state, "duplicate");
        assert!(duplicate_after.requires_human_approval);
        assert!(!plan_entry_is_pipeline_runnable(duplicate_after));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn plan_reports_deleted_registered_source_without_deleting_outputs() {
        let vault = test_vault("deleted-source-plan");
        let source = vault.join("raw").join("note.md");
        write_text(&source, "# Source\n").expect("write source");

        let first_plan = plan_ingest(to_display(&vault)).expect("plan source");
        let source_id = first_plan.registry[0].source_id.clone().expect("source id");
        let source_page = vault.join(source_page_for_id(&source_id));
        write_text(&source_page, "# Source Page\n").expect("source page");
        let concept = vault.join("concepts").join("research-strategy.md");
        write_text(&concept, "# Research Strategy\n").expect("concept page");

        fs::remove_file(&source).expect("delete raw source");
        let deleted_plan = plan_ingest(to_display(&vault)).expect("plan deleted source");
        let missing = deleted_plan
            .registry
            .iter()
            .find(|entry| entry.status == "missing_raw_source")
            .expect("missing source registry entry");
        assert_eq!(missing.source_id.as_deref(), Some(source_id.as_str()));
        assert_eq!(missing.source_path, "raw/note.md");
        assert!(missing
            .last_error
            .as_deref()
            .unwrap_or_default()
            .contains("does not delete source or concept pages"));
        assert!(deleted_plan
            .lint_findings
            .iter()
            .any(|finding| finding.kind == "missing_raw_source"));
        assert!(deleted_plan
            .actions
            .iter()
            .any(|action| action.reason == "missing_raw_source"));
        assert!(source_page.is_file());
        assert!(concept.is_file());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn source_id_alias_contract_flags_possible_doi_version() {
        let vault = test_vault("source-alias-version");
        let incoming = vault.join("incoming");
        fs::create_dir_all(&incoming).expect("create incoming");
        let first = incoming.join("deepseek-v1.md");
        let second = incoming.join("deepseek-v2.md");
        write_text(&first, "DOI: 10.1234/deepseek\nold evidence\n").expect("write first");
        write_text(&second, "DOI: 10.1234/deepseek\nnew evidence\n").expect("write second");

        let first_import = import_sources_impl(&vault, vec![to_display(&first)], false, false)
            .expect("import first");
        assert_eq!(first_import.imported.len(), 1);
        let first_target = first_import.imported[0]
            .target_path
            .clone()
            .expect("first target");
        let _ = plan_ingest(to_display(&vault)).expect("plan first source");

        let second_import = import_sources_impl(&vault, vec![to_display(&second)], false, false)
            .expect("import second");
        assert_eq!(second_import.imported.len(), 1);
        assert_eq!(
            second_import.imported[0].duplicate_reason.as_deref(),
            Some("doi")
        );

        let plan = plan_ingest(to_display(&vault)).expect("plan version alias");
        let alias = plan
            .source_aliases
            .iter()
            .find(|alias| alias.match_reason == "same_doi_different_sha256")
            .expect("doi alias");
        assert!(alias.needs_review);
        assert_eq!(alias.status, "possible_new_version");
        let first_target_rel = rel_path(&vault, &PathBuf::from(&first_target));
        assert_eq!(
            alias.old_source_path.as_deref(),
            Some(first_target_rel.as_str())
        );
        assert!(alias
            .signals
            .iter()
            .any(|signal| signal == "doi:10.1234/deepseek"));
        assert!(
            read_text(&vault.join("_state").join("source-id-aliases.jsonl"))
                .contains("same_doi_different_sha256")
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn contract_lint_writes_canonical_findings() {
        let vault = test_vault("contract-lint");
        let source = vault.join("raw").join("paper.pdf");
        fs::write(&source, b"pdf bytes").expect("write pdf");
        let source_hash = sha256_file(&source).expect("source hash");
        let artifact = artifact_for_source(&vault, &source, &source_hash);
        write_text(&artifact, "parsed without manifest\n").expect("write legacy artifact");

        let findings = run_ingest_lint(to_display(&vault)).expect("run lint");
        assert!(findings
            .iter()
            .any(|finding| finding.kind == "missing_manifest"));
        assert!(vault.join("_state").join("lint-findings.jsonl").is_file());
        assert!(vault.join("_state").join("artifacts.jsonl").is_file());
        assert!(vault.join("_state").join("actions.jsonl").is_file());
        assert!(vault.join("_state").join("impact-graph.jsonl").is_file());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn claim_ledger_updates_verdict_and_feeds_impact_graph() {
        let vault = test_vault("claim-ledger");
        fs::create_dir_all(vault.join("claims")).expect("create claims dir");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            "{\"claim_id\":\"c1\",\"claim_text\":\"Metric improves accuracy.\",\"needs_review\":true,\"source_uuid\":\"sha256:abc\",\"chunk_id\":\"chunk-1\",\"concepts\":[\"Accuracy\"],\"evidence_quote\":\"accuracy improved\"}\n",
        )
        .expect("write claim ledger");

        let items = list_claim_ledger(to_display(&vault)).expect("list claims");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].claim_id, "c1");
        assert!(items[0].needs_review);
        assert!(items[0].evidence_hash.is_some());

        let updated = set_claim_verdict(
            to_display(&vault),
            "c1".to_string(),
            "supported".to_string(),
        )
        .expect("update claim verdict");
        assert_eq!(updated[0].verdict, "supported");
        assert!(!updated[0].needs_review);

        let plan = plan_ingest(to_display(&vault)).expect("plan claim graph");
        assert!(plan.impact_edges.iter().any(|edge| {
            edge.from_type == "claim" && edge.to_type == "concept" && edge.to_id == "Accuracy"
        }));
        assert!(plan
            .impact_edges
            .iter()
            .any(|edge| edge.from_type == "source" && edge.to_type == "claim"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn import_accepts_default_source_watch_document_types() {
        let vault = test_vault("import-default-doc-types");
        let incoming = test_vault("external-default-doc-types");
        let docx = incoming.join("deepseek-roadmap.docx");
        let csv = incoming.join("deepseek-eval.csv");
        fs::write(&docx, b"fake docx payload").expect("write docx");
        fs::write(&csv, b"model,score\nDeepSeek,1.0\n").expect("write csv");

        let batch = import_sources_impl(
            &vault,
            vec![to_display(&docx), to_display(&csv)],
            false,
            false,
        )
        .expect("import default document types");

        assert_eq!(batch.imported.len(), 2);
        assert!(batch.errors.is_empty(), "{:?}", batch.errors);
        assert!(batch
            .imported
            .iter()
            .any(|item| item.file_name == "deepseek-roadmap.docx"
                && item.mime
                    == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
        assert!(batch
            .imported
            .iter()
            .any(|item| item.file_name == "deepseek-eval.csv" && item.mime == "text/csv"));

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(incoming);
    }

    #[test]
    fn folder_import_preserves_context_detects_duplicates_and_enqueues() {
        let vault = test_vault("folder-import");
        create_minimal_vault(&vault).expect("create minimal vault");
        let import_root = test_vault("external-folder");
        let nested = import_root.join("papers").join("vision");
        fs::create_dir_all(&nested).expect("create nested import folder");
        let paper = nested.join("attention_is_all_you_need.md");
        write_text(
            &paper,
            "# Attention Is All You Need\n\nDOI 10.48550/arXiv.1706.03762\narXiv:1706.03762\n",
        )
        .expect("write import source");

        let batch = import_sources_impl(&vault, vec![to_display(&import_root)], true, true)
            .expect("import folder");
        assert_eq!(batch.imported.len(), 1);
        assert_eq!(batch.skipped_duplicates.len(), 0);
        assert!(batch.enqueued_jobs >= 1);
        let imported = &batch.imported[0];
        assert_eq!(imported.folder_context.as_deref(), Some("papers/vision"));
        assert_eq!(imported.doi.as_deref(), Some("10.48550/arXiv.1706.03762"));
        assert_eq!(imported.arxiv_id.as_deref(), Some("1706.03762"));
        assert!(imported
            .target_path
            .as_deref()
            .is_some_and(|path| path.contains("raw/inbox/papers/vision")));
        let status = inspect_vault(to_display(&vault)).expect("inspect vault after folder import");
        assert_eq!(status.counts.inbox, 1);

        let duplicate = import_sources_impl(&vault, vec![to_display(&paper)], false, false)
            .expect("import duplicate");
        assert_eq!(duplicate.imported.len(), 0);
        assert_eq!(duplicate.skipped_duplicates.len(), 1);
        assert_eq!(
            duplicate.skipped_duplicates[0].duplicate_reason.as_deref(),
            Some("sha256")
        );
        assert!(read_text(&vault.join("_state").join("import-report.jsonl"))
            .contains("skipped_duplicate"));

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(import_root);
    }

    #[cfg(unix)]
    #[test]
    fn folder_import_skips_symlinks_to_keep_raw_evidence_explicit() {
        let vault = test_vault("folder-import-symlink");
        create_minimal_vault(&vault).expect("create minimal vault");
        let import_root = test_vault("external-folder-symlink-root");
        let external_root = test_vault("external-folder-symlink-target");
        let nested = import_root.join("papers").join("vision");
        fs::create_dir_all(&nested).expect("create nested import folder");
        let regular = nested.join("regular.md");
        write_text(&regular, "# Regular\n").expect("write regular source");
        let external = external_root.join("external.md");
        write_text(&external, "# External\n").expect("write external source");
        let symlink_file = nested.join("external-link.md");
        std::os::unix::fs::symlink(&external, &symlink_file).expect("create symlink file");
        let symlink_dir = import_root.join("linked-external");
        std::os::unix::fs::symlink(&external_root, &symlink_dir).expect("create symlink dir");

        let batch = import_sources_impl(&vault, vec![to_display(&import_root)], false, true)
            .expect("import folder with symlinks");
        assert_eq!(batch.imported.len(), 1);
        assert_eq!(batch.imported[0].file_name, "regular.md");
        assert!(batch
            .errors
            .iter()
            .any(|error| error.contains("skipped symlink import path")
                && error.contains("external-link.md")));
        assert!(batch
            .errors
            .iter()
            .any(|error| error.contains("skipped symlink import path")
                && error.contains("linked-external")));
        assert!(!vault.join("raw").join("inbox").join("external.md").exists());
        assert!(!vault
            .join("raw")
            .join("inbox")
            .join("papers")
            .join("vision")
            .join("external-link.md")
            .exists());

        let direct = import_sources_impl(&vault, vec![to_display(&symlink_file)], false, false)
            .expect("direct symlink import is handled");
        assert_eq!(direct.imported.len(), 0);
        assert!(direct
            .errors
            .iter()
            .any(|error| error.contains("skipped symlink input")
                && error.contains("external-link.md")));

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(import_root);
        let _ = fs::remove_dir_all(external_root);
    }

    #[test]
    fn vault_status_surfaces_source_id_for_generated_source_pages() {
        let vault = test_vault("source-file-id");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "---\ntitle: \"DeepSeek Source\"\nstatus: stable\n---\n# DeepSeek Source\n",
        )
        .expect("write generated source");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let source = status
            .files
            .iter()
            .find(|file| file.kind == "source" && file.name == "LLM-0001.md")
            .expect("generated source file");
        assert_eq!(source.source_id.as_deref(), Some("LLM-0001"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn archive_zip_corpus_package_extracts_supported_sources() {
        let vault = test_vault("archive-zip-import");
        let incoming = test_vault("external-archive-zip");
        let archive = incoming.join("deepseek_paper_中文.zip");
        write_test_zip(
            &archive,
            &[
                (
                    "deepseek_paper_中文/DeepSeek-V3_中文.md",
                    b"# DeepSeek V3\n\nChinese source body.\n",
                ),
                ("deepseek_paper_中文/_translation_cache.json", b"{}"),
                (
                    "__MACOSX/deepseek_paper_中文/._DeepSeek-V3_中文.md",
                    b"metadata",
                ),
            ],
        );

        let batch = import_sources_impl(&vault, vec![to_display(&archive)], false, false)
            .expect("import archive package");

        assert_eq!(batch.imported.len(), 1);
        assert!(batch.errors.is_empty(), "{:?}", batch.errors);
        assert_eq!(batch.imported[0].file_name, "DeepSeek-V3_中文.md");
        assert_eq!(batch.imported[0].mime, "text/markdown");
        assert!(batch.imported[0]
            .source_path
            .contains("deepseek_paper_中文.zip!deepseek_paper_中文/DeepSeek-V3_中文.md"));
        assert!(
            batch.imported[0].target_path.as_deref().is_some_and(
                |path| path.contains("raw/inbox/deepseek_paper_中文/DeepSeek-V3_中文.md")
            )
        );
        assert!(!vault
            .join("raw")
            .join("inbox")
            .join("deepseek_paper_中文.zip")
            .exists());
        assert!(!vault
            .join("raw")
            .join("inbox")
            .join("deepseek_paper_中文")
            .join("_translation_cache.json")
            .exists());
        assert!(!vault.join("raw").join("inbox").join("__MACOSX").exists());

        let plan = plan_ingest(to_display(&vault)).expect("plan extracted archive package");
        let entry = plan
            .entries
            .iter()
            .find(|entry| entry.file_name == "DeepSeek-V3_中文.md")
            .expect("extracted markdown plan entry");
        assert_eq!(entry.status, "stageable");
        assert_eq!(entry.action, "stage_text_artifact");
        assert_eq!(entry.current_state, "imported");
        assert!(entry.artifact_path.is_some());
        assert!(entry
            .next_action_label
            .contains("Stage this text or Markdown source locally"));
        assert!(!plan
            .actions
            .iter()
            .any(|action| action.kind == "archive_extract_required"));

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(incoming);
    }

    #[test]
    fn archive_zip_import_rejects_traversal_entries() {
        let vault = test_vault("archive-zip-traversal");
        let incoming = test_vault("external-archive-traversal");
        let archive = incoming.join("unsafe.zip");
        write_test_zip(
            &archive,
            &[
                ("../escape.md", b"# Escape\n"),
                ("safe/DeepSeek-safe.md", b"# Safe\n"),
            ],
        );

        let batch = import_sources_impl(&vault, vec![to_display(&archive)], false, false)
            .expect("import archive with unsafe entry");

        assert_eq!(batch.imported.len(), 1);
        assert_eq!(batch.imported[0].file_name, "DeepSeek-safe.md");
        assert!(batch
            .errors
            .iter()
            .any(|error| error.contains("skipped unsafe archive entry")));
        assert!(vault
            .join("raw")
            .join("inbox")
            .join("safe")
            .join("DeepSeek-safe.md")
            .exists());
        assert!(!vault.join("raw").join("escape.md").exists());
        assert!(!vault
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join("escape.md")
            .exists());

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(incoming);
    }

    #[test]
    fn inspect_vault_surfaces_page_wikilinks_for_graph() {
        let vault = test_vault("vault-wikilinks");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nLinks to [[concepts/research-strategy|research strategy]], [[LLM-0002#Evidence]], and [[concepts/research-strategy]].\n",
        )
        .expect("write source page");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            "# Research Strategy\n\nBack to [[sources/LLM-0001]].\n",
        )
        .expect("write concept page");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let source = status
            .files
            .iter()
            .find(|file| file.path.ends_with("sources/LLM-0001.md"))
            .expect("source file");
        assert_eq!(
            source.outbound_links,
            vec![
                "concepts/research-strategy.md".to_string(),
                "llm-0002".to_string()
            ]
        );
        let concept = status
            .files
            .iter()
            .find(|file| file.path.ends_with("concepts/research-strategy.md"))
            .expect("concept file");
        assert_eq!(
            concept.outbound_links,
            vec!["sources/LLM-0001.md".to_string()]
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn inspect_vault_surfaces_frontmatter_source_refs_for_graph() {
        let vault = test_vault("vault-source-overlap-refs");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "---\ntitle: DeepSeek Source\nsource_path: raw/deepseek_paper/deepseek.pdf\n---\n# DeepSeek Source\n",
        )
        .expect("write source page");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            "---\ntitle: Research Strategy\nsources:\n  - raw/deepseek_paper/deepseek.pdf\n  - raw/deepseek_paper/eval.pdf\n---\n# Research Strategy\n",
        )
        .expect("write concept page");
        write_text(
            &vault.join("concepts").join("decision-logic.md"),
            "---\ntitle: Decision Logic\nsources: [raw/deepseek_paper/deepseek.pdf, raw/deepseek_paper/moe.pdf]\n---\n# Decision Logic\n",
        )
        .expect("write inline source refs concept page");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault source refs");
        let source = status
            .files
            .iter()
            .find(|file| file.path.ends_with("sources/LLM-0001.md"))
            .expect("source file");
        assert_eq!(
            source.source_refs,
            vec!["raw/deepseek_paper/deepseek.pdf".to_string()]
        );
        let strategy = status
            .files
            .iter()
            .find(|file| file.path.ends_with("concepts/research-strategy.md"))
            .expect("strategy concept");
        assert_eq!(
            strategy.source_refs,
            vec![
                "raw/deepseek_paper/deepseek.pdf".to_string(),
                "raw/deepseek_paper/eval.pdf".to_string()
            ]
        );
        let decision = status
            .files
            .iter()
            .find(|file| file.path.ends_with("concepts/decision-logic.md"))
            .expect("decision concept");
        assert_eq!(
            decision.source_refs,
            vec![
                "raw/deepseek_paper/deepseek.pdf".to_string(),
                "raw/deepseek_paper/moe.pdf".to_string()
            ]
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn folder_import_skips_raw_support_indexes() {
        let vault = test_vault("folder-import-support-index");
        create_minimal_vault(&vault).expect("create minimal vault");
        let import_root = test_vault("external-folder-support-index");
        fs::create_dir_all(&import_root).expect("create import folder");
        write_text(
            &import_root.join("DeepSeek-LLM_2401.02954.md"),
            "# DeepSeek LLM\n\narXiv:2401.02954\n",
        )
        .expect("write paper source");
        write_text(
            &import_root.join("索引.md"),
            "# deepseek_paper 中文转换索引\n\n- DeepSeek-Coder-V2 2406.11931\n",
        )
        .expect("write support index");

        let batch = import_sources_impl(&vault, vec![to_display(&import_root)], false, true)
            .expect("import folder");

        assert_eq!(batch.imported.len(), 1);
        assert_eq!(batch.imported[0].file_name, "DeepSeek-LLM_2401.02954.md");
        assert!(!vault.join("raw").join("inbox").join("索引.md").exists());

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(import_root);
    }

    #[test]
    fn evidence_paths_surface_missing_qa_and_review_state() {
        let vault = test_vault("evidence-paths");
        create_minimal_vault(&vault).expect("create minimal vault");
        let source = vault.join("raw").join("note.md");
        write_text(&source, "# Note\n\nAccuracy improved.\n").expect("write source");
        let staged = stage_text_artifacts(&vault).expect("stage source");
        assert_eq!(staged.len(), 1);
        let plan = plan_ingest(to_display(&vault)).expect("plan source");
        let entry = &plan.registry[0];
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            &format!(
                "{{\"claim_id\":\"c1\",\"claim_text\":\"Accuracy improved.\",\"needs_review\":true,\"source_uuid\":\"{}\",\"source_id\":\"{}\",\"chunk_id\":\"{}:00001\",\"concepts\":[\"Accuracy\"],\"evidence_quote\":\"Accuracy improved.\",\"evidence_hash\":\"{}\"}}\n",
                entry.source_uuid,
                entry.source_id.clone().unwrap_or_default(),
                entry.source_uuid,
                sha256_text("Accuracy improved.")
            ),
        )
        .expect("write claim");

        let evidence = list_evidence_paths(to_display(&vault)).expect("list evidence paths");
        assert_eq!(evidence.len(), 1);
        assert_eq!(evidence[0].chain_status, "broken");
        assert!(evidence[0].missing.contains(&"missing QA".to_string()));
        assert!(evidence[0]
            .missing
            .contains(&"needs science review".to_string()));
        assert!(evidence[0].artifact_path.is_some());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_status_parses_crlf_frontmatter_metadata() {
        let vault = test_vault("crlf-frontmatter");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "---\r\ntitle: CRLF Source\r\nstatus: current\r\nupdated: 2026-05-26\r\n---\r\n# Fallback Title\r\n\r\nBody.\r\n",
        )
        .expect("write source page");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let source = status
            .files
            .iter()
            .find(|file| file.name == "LLM-0001.md")
            .expect("source file");
        assert_eq!(source.title.as_deref(), Some("CRLF Source"));
        assert_eq!(source.status.as_deref(), Some("current"));
        assert_eq!(source.updated.as_deref(), Some("2026-05-26"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn traceability_warnings_are_action_card_ready() {
        let vault = test_vault("deepseek-traceability");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("_state").join("lint-findings.jsonl"),
            "{\"finding_id\":\"f1\",\"severity\":\"p1\",\"kind\":\"evidence_anchor_missing\",\"object_type\":\"claim\",\"object_id\":\"c1\",\"title\":\"Missing evidence anchor\",\"detail\":\"missing heading anchor: Efficient Reasoning\",\"status\":\"open\",\"path\":\"sources/LLM-0001.md\"}\n",
        )
        .expect("write finding");

        let warnings =
            list_traceability_warnings(to_display(&vault)).expect("list traceability warnings");
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].claim_id, "c1");
        assert_eq!(
            warnings[0].source_path.as_deref(),
            Some("sources/LLM-0001.md")
        );
        assert_eq!(
            warnings[0].missing_anchor,
            "missing heading anchor: Efficient Reasoning"
        );
        assert!(warnings[0].summary.contains("Claim c1 cannot be traced"));
        assert!(warnings[0]
            .next_action
            .contains("DeepSeek evidence chain is broken"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn writeback_requires_approval_and_logs_apply() {
        let vault = test_vault("writeback");
        create_minimal_vault(&vault).expect("create minimal vault");
        let concept = vault.join("concepts").join("accuracy.md");
        write_text(&concept, "# Accuracy\n\nOld text.\n").expect("write concept");

        let proposal = create_writeback_proposal(
            to_display(&vault),
            "concepts/accuracy.md".to_string(),
            "Revise accuracy".to_string(),
            "# Accuracy\n\nNew text with cited evidence.\n".to_string(),
        )
        .expect("create proposal");
        assert_eq!(proposal.status, "proposed");
        assert!(proposal.diff.contains("- Old text."));
        assert!(
            apply_writeback_proposal(to_display(&vault), proposal.proposal_id.clone()).is_err()
        );

        let approved = set_writeback_status(
            to_display(&vault),
            proposal.proposal_id.clone(),
            "approved".to_string(),
        )
        .expect("approve proposal");
        assert_eq!(approved.status, "approved");
        let applied = apply_writeback_proposal(to_display(&vault), proposal.proposal_id)
            .expect("apply proposal");
        assert_eq!(applied.proposal.status, "applied");
        assert!(applied.dashboard_refreshed);
        assert!(read_text(&concept).contains("New text with cited evidence."));
        assert!(read_text(&vault.join("_state").join("writeback-log.jsonl")).contains("applied"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn writeback_allows_review_proposal_artifacts_only_under_review_area() {
        let vault = test_vault("writeback-review-proposal");
        create_minimal_vault(&vault).expect("create minimal vault");

        let proposal = create_writeback_proposal(
            to_display(&vault),
            "reviews/query-writeback/deepseek-insight.md".to_string(),
            "DeepSeek insight".to_string(),
            "Evidence, inference, hypothesis, and forecast stay separated.".to_string(),
        )
        .expect("create review proposal");
        assert_eq!(proposal.status, "proposed");
        assert!(proposal.content.contains("writeback_applied: false"));
        assert!(proposal.content.contains("## Approval Gate"));
        assert!(!vault
            .join("reviews")
            .join("query-writeback")
            .join("deepseek-insight.md")
            .exists());

        let rejected = create_writeback_proposal(
            to_display(&vault),
            "sources/LLM-0001.md".to_string(),
            "Unsafe source write".to_string(),
            "content".to_string(),
        );
        assert!(rejected.is_err());

        let approved = set_writeback_status(
            to_display(&vault),
            proposal.proposal_id.clone(),
            "approved".to_string(),
        )
        .expect("approve proposal artifact write");
        assert_eq!(approved.status, "approved");
        let applied = apply_writeback_proposal(to_display(&vault), proposal.proposal_id)
            .expect("write review proposal artifact");
        assert_eq!(applied.proposal.status, "applied");
        assert!(applied.dashboard_refreshed);
        let artifact = vault
            .join("reviews")
            .join("query-writeback")
            .join("deepseek-insight.md");
        assert!(read_text(&artifact).contains("This proposal is review evidence only."));

        let _ = fs::remove_dir_all(vault);
    }

    #[cfg(unix)]
    #[test]
    fn writeback_rejects_symlinked_concept_target_escape() {
        use std::os::unix::fs as unix_fs;

        let vault = test_vault("writeback-symlink-concepts");
        create_minimal_vault(&vault).expect("create minimal vault");
        let outside = vault.with_extension("outside");
        fs::create_dir_all(&outside).expect("create outside target");
        write_text(&outside.join("escaped.md"), "# Escaped\n\nOld content.\n")
            .expect("write escaped concept");
        fs::remove_dir_all(vault.join("concepts")).expect("remove concepts dir");
        unix_fs::symlink(&outside, vault.join("concepts")).expect("create concepts symlink");

        let rejected = create_writeback_proposal(
            to_display(&vault),
            "concepts/escaped.md".to_string(),
            "Unsafe concept target".to_string(),
            "# Escaped\n\nNew content.\n".to_string(),
        );

        assert!(rejected.is_err());
        assert!(read_text(&outside.join("escaped.md")).contains("Old content."));

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn list_writebacks_includes_review_only_markdown_artifacts() {
        let vault = test_vault("writeback-review-artifact-discovery");
        create_minimal_vault(&vault).expect("create minimal vault");
        let artifact = vault
            .join("reviews")
            .join("query-writeback")
            .join("deepseek-research-insights.md");
        write_text(
            &artifact,
            "# Query Writeback Proposal\n\n- generated_at: 2026-05-26 04:22\n- target: concepts/deepseek-research-strategy.md\n- query: DeepSeek research strategy\n- writeback_applied: false\n- approval_required: true\n\n## Proposed Diff\n\n```diff\n--- a/concepts/deepseek-research-strategy.md\n+++ b/concepts/deepseek-research-strategy.md\n+Evidence-backed insight.\n```\n\n## Proposed Log Entry\n\n```text\n[2026-05-26 04:22] query-writeback | concepts/deepseek-research-strategy.md | agent | query: 'DeepSeek research strategy'\n```\n",
        )
        .expect("write review artifact");

        let proposals =
            list_writeback_proposals(to_display(&vault)).expect("list writeback proposals");
        let proposal = proposals
            .iter()
            .find(|item| {
                item.target_path == "reviews/query-writeback/deepseek-research-insights.md"
            })
            .expect("review artifact proposal");
        assert!(proposal.proposal_id.starts_with("artifact-"));
        assert_eq!(proposal.status, "review_only");
        assert_eq!(proposal.title, "DeepSeek research strategy");
        assert!(proposal.diff.contains("+Evidence-backed insight."));
        assert!(proposal.content.contains("approval_required: true"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_command_spec_tracks_current_open_runtime_contract() {
        let vault = test_vault("runtime-spec");
        let semantic =
            command_spec("semantic_qa", &vault, "minimal", true).expect("semantic qa command");
        assert_eq!(semantic.0, "wiki_semantic_qa.py");
        assert!(semantic.1.contains(&"--assign-verdicts".to_string()));
        assert!(semantic.1.contains(&"--in-place".to_string()));

        let concept_apply = command_spec("concept_revision_apply", &vault, "minimal", true)
            .expect("concept apply command");
        assert_eq!(concept_apply.0, "wiki_concept_revision.py");
        assert!(concept_apply.1.contains(&"--apply".to_string()));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_status_surfaces_wikilink_backlinks() {
        let vault = test_vault("wikilink-backlinks");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nSee [[research-strategy]] and [[concepts/decision-logic|Decision Logic]].\n",
        )
        .expect("source page");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            "# Research Strategy\n\nSupported by [[LLM-0001]].\n",
        )
        .expect("research concept");
        write_text(
            &vault.join("concepts").join("decision-logic.md"),
            "# Decision Logic\n\nTradeoff synthesis.\n",
        )
        .expect("decision concept");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let source = status
            .files
            .iter()
            .find(|file| file.name == "LLM-0001.md")
            .expect("source file");
        assert_eq!(
            source.outbound_links,
            vec![
                "concepts/decision-logic.md".to_string(),
                "concepts/research-strategy.md".to_string()
            ]
        );
        assert_eq!(
            source.inbound_links,
            vec!["concepts/research-strategy.md".to_string()]
        );

        let decision = status
            .files
            .iter()
            .find(|file| file.name == "decision-logic.md")
            .expect("decision concept");
        assert_eq!(decision.outbound_links.len(), 0);
        assert_eq!(
            decision.inbound_links,
            vec!["sources/LLM-0001.md".to_string()]
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_status_discovers_markdown_extension_pages() {
        let vault = test_vault("markdown-extension-pages");
        create_minimal_vault(&vault).expect("create minimal vault");
        let baseline = inspect_vault(to_display(&vault)).expect("inspect baseline vault");
        write_text(
            &vault.join("sources").join("LLM-9001.markdown"),
            "# Markdown Extension Source\n\nEvidence.\n",
        )
        .expect("source page");
        write_text(
            &vault.join("concepts").join("markdown-extension.markdown"),
            "# Markdown Extension Concept\n\nSynthesis.\n",
        )
        .expect("concept page");
        write_text(
            &vault.join("qa-reports").join("LLM-9001.markdown"),
            "# Markdown Extension QA\n\nverdict: PASS\n",
        )
        .expect("qa report");

        let source_pages = list_markdown(&vault.join("sources"));
        assert!(source_pages
            .iter()
            .any(|path| path.file_name() == Some(OsStr::new("LLM-9001.markdown"))));
        let recursive_sources = list_markdown_recursive(&vault.join("sources"));
        assert!(recursive_sources
            .iter()
            .any(|path| path.file_name() == Some(OsStr::new("LLM-9001.markdown"))));

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        assert_eq!(status.counts.sources, baseline.counts.sources + 1);
        assert_eq!(status.counts.concepts, baseline.counts.concepts + 1);
        assert_eq!(status.counts.reports, baseline.counts.reports + 1);
        assert!(status
            .files
            .iter()
            .any(|file| file.kind == "source" && file.name == "LLM-9001.markdown"));
        assert!(status
            .files
            .iter()
            .any(|file| file.kind == "concept" && file.name == "markdown-extension.markdown"));
        assert!(status.files.iter().any(|file| {
            file.kind == "report"
                && file.name == "LLM-9001.markdown"
                && file.qa_verdict.as_deref() == Some("PASS")
        }));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn entry_note_prefers_existing_home_and_warns_on_workspace_root() {
        let vault = test_vault("entry-note");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nEvidence summary.\n",
        )
        .expect("source page");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            "# Research Strategy\n\nSynthesis.\n",
        )
        .expect("concept page");
        write_text(
            &vault.join(".graph").join("graph-report.md"),
            "# Graph Report\n\nTraceability warning.\n",
        )
        .expect("graph report");
        write_text(
            &vault.join("canvas").join("wiki-graph.canvas"),
            "{\"nodes\":[],\"edges\":[]}\n",
        )
        .expect("graph canvas");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:1\",\"source_id\":\"LLM-0001\",\"source_path\":\"raw/inbox/dfc.pdf\",\"source_sha256\":\"abc\",\"status\":\"published\",\"source_page\":\"sources/LLM-0001.md\"}\n{\"source_uuid\":\"sha256:2\",\"source_id\":\"LLM-0002\",\"source_path\":\"raw/inbox/stale.pdf\",\"source_sha256\":\"def\",\"status\":\"stale\"}\n",
        )
        .expect("registry");
        write_text(
            &vault.join("_state").join("desktop-source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:3\",\"source_id\":\"LLM-0003\",\"source_path\":\"raw/inbox/blocked.pdf\",\"source_sha256\":\"ghi\",\"status\":\"blocked\"}\n",
        )
        .expect("desktop registry");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            "{\"claim_id\":\"c1\",\"claim_text\":\"Claim needs review\",\"needs_review\":true,\"verdict\":\"needs_review\",\"status\":\"needs_review\"}\n{\"claim_id\":\"c2\",\"claim_text\":\"Claim stale\",\"needs_review\":false,\"verdict\":\"stale\",\"status\":\"stale\"}\n",
        )
        .expect("claims");
        let proposal = create_writeback_proposal(
            to_display(&vault),
            "reviews/query-writeback/dfc-insight.md".to_string(),
            "DFC insight".to_string(),
            "Review-only proposal.".to_string(),
        )
        .expect("writeback proposal");
        assert_eq!(proposal.status, "proposed");

        let entry = resolve_vault_entry_note_impl(&vault, true).expect("resolve entry");
        assert_eq!(
            entry.entry_relative_path.as_deref(),
            Some("LLM Wiki Home.md")
        );
        assert!(entry
            .obsidian_uri
            .as_deref()
            .is_some_and(|uri| uri.contains("path=") && uri.contains("LLM%20Wiki%20Home.md")));
        assert_eq!(
            entry.fallback_path,
            to_display(&vault.join("LLM Wiki Home.md"))
        );
        let home = read_text(&vault.join("LLM Wiki Home.md"));
        assert!(home.contains("## Corpus Map"));
        assert!(home.contains("- Source pages: 1"));
        assert!(home.contains("- Published sources: 1"));
        assert!(home.contains("- Stale sources: 1"));
        assert!(home.contains("- Blocked sources: 1"));
        assert!(home.contains("[[sources/LLM-0001]]"));
        assert!(home.contains("[[concepts/research-strategy]]"));
        assert!(home.contains("## Graph & Traceability"));
        assert!(home.contains("- Graph reports: 1"));
        assert!(home.contains("- Obsidian canvases: 1"));
        assert!(home.contains("[[.graph/graph-report]]"));
        assert!(home.contains("[[canvas/wiki-graph.canvas]]"));
        assert!(home.contains("## Reading Quality"));
        assert!(home.contains("_state/obsidian-reading-quality.json"));
        assert!(vault
            .join("_state")
            .join("obsidian-reading-quality.json")
            .is_file());
        assert!(home.contains("Claims needing review: 1"));
        assert!(home.contains("Stale claims: 1"));
        assert!(home.contains("Query writeback proposals waiting for review: 1"));
        assert!(home.contains("## Suggested Questions"));
        assert!(home.contains("Do not treat proposed writeback content"));

        let workspace = test_vault("workspace-root");
        fs::create_dir_all(workspace.join("deepseek_paper")).expect("deepseek dir");
        fs::create_dir_all(workspace.join("vaults")).expect("vaults dir");
        fs::create_dir_all(workspace.join("open-llm-wiki")).expect("runtime dir");
        write_text(&workspace.join("AGENTS.md"), "rules").expect("agents");
        let warning = resolve_vault_entry_note_impl(&workspace, true).expect("workspace entry");
        assert!(warning.is_workspace_root);
        assert!(!warning.is_raw_source_folder);
        assert!(warning.warning.is_some());
        assert!(warning.entry_path.is_none());
        assert!(warning.obsidian_uri.is_none());
        let opened = open_obsidian_vault(to_display(&workspace)).expect("workspace open warning");
        assert!(opened.is_workspace_root);
        assert!(opened.warning.is_some());

        let raw = workspace.join("deepseek_paper");
        write_text(&raw.join("dfc.pdf"), "%PDF-1.4\n").expect("raw pdf");
        let raw_warning = resolve_vault_entry_note_impl(&raw, true).expect("raw folder warning");
        assert!(!raw_warning.is_workspace_root);
        assert!(raw_warning.is_raw_source_folder);
        assert!(raw_warning.warning.as_deref().is_some_and(|warning| warning
            .contains("raw PDF/source folder")
            && warning.contains("generated vault")
            && warning.contains("Dashboard state")
            && warning.contains("Obsidian entry note")));
        assert!(raw_warning.entry_path.is_none());
        assert!(raw_warning.obsidian_uri.is_none());
        let raw_opened = open_obsidian_vault(to_display(&raw)).expect("raw open warning");
        assert!(raw_opened.is_raw_source_folder);
        assert!(raw_opened.warning.is_some());

        let _ = fs::remove_dir_all(vault);
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn desktop_command_specs_cover_windows_open_reveal_obsidian_and_cli_lookup() {
        let target = PathBuf::from(r"C:\Users\Ada\llm-wiki\LLM Wiki Home.md");
        let uri = "obsidian://open?path=C%3A%5CUsers%5CAda%5Cllm-wiki%5CLLM%20Wiki%20Home.md";

        let open = open_path_command(DesktopPlatform::Windows, &target);
        assert_eq!(open.program, "explorer");
        assert_eq!(open.args, vec![to_display(&target)]);

        let reveal_file = reveal_path_command(DesktopPlatform::Windows, &target, false);
        assert_eq!(reveal_file.program, "explorer");
        assert_eq!(
            reveal_file.args,
            vec![format!("/select,{}", to_display(&target))]
        );

        let reveal_dir = reveal_path_command(DesktopPlatform::Windows, &target, true);
        assert_eq!(reveal_dir.program, "explorer");
        assert_eq!(reveal_dir.args, vec![to_display(&target)]);

        let obsidian = obsidian_uri_command(DesktopPlatform::Windows, uri);
        assert_eq!(obsidian.program, "cmd");
        assert_eq!(
            obsidian.args,
            vec![
                "/C".to_string(),
                "start".to_string(),
                "".to_string(),
                uri.to_string()
            ]
        );

        let lookup = local_cli_lookup_command(DesktopPlatform::Windows, "codex");
        assert_eq!(lookup.program, "where");
        assert_eq!(lookup.args, vec!["codex".to_string()]);
    }

    #[test]
    fn desktop_command_specs_keep_macos_and_linux_launch_contracts() {
        let target = PathBuf::from("/Users/ada/llm-wiki/LLM Wiki Home.md");
        let uri = "obsidian://open?path=%2FUsers%2Fada%2Fllm-wiki%2FLLM%20Wiki%20Home.md";

        let mac_open = open_path_command(DesktopPlatform::Macos, &target);
        assert_eq!(mac_open.program, "open");
        assert_eq!(mac_open.args, vec![to_display(&target)]);

        let mac_reveal = reveal_path_command(DesktopPlatform::Macos, &target, false);
        assert_eq!(mac_reveal.program, "open");
        assert_eq!(mac_reveal.args, vec!["-R".to_string(), to_display(&target)]);

        let mac_obsidian = obsidian_uri_command(DesktopPlatform::Macos, uri);
        assert_eq!(mac_obsidian.program, "open");
        assert_eq!(
            mac_obsidian.args,
            vec!["-a".to_string(), "Obsidian".to_string(), uri.to_string()]
        );

        let linux_open = open_path_command(DesktopPlatform::Linux, &target);
        assert_eq!(linux_open.program, "xdg-open");
        assert_eq!(linux_open.args, vec![to_display(&target)]);

        let linux_obsidian = obsidian_uri_command(DesktopPlatform::Linux, uri);
        assert_eq!(linux_obsidian.program, "xdg-open");
        assert_eq!(linux_obsidian.args, vec![uri.to_string()]);
    }

    #[test]
    fn agent_read_api_readiness_requires_scorecard_gate_and_read_only_contract() {
        let vault = test_vault("agent-api-readiness-blocked");
        create_minimal_vault(&vault).expect("create minimal vault");

        let readiness = build_agent_read_api_readiness(&vault);
        assert!(!readiness.enabled);
        assert_eq!(readiness.bind_host, "127.0.0.1");
        assert!(readiness.token_required);
        assert!(!readiness.scorecard_ready);
        assert!(readiness.server_implemented);
        assert!(!readiness.server_available);
        assert!(readiness
            .unmet_requirements
            .iter()
            .any(|item| item.contains("ingest_plan")));
        assert!(readiness
            .endpoints
            .iter()
            .all(|endpoint| matches!(endpoint.method.as_str(), "GET" | "POST")));
        assert!(readiness
            .endpoints
            .iter()
            .all(|endpoint| !endpoint.path.contains("apply")
                && !endpoint.path.contains("delete")
                && !endpoint.path.contains("set-status")));
        assert!(readiness
            .endpoints
            .iter()
            .any(|endpoint| endpoint.method == "GET"
                && endpoint.path == "/vault/graph"
                && endpoint.capability.contains("read-only evidence graph")));
        assert!(readiness
            .endpoints
            .iter()
            .any(|endpoint| endpoint.method == "POST"
                && endpoint.path == "/vault/read-file"
                && endpoint.capability.contains("reject path escapes")));
        assert!(readiness
            .blocked_operations
            .iter()
            .any(|operation| operation.contains("write, delete, or overwrite")));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn agent_read_api_readiness_marks_server_available_after_scorecard_pass() {
        let vault = test_vault("agent-api-readiness-pass");
        create_minimal_vault(&vault).expect("create minimal vault");
        let source = vault.join("raw").join("note.md");
        write_text(&source, "# Note\n\nAccuracy improved.\n").expect("write source");
        let staged = stage_text_artifacts(&vault).expect("stage source");
        assert_eq!(staged.len(), 1);
        let plan = plan_ingest(to_display(&vault)).expect("plan source");
        let entry = &plan.registry[0];
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            &format!(
                "{{\"claim_id\":\"c1\",\"claim_text\":\"Accuracy improved.\",\"needs_review\":false,\"verdict\":\"supported\",\"status\":\"supported\",\"source_uuid\":\"{}\",\"source_id\":\"{}\",\"chunk_id\":\"{}:00001\",\"concepts\":[\"Accuracy\"],\"evidence_quote\":\"Accuracy improved.\",\"evidence_hash\":\"{}\"}}\n",
                entry.source_uuid,
                entry.source_id.clone().unwrap_or_default(),
                entry.source_uuid,
                sha256_text("Accuracy improved.")
            ),
        )
        .expect("write claim");
        create_writeback_proposal(
            to_display(&vault),
            "reviews/query-writeback/agent-api-readiness.md".to_string(),
            "Readiness proposal".to_string(),
            "Review-only proposal.".to_string(),
        )
        .expect("write proposal");

        let readiness = build_agent_read_api_readiness(&vault);
        assert!(
            readiness.enabled,
            "live server should be advertised after scorecard pass"
        );
        assert!(
            readiness.scorecard_ready,
            "{:?}",
            readiness.unmet_requirements
        );
        assert!(readiness.server_implemented);
        assert!(readiness.server_available);
        assert!(readiness.unmet_requirements.is_empty());
        assert!(readiness.reason.contains("available for this vault"));
        assert!(readiness
            .required_metrics
            .contains(&"query_writeback".to_string()));
        assert!(readiness
            .endpoints
            .iter()
            .any(|endpoint| endpoint.path == "/vault/rescan-plan"));
        assert!(readiness
            .endpoints
            .iter()
            .any(|endpoint| endpoint.path == "/vault/graph"));
        assert!(readiness
            .endpoints
            .iter()
            .any(|endpoint| endpoint.path == "/vault/read-file"));
        assert!(readiness
            .blocked_operations
            .iter()
            .any(|operation| operation.contains("apply writeback proposal")));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn agent_read_api_starts_token_protected_read_only_server() {
        let vault = test_vault("agent-api-server");
        create_minimal_vault(&vault).expect("create minimal vault");
        let source = vault.join("raw").join("note.md");
        write_text(
            &source,
            "# Note\n\nDeepSeek emphasizes efficient reasoning and careful evaluation.\n",
        )
        .expect("write source");
        let staged = stage_text_artifacts(&vault).expect("stage source");
        assert_eq!(staged.len(), 1);
        let plan = plan_ingest(to_display(&vault)).expect("plan source");
        let entry = &plan.registry[0];
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nDeepSeek emphasizes efficient reasoning and careful evaluation.\n",
        )
        .expect("source page");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            &format!(
                "{{\"claim_id\":\"c1\",\"claim_text\":\"DeepSeek emphasizes efficient reasoning.\",\"needs_review\":false,\"verdict\":\"supported\",\"status\":\"supported\",\"source_uuid\":\"{}\",\"source_id\":\"{}\",\"chunk_id\":\"{}:00001\",\"concepts\":[\"Reasoning\"],\"evidence_quote\":\"efficient reasoning\",\"evidence_hash\":\"{}\"}}\n",
                entry.source_uuid,
                entry.source_id.clone().unwrap_or_default(),
                entry.source_uuid,
                sha256_text("efficient reasoning")
            ),
        )
        .expect("write claim");
        create_writeback_proposal(
            to_display(&vault),
            "reviews/query-writeback/agent-api-server.md".to_string(),
            "Agent API proposal".to_string(),
            "Review-only proposal.".to_string(),
        )
        .expect("write proposal");

        let info = start_agent_read_api_impl(&vault, 0).expect("start agent API");
        assert!(info.enabled);
        assert_eq!(info.bind_host, "127.0.0.1");
        assert!(info.token.is_some());
        let token = info.token.as_deref().expect("token");

        let denied = agent_http_request(info.port, None, "GET", "/health", "");
        assert!(denied.starts_with("HTTP/1.1 401 Unauthorized"), "{denied}");

        let health = agent_http_request(info.port, Some(token), "GET", "/health", "");
        assert!(health.starts_with("HTTP/1.1 200 OK"), "{health}");
        assert!(health.contains("\"readOnly\": true"));
        assert!(health.contains("apply writeback proposal"));

        let search = agent_http_request(
            info.port,
            Some(token),
            "POST",
            "/vault/search",
            "{\"query\":\"efficient reasoning\",\"limit\":5}",
        );
        assert!(search.starts_with("HTTP/1.1 200 OK"), "{search}");
        assert!(search.contains("sources/LLM-0001.md"));
        assert!(search.contains("efficient reasoning"));

        let graph = agent_http_request(info.port, Some(token), "GET", "/vault/graph", "");
        assert!(graph.starts_with("HTTP/1.1 200 OK"), "{graph}");
        assert!(graph.contains("\"nodes\""));
        assert!(graph.contains("\"edges\""));

        let read_file = agent_http_request(
            info.port,
            Some(token),
            "POST",
            "/vault/read-file",
            "{\"path\":\"sources/LLM-0001.md\"}",
        );
        assert!(read_file.starts_with("HTTP/1.1 200 OK"), "{read_file}");
        assert!(read_file.contains("DeepSeek Source"));

        let escaped = agent_http_request(
            info.port,
            Some(token),
            "POST",
            "/vault/read-file",
            "{\"path\":\"../outside.md\"}",
        );
        assert!(escaped.starts_with("HTTP/1.1 400 Bad Request"), "{escaped}");
        assert!(
            escaped.contains("inside the vault") || escaped.contains("outside vault"),
            "{escaped}"
        );

        let stopped = stop_agent_read_api().expect("stop agent API");
        assert!(!stopped.enabled);
        assert!(stopped.token.is_none());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn reading_quality_report_tracks_concept_dependencies_and_trust_risks() {
        let vault = test_vault("reading-quality");
        create_minimal_vault(&vault).expect("create minimal vault");
        let repeated = "DeepSeek frames research around efficient reasoning, evidence-backed evaluation, and careful resource tradeoffs. "
            .repeat(12);
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            &format!("# DFC Source\n\n{repeated}\n"),
        )
        .expect("source page");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            &format!("# Research Strategy\n\n{repeated}\n"),
        )
        .expect("concept page");
        write_text(
            &vault.join("concepts").join("orphan.md"),
            "# Orphan\n\nNo source or claim link yet.\n",
        )
        .expect("orphan concept");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:dfc\",\"source_id\":\"LLM-0001\",\"source_path\":\"raw/inbox/dfc.pdf\",\"source_sha256\":\"dfc-hash\",\"status\":\"published\",\"source_page\":\"sources/LLM-0001.md\",\"artifact_path\":\"parsed/dfc/combined.md\"}\n{\"source_uuid\":\"sha256:dfc-copy\",\"source_id\":\"LLM-0002\",\"source_path\":\"raw/inbox/dfc-copy.pdf\",\"source_sha256\":\"dfc-hash\",\"status\":\"published\",\"source_page\":\"sources/LLM-0002.md\"}\n",
        )
        .expect("registry");
        write_text(
            &vault.join("_state").join("artifacts.jsonl"),
            "{\"source_uuid\":\"sha256:dfc\",\"source_id\":\"LLM-0001\",\"artifact_path\":\"parsed/dfc/combined.md\",\"manifest_path\":\"parsed/dfc/manifest.json\",\"status\":\"stale\",\"contract_valid\":false}\n",
        )
        .expect("artifacts");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            "{\"claim_id\":\"claim-dfc\",\"claim_text\":\"DeepSeek emphasizes efficient reasoning.\",\"source_id\":\"LLM-0001\",\"source_uuid\":\"sha256:dfc\",\"concepts\":[\"research-strategy\"],\"evidence_quote\":\"efficient reasoning\",\"evidence_hash\":\"quote-hash\",\"verdict\":\"supported\",\"status\":\"supported\"}\n",
        )
        .expect("claims");

        let report = write_reading_quality_report(&vault).expect("write reading report");
        assert_eq!(report.summary.concepts, 2);
        assert_eq!(report.summary.low_synthesis_concepts, 1);
        assert_eq!(report.summary.orphan_concepts, 1);
        assert_eq!(report.summary.source_identity_drift, 1);
        assert!(report.summary.trust_issues >= 3);
        let kinds = report
            .findings
            .iter()
            .map(|finding| finding.kind.as_str())
            .collect::<HashSet<_>>();
        assert!(kinds.contains("source_identity_drift"));
        assert!(kinds.contains("stale_artifact_reference"));
        assert!(kinds.contains("artifact_hash_mismatch_reference"));
        assert!(kinds.contains("low_synthesis_concept"));
        assert!(kinds.contains("orphan_concept"));
        let concept = report
            .concepts
            .iter()
            .find(|concept| concept.concept_path == "concepts/research-strategy.md")
            .expect("concept report");
        assert_eq!(concept.claim_ids, vec!["claim-dfc".to_string()]);
        assert_eq!(concept.source_ids, vec!["LLM-0001".to_string()]);
        assert_eq!(
            concept.artifact_paths,
            vec!["parsed/dfc/combined.md".to_string()]
        );
        assert!(concept
            .artifact_statuses
            .contains(&"parsed/dfc/combined.md:stale".to_string()));
        let persisted = read_text(&vault.join("_state").join("obsidian-reading-quality.json"));
        assert!(persisted.contains("\"conceptPath\": \"concepts/research-strategy.md\""));
        assert!(persisted.contains("\"artifact_hash_mismatch_reference\""));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn product_scorecard_covers_core_validation_flow() {
        let vault = test_vault("product-scorecard");
        create_minimal_vault(&vault).expect("create minimal vault");
        let source = vault.join("raw").join("paper.md");
        write_text(&source, "# Paper\n\nEfficient reasoning evidence.\n").expect("write source");
        let staged = stage_text_artifacts(&vault).expect("stage source");
        assert_eq!(staged.len(), 1);
        let plan = plan_ingest(to_display(&vault)).expect("plan source");
        let registry = plan.registry.first().expect("registry entry");
        let source_uuid = registry.source_uuid.clone();
        let source_id = registry.source_id.clone().expect("source id");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            &format!(
                "{{\"claim_id\":\"c1\",\"claim_text\":\"Efficient reasoning is emphasized.\",\"verdict\":\"supported\",\"status\":\"supported\",\"source_id\":\"{}\",\"source_uuid\":\"{}\",\"source_path\":\"{}\",\"evidence_quote\":\"Efficient reasoning evidence.\",\"evidence_hash\":\"{}\"}}\n",
                source_id,
                source_uuid,
                registry.source_path,
                sha256_text("Efficient reasoning evidence.")
            ),
        )
        .expect("write claim");
        let _proposal = create_writeback_proposal(
            to_display(&vault),
            "reviews/query-writeback/dfc-scorecard.md".to_string(),
            "Scorecard proposal".to_string(),
            "Evidence: supported by c1.".to_string(),
        )
        .expect("writeback proposal");

        let report = write_product_scorecard_report(&vault).expect("write scorecard");
        assert!(report
            .metrics
            .iter()
            .any(|metric| metric.metric_id == "ingest_plan" && metric.status == "pass"));
        assert!(report
            .metrics
            .iter()
            .any(|metric| metric.metric_id == "obsidian_entry" && metric.status == "manual"));
        assert!(report
            .metrics
            .iter()
            .any(|metric| metric.metric_id == "query_writeback" && metric.status == "pass"));
        let rendered = read_text(&product_scorecard_report_path(&vault));
        assert!(rendered.contains("DFC is used here as an evaluation corpus / benchmark"));
        assert!(rendered.contains("| Query writeback proposal boundary | `pass` |"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn product_scorecard_fails_unreadable_query_writeback_state() {
        let vault = test_vault("product-scorecard-unreadable-writeback");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &writeback_proposal_path(&vault, "wb-broken"),
            "{not valid json\n",
        )
        .expect("write broken proposal state");

        let report = build_product_scorecard_report(&vault);
        let metric = report
            .metrics
            .iter()
            .find(|metric| metric.metric_id == "query_writeback")
            .expect("query writeback metric");
        assert_eq!(metric.status, "fail");
        assert!(metric
            .counts
            .iter()
            .any(|detail| detail.contains("invalid_files: 1")));
        assert!(metric
            .next_action
            .contains("Repair or regenerate writeback proposal artifacts"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn product_scorecard_fails_unsafe_query_writeback_proposal_contract() {
        let vault = test_vault("product-scorecard-unsafe-writeback");
        create_minimal_vault(&vault).expect("create minimal vault");
        let unsafe_proposal = serde_json::json!({
            "proposalId": "wb-unsafe",
            "targetPath": "reviews/query-writeback/unsafe.md",
            "title": "Unsafe proposal",
            "status": "proposed",
            "diff": "+ unchecked draft\n",
            "content": "# Draft\n\nUnchecked proposal body.\n",
            "createdAt": "2026-05-26T00:00:00+08:00",
            "updatedAt": "2026-05-26T00:00:00+08:00",
            "appliedAt": null,
            "logPath": null
        });
        write_text(
            &writeback_proposal_path(&vault, "wb-unsafe"),
            &(serde_json::to_string_pretty(&unsafe_proposal).expect("proposal json") + "\n"),
        )
        .expect("write unsafe proposal state");

        let report = build_product_scorecard_report(&vault);
        let metric = report
            .metrics
            .iter()
            .find(|metric| metric.metric_id == "query_writeback")
            .expect("query writeback metric");
        assert_eq!(metric.status, "fail");
        assert!(metric
            .counts
            .iter()
            .any(|detail| detail.contains("unsafe_proposed: 1")));
        assert!(metric
            .counts
            .iter()
            .any(|detail| detail.contains("missing writeback_applied: false marker")));
        assert!(metric
            .counts
            .iter()
            .any(|detail| detail.contains("missing human approval gate")));
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn product_scorecard_fails_on_stale_desktop_artifacts() {
        let vault = test_vault("product-scorecard-desktop-stale-artifact");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:desktop\",\"source_id\":\"LLM-0001\",\"source_path\":\"raw/inbox/paper.pdf\",\"source_sha256\":\"paper-hash\",\"status\":\"published\",\"source_page\":\"sources/LLM-0001.md\",\"artifact_path\":\"raw/paper_markdown/combined.md\"}\n",
        )
        .expect("registry");
        write_text(&vault.join("_state").join("artifacts.jsonl"), "").expect("runtime artifacts");
        write_text(
            &vault.join("_state").join("desktop-artifacts.jsonl"),
            "{\"source_uuid\":\"sha256:desktop\",\"source_id\":\"LLM-0001\",\"artifact_path\":\"raw/paper_markdown/combined.md\",\"manifest_path\":\"raw/paper_markdown/manifest.json\",\"status\":\"stale\",\"contract_valid\":true}\n",
        )
        .expect("desktop artifacts");

        let report = build_product_scorecard_report(&vault);
        let registry_manifest = report
            .metrics
            .iter()
            .find(|metric| metric.metric_id == "registry_manifest")
            .expect("registry manifest metric");
        assert_eq!(registry_manifest.status, "fail");
        assert!(registry_manifest
            .counts
            .contains(&"stale_or_invalid_artifacts: 1".to_string()));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn selected_vault_state_uses_workspace_cache_when_app_cwd_is_unrelated() {
        let workspace = test_vault("workspace-state");
        let _ = fs::remove_dir_all(&workspace);
        fs::create_dir_all(workspace.join("deepseek_paper")).expect("deepseek dir");
        fs::create_dir_all(workspace.join("vaults")).expect("vaults dir");
        write_text(&workspace.join("AGENTS.md"), "rules").expect("agents");
        let vault = workspace.join("vaults").join("deepseek-vault");
        create_minimal_vault(&vault).expect("create minimal vault");

        let state = save_last_selected_vault(to_display(&vault)).expect("save selected vault");
        assert_eq!(
            state.last_selected_vault.as_deref(),
            Some(to_display(&vault).as_str())
        );
        assert!(workspace
            .join(".cache")
            .join("llm-wiki-desktop")
            .join("desktop-state.json")
            .is_file());

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn missing_path_reports_trailing_space_suggestion() {
        let root = test_vault("space-root");
        let actual = root.join("LLM-Wiki ");
        fs::create_dir_all(actual.join("vaults").join("deepseek")).expect("create spaced path");
        let requested = root.join("LLM-Wiki").join("vaults").join("deepseek");
        let suggestion = path_whitespace_suggestion(&requested).expect("suggest spaced path");
        assert_eq!(suggestion, actual.join("vaults").join("deepseek"));
        let error = require_existing_dir(&requested, "vault").expect_err("missing path");
        assert!(error.contains("significant whitespace"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn desktop_settings_reject_outside_scheduled_import_paths() {
        for (index, path) in ["../outside", "/tmp/outside", "raw/../outside", "sources"]
            .iter()
            .enumerate()
        {
            let vault = test_vault(&format!("scheduled-import-outside-{index}"));
            let mut settings = DesktopSettings::default();
            settings.scheduled_import_path = path.to_string();

            let error = save_desktop_settings(to_display(&vault), settings)
                .expect_err("unsafe scheduled import path should be rejected");
            assert!(error.contains("Scheduled import path"));
            assert!(!desktop_settings_path(&vault).is_file());

            let _ = fs::remove_dir_all(vault);
        }
    }

    #[test]
    fn desktop_settings_normalize_safe_scheduled_import_path() {
        let vault = test_vault("scheduled-import-safe");
        let mut settings = DesktopSettings::default();
        settings.scheduled_import_path = " raw/deepseek_paper ".to_string();

        let saved =
            save_desktop_settings(to_display(&vault), settings).expect("save safe settings path");
        assert_eq!(saved.scheduled_import_path, "raw/deepseek_paper");
        assert!(read_text(&desktop_settings_path(&vault)).contains("\"raw/deepseek_paper\""));
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn inspect_vault_discovers_nested_generated_markdown_pages() {
        let vault = test_vault("nested-markdown-discovery");
        create_minimal_vault(&vault).expect("create minimal vault");
        fs::create_dir_all(vault.join("sources").join("deepseek")).expect("nested sources");
        fs::create_dir_all(vault.join("concepts").join("architecture")).expect("nested concepts");
        fs::create_dir_all(vault.join("drafts").join("batch-1")).expect("nested drafts");
        fs::create_dir_all(vault.join("qa-reports").join("batch-1")).expect("nested reports");
        write_text(
            &vault.join("sources").join("deepseek").join("LLM-0001.md"),
            "# Nested DeepSeek Source\n",
        )
        .expect("nested source");
        write_text(
            &vault
                .join("concepts")
                .join("architecture")
                .join("moe-routing.md"),
            "# MoE Routing\n",
        )
        .expect("nested concept");
        write_text(
            &vault.join("drafts").join("batch-1").join("LLM-0002.md"),
            "# Nested Draft\n",
        )
        .expect("nested draft");
        write_text(
            &vault.join("qa-reports").join("batch-1").join("LLM-0001.md"),
            "# Nested QA Report\n",
        )
        .expect("nested report");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        assert_eq!(status.counts.sources, 1);
        assert_eq!(status.counts.concepts, 1);
        assert_eq!(status.counts.drafts, 1);
        assert!(status.counts.reports >= 2);
        assert!(status.files.iter().any(
            |file| file.kind == "source" && file.path.ends_with("sources/deepseek/LLM-0001.md")
        ));
        assert!(status.files.iter().any(|file| {
            file.kind == "concept" && file.path.ends_with("concepts/architecture/moe-routing.md")
        }));
        assert!(status
            .files
            .iter()
            .any(|file| file.kind == "report"
                && file.path.ends_with("qa-reports/batch-1/LLM-0001.md")));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn inspect_vault_exposes_markdown_excerpt_for_search() {
        let vault = test_vault("markdown-excerpt-search");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "---\ntitle: DeepSeek Router\nstatus: published\n---\n# DeepSeek Router\n\nMulti-token sentinel evidence connects MoE routing to cost control.\n\nA second paragraph should not hide the first useful reading sentence.\n",
        )
        .expect("write source page");

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        let file = status
            .files
            .iter()
            .find(|item| item.name == "LLM-0001.md")
            .expect("source file is listed");
        let excerpt = file.excerpt.as_deref().expect("excerpt");
        assert_eq!(file.title.as_deref(), Some("DeepSeek Router"));
        assert!(excerpt.contains("Multi-token sentinel evidence"));
        assert!(!excerpt.contains("title:"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn create_vault_rejects_trailing_space_path_components() {
        let root = test_vault("create-space-root");
        let portable_parent = root.join("portable");
        fs::create_dir_all(&portable_parent).expect("create portable parent");

        let trailing_target = portable_parent.join("deepseek-vault ");
        let error = create_vault(
            to_display(&trailing_target),
            None,
            "python3".to_string(),
            false,
            "minimal".to_string(),
            true,
        )
        .expect_err("reject trailing-space target");
        assert!(error.contains("trailing space"));
        assert!(!trailing_target.exists());

        let spaced_parent = root.join("LLM-Wiki ");
        fs::create_dir_all(&spaced_parent).expect("create spaced parent");
        let nested_target = spaced_parent.join("vault");
        let nested_error = create_vault(
            to_display(&nested_target),
            None,
            "python3".to_string(),
            false,
            "minimal".to_string(),
            true,
        )
        .expect_err("reject trailing-space parent");
        assert!(nested_error.contains("LLM-Wiki "));
        assert!(!nested_target.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn minimal_vault_writes_obsidian_local_profile() {
        let vault = test_vault("minimal-obsidian-profile");
        create_minimal_vault(&vault).expect("create minimal vault");

        let obsidian = vault.join(".obsidian");
        assert!(obsidian.is_dir());
        let core_plugins = read_text(&obsidian.join("core-plugins.json"));
        for plugin in [
            "file-explorer",
            "global-search",
            "graph",
            "backlink",
            "canvas",
            "templates",
        ] {
            assert!(
                core_plugins.contains(plugin),
                "missing core plugin {plugin}"
            );
        }
        assert_eq!(read_text(&obsidian.join("community-plugins.json")), "[]\n");
        assert!(read_text(&obsidian.join("app.json")).contains("\"alwaysUpdateLinks\": true"));
        assert!(read_text(&obsidian.join("templates.json")).contains("\"folder\": \"templates\""));

        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        assert!(status.obsidian_enabled);

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn minimal_fallback_vault_respects_disabled_obsidian() {
        let vault = test_vault("minimal-obsidian-disabled");
        create_minimal_vault_with_obsidian(&vault, false)
            .expect("create fallback vault without Obsidian");

        assert!(!vault.join(".obsidian").exists());
        let status = inspect_vault(to_display(&vault)).expect("inspect vault");
        assert!(!status.obsidian_enabled);
        assert!(vault.join("templates/source.md").is_file());
        assert!(vault.join("templates/concept.md").is_file());

        let _ = fs::remove_dir_all(vault);
    }

    fn registry_entry(status: &str, source_page: Option<String>) -> DesktopRegistryEntry {
        DesktopRegistryEntry {
            source_uuid: "sha256:abc".to_string(),
            source_id: Some("LLM-0001".to_string()),
            duplicate_of: None,
            raw_path: "raw/paper_markdown/combined.md".to_string(),
            canonical_path: "raw/paper_markdown/combined.md".to_string(),
            source_path: "raw/paper_markdown/combined.md".to_string(),
            source_sha256: "abc".to_string(),
            mime: "text/markdown".to_string(),
            artifact_path: Some("raw/paper_markdown/combined.md".to_string()),
            artifact_sha256: Some("def".to_string()),
            parser: Some("local-text".to_string()),
            parser_version: Some("test".to_string()),
            status: status.to_string(),
            source_page,
            last_error: None,
            created_at: None,
            updated_at: Some(Local::now().to_rfc3339()),
            published_at: None,
        }
    }

    #[test]
    fn runtime_source_registry_normalizes_desktop_ready_status() {
        let vault = test_vault("registry-ready-normalize");
        create_minimal_vault(&vault).expect("create minimal vault");
        fs::create_dir_all(vault.join("raw").join("paper_markdown")).expect("raw dir");
        write_text(
            &vault.join("raw").join("paper_markdown").join("combined.md"),
            "# Paper\n",
        )
        .expect("write artifact");
        write_text(&vault.join("sources").join("LLM-0001.md"), "# Source\n")
            .expect("write source page");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:abc\",\"source_id\":\"LLM-0001\",\"raw_hash\":\"abc\",\"raw_path\":\"raw/paper_markdown/combined.md\",\"status\":\"ready\"}\n",
        )
        .expect("write legacy row");

        let entry = registry_entry("ready", Some("sources/LLM-0001.md".to_string()));
        merge_runtime_source_registry(&vault, &[entry]).expect("merge registry");
        let rows = registry_rows(&vault);
        assert_eq!(
            json_string(&rows[0], "status").as_deref(),
            Some("published")
        );
        assert_eq!(
            json_string(&rows[0], "desktop_status").as_deref(),
            Some("ready")
        );
        assert_eq!(json_string(&rows[0], "raw_hash").as_deref(), Some("abc"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_source_registry_maps_ready_without_page_to_parsed() {
        let vault = test_vault("registry-ready-parsed");
        create_minimal_vault(&vault).expect("create minimal vault");
        let entry = registry_entry("ready", Some("sources/LLM-0001.md".to_string()));
        merge_runtime_source_registry(&vault, &[entry]).expect("merge registry");
        let rows = registry_rows(&vault);
        assert_eq!(json_string(&rows[0], "status").as_deref(), Some("parsed"));
        assert_eq!(
            json_string(&rows[0], "desktop_status").as_deref(),
            Some("ready")
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_source_registry_normalizes_orphan_legacy_ready_rows() {
        let vault = test_vault("registry-ready-orphan");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:legacy\",\"source_sha256\":\"legacy\",\"source_path\":\"raw/legacy.pdf\",\"status\":\"ready\"}\n",
        )
        .expect("write legacy row");

        merge_runtime_source_registry(&vault, &[]).expect("normalize registry");
        let rows = registry_rows(&vault);
        assert_eq!(json_string(&rows[0], "status").as_deref(), Some("parsed"));
        assert_eq!(
            json_string(&rows[0], "desktop_status").as_deref(),
            Some("ready")
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn obsidian_uri_uses_absolute_file_path_without_vault_registry() {
        let workspace = test_vault("workspace-uri");
        let vault = workspace.join("vaults").join("deepseek-vault");
        fs::create_dir_all(vault.join("reviews").join("query-writeback")).expect("vault dirs");
        let entry = vault
            .join("reviews")
            .join("query-writeback")
            .join("deepseek research.md");
        write_text(&entry, "# Insight\n").expect("entry");
        let uri = obsidian_file_uri(&vault, &entry);
        let entry_path = entry.canonicalize().expect("canonical entry");
        assert!(uri.starts_with("obsidian://open?path="));
        assert!(uri.contains(&percent_encode_query_value(&to_display(&entry_path))));
        assert!(!uri.contains("vault="));
        assert!(!uri.contains("file="));

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn generated_obsidian_home_refreshes_managed_status_counts() {
        let vault = test_vault("obsidian-home-refresh");
        create_minimal_vault(&vault).expect("create vault");
        let raw_dir = vault.join("raw").join("deepseek_paper");
        fs::create_dir_all(&raw_dir).expect("create raw corpus dir");
        let raw_pdf = raw_dir.join("DeepSeek-Test_2401.00001.pdf");
        fs::write(&raw_pdf, b"%PDF-1.4\n% synthetic raw evidence\n").expect("write raw pdf");
        let raw_hash = sha256_file(&raw_pdf).expect("hash raw pdf");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            &format!(
                "{{\"source_id\":\"LLM-0001\",\"source_uuid\":\"{}\",\"raw_path\":\"raw/deepseek_paper/DeepSeek-Test_2401.00001.pdf\",\"raw_hash\":\"{}\",\"status\":\"candidate\"}}\n",
                source_uuid(&raw_hash),
                raw_hash
            ),
        )
        .expect("write registry candidate");

        let home = generate_entry_note(&vault).expect("generate home");
        let before = read_text(&home);
        assert!(before.contains("- Raw evidence inputs: 1"));
        assert!(before.contains("- Registry candidates: 1"));
        assert!(before.contains("- Pending parse or ingest: 1"));
        assert!(before.contains("- Source pages: 0"));
        assert!(before.contains("## Corpus Map"));
        assert!(before.contains("### Raw Evidence Awaiting Ingest"));
        assert!(before.contains("[[raw/deepseek_paper/DeepSeek-Test_2401.00001.pdf]]"));

        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nEvidence from a generated source.\n",
        )
        .expect("write source");

        let refreshed = generate_entry_note(&vault).expect("refresh home");
        assert_eq!(refreshed, home);
        let after = read_text(&home);
        assert!(after.contains("- Source pages: 1"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn generated_obsidian_home_surfaces_current_ingest_plan_gates() {
        let vault = test_vault("obsidian-home-ingest-plan");
        create_minimal_vault(&vault).expect("create vault");
        let primary = vault.join("raw").join("a-primary.md");
        let duplicate = vault.join("raw").join("z-duplicate.md");
        write_text(&primary, "# Same Source\n").expect("write primary");
        write_text(&duplicate, "# Same Source\n").expect("write duplicate");

        let plan = plan_ingest(to_display(&vault)).expect("write desktop ingest plan");
        assert_eq!(
            plan.entries
                .iter()
                .filter(|entry| plan_entry_is_pipeline_runnable(entry))
                .count(),
            1
        );
        assert!(plan
            .entries
            .iter()
            .any(|entry| entry.current_state == "duplicate"
                && entry.requires_human_approval
                && entry.file_name == "z-duplicate.md"));

        let home = generate_entry_note(&vault).expect("generate home");
        let text = read_text(&home);
        assert!(text.contains("- Runnable ingest inputs: 1"));
        assert!(text.contains("- Review-gated ingest inputs: 1"));
        assert!(text.contains("- Plan generated: "));
        assert!(!text.contains("- Plan generated: not generated"));
        assert!(text.contains("### Runnable Ingest Inputs"));
        assert!(text.contains("[[raw/a-primary|a-primary.md]]"));
        assert!(text.contains("`imported`"));
        assert!(text.contains("### Review-Gated Ingest Inputs"));
        assert!(text.contains("[[raw/z-duplicate|z-duplicate.md]]"));
        assert!(text.contains("`duplicate`"));
        assert!(text.contains(
            "Which runnable inputs can be parsed, staged, or published now, and which are review-gated?"
        ));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn generated_obsidian_home_creates_canvas_from_impact_graph() {
        let vault = test_vault("obsidian-impact-canvas");
        create_minimal_vault(&vault).expect("create vault");
        write_jsonl(
            &vault.join("_state").join("impact-graph.jsonl"),
            &[
                ImpactEdge {
                    edge_id: "edge-source-claim".to_string(),
                    from_type: "source".to_string(),
                    from_id: "LLM-0001".to_string(),
                    to_type: "claim".to_string(),
                    to_id: "claim-1".to_string(),
                    relationship: "asserts".to_string(),
                    status: "supported".to_string(),
                },
                ImpactEdge {
                    edge_id: "edge-claim-concept".to_string(),
                    from_type: "claim".to_string(),
                    from_id: "claim-1".to_string(),
                    to_type: "concept".to_string(),
                    to_id: "research-strategy".to_string(),
                    relationship: "affects".to_string(),
                    status: "needs_review".to_string(),
                },
            ],
        )
        .expect("write impact graph");

        let home = generate_entry_note(&vault).expect("generate home");
        let canvas_path = vault.join("canvas").join("wiki-graph.canvas");
        assert!(canvas_path.is_file());
        let canvas_text = read_text(&canvas_path);
        assert!(canvas_text.contains("llm-wiki-desktop generated impact graph"));
        let canvas: serde_json::Value =
            serde_json::from_str(&canvas_text).expect("canvas json is valid");
        assert_eq!(
            canvas
                .get("edges")
                .and_then(|value| value.as_array())
                .map(Vec::len),
            Some(2)
        );
        assert!(canvas_text.contains("source: LLM-0001"));
        assert!(canvas_text.contains("claim: claim-1"));
        assert!(canvas_text.contains("concept: research-strategy"));

        let home_text = read_text(&home);
        assert!(home_text.contains("- Obsidian canvases: 1"));
        assert!(home_text.contains("[[canvas/wiki-graph.canvas]]"));

        write_text(
            &canvas_path,
            "{\"nodes\":[{\"id\":\"manual\"}],\"edges\":[]}\n",
        )
        .expect("write manual canvas");
        let refreshed = generate_entry_note(&vault).expect("refresh home");
        assert_eq!(refreshed, home);
        assert_eq!(
            read_text(&canvas_path),
            "{\"nodes\":[{\"id\":\"manual\"}],\"edges\":[]}\n"
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn generated_obsidian_home_preserves_custom_entry_note() {
        let vault = test_vault("obsidian-home-custom");
        create_minimal_vault(&vault).expect("create vault");
        let home = generated_entry_note(&vault);
        write_text(&home, "# My Custom Home\n\nKeep this manual entry.\n").expect("custom home");

        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nEvidence from a generated source.\n",
        )
        .expect("write source");

        let resolved = generate_entry_note(&vault).expect("resolve home");
        assert_eq!(resolved, home);
        assert_eq!(
            read_text(&home),
            "# My Custom Home\n\nKeep this manual entry.\n"
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_item_resolution_rejects_escape_paths() {
        let vault = test_vault("vault-item");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(&vault.join("claims").join("claims.jsonl"), "").expect("claims");
        assert!(resolve_vault_item_path(&vault, "claims/claims.jsonl").is_ok());
        assert!(resolve_vault_item_path(&vault, "../outside.md").is_err());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_text_preview_reads_markdown_and_rejects_unsafe_targets() {
        let vault = test_vault("vault-text-preview");
        create_minimal_vault(&vault).expect("create minimal vault");
        let source = vault.join("sources").join("LLM-0001.md");
        write_text(&source, "# Source\n\nEvidence-backed note.").expect("source");
        let preview = read_vault_text_file(to_display(&vault), "sources/LLM-0001.md".to_string())
            .expect("preview markdown");
        assert_eq!(preview.path, "sources/LLM-0001.md");
        assert!(preview.content.contains("Evidence-backed note"));
        assert!(!preview.truncated);

        let raw = vault.join("raw").join("paper.pdf");
        write_text(&raw, "%PDF placeholder").expect("raw pdf");
        assert!(read_vault_text_file(to_display(&vault), "raw/paper.pdf".to_string()).is_err());
        assert!(read_vault_text_file(to_display(&vault), "../outside.md".to_string()).is_err());

        let _ = fs::remove_dir_all(vault);
    }

    #[cfg(unix)]
    #[test]
    fn vault_text_preview_rejects_symlink_escape() {
        let vault = test_vault("vault-text-preview-symlink");
        create_minimal_vault(&vault).expect("create minimal vault");
        let outside = vault
            .parent()
            .expect("vault parent")
            .join("llm-wiki-desktop-preview-outside.md");
        write_text(&outside, "# outside").expect("outside markdown");
        let link = vault.join("sources").join("linked.md");
        std::os::unix::fs::symlink(&outside, &link).expect("symlink markdown");

        let result = read_vault_text_file(to_display(&vault), "sources/linked.md".to_string());
        assert!(result.is_err());

        let _ = fs::remove_file(outside);
        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_text_preview_truncates_large_text_files() {
        let vault = test_vault("vault-text-preview-large");
        create_minimal_vault(&vault).expect("create minimal vault");
        let long_text = "a".repeat((MAX_VAULT_TEXT_PREVIEW_BYTES + 32) as usize);
        write_text(&vault.join("concepts").join("long.md"), &long_text).expect("long concept");
        let preview = read_vault_text_file(to_display(&vault), "concepts/long.md".to_string())
            .expect("preview long markdown");
        assert!(preview.truncated);
        assert_eq!(preview.content.len(), MAX_VAULT_TEXT_PREVIEW_BYTES as usize);

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn vault_image_preview_reads_supported_images_and_rejects_unsafe_targets() {
        let vault = test_vault("vault-image-preview");
        create_minimal_vault(&vault).expect("create minimal vault");
        fs::create_dir_all(vault.join("media")).unwrap();
        fs::write(vault.join("media/chart.png"), b"\x89PNG\r\n\x1a\npreview").unwrap();
        write_text(&vault.join("media").join("not-image.md"), "not an image").expect("not image");

        let preview = read_vault_image_file(to_display(&vault), "media/chart.png".to_string())
            .expect("preview png");
        assert_eq!(preview.path, "media/chart.png");
        assert_eq!(preview.mime_type, "image/png");
        assert_eq!(preview.bytes, b"\x89PNG\r\n\x1a\npreview");

        assert!(
            read_vault_image_file(to_display(&vault), "media/not-image.md".to_string()).is_err()
        );
        assert!(read_vault_image_file(to_display(&vault), "../outside.png".to_string()).is_err());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_probe_commands_are_deterministic() {
        let cancel = runtime_probe_command("cancel_probe").expect("cancel probe");
        assert_eq!(cancel.1, 45);
        assert_eq!(cancel.2, 1);
        let timeout = runtime_probe_command("timeout_probe").expect("timeout probe");
        assert_eq!(timeout.1, 2);
        assert_eq!(timeout.2, 1);
        assert!(runtime_probe_command("lint").is_none());
    }

    #[test]
    fn cancel_probe_uses_cancel_path_without_manual_timing() {
        let vault = test_vault("cancel-probe");
        let log = run_runtime_task(
            None,
            &vault,
            None,
            "python3",
            "cancel_probe",
            "minimal",
            true,
            30,
            1,
            Some("cancel-probe-test".to_string()),
        )
        .expect("run cancel probe");
        assert_eq!(log.exit_code, -1);
        assert!(read_text(&PathBuf::from(&log.log_path)).contains("status: cancelled"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_job_times_out_and_writes_result_log() {
        let vault = test_vault("job-timeout");
        let log = run_process_job(
            None,
            &vault,
            "job-timeout-test".to_string(),
            "timeout_test",
            vec![
                "/bin/sh".to_string(),
                "-c".to_string(),
                "sleep 2".to_string(),
            ],
            1,
            1,
        )
        .expect("run timeout job");
        assert_eq!(log.exit_code, -1);
        assert!(read_text(&PathBuf::from(&log.log_path)).contains("status: timeout"));
        assert!(vault
            .join("_state")
            .join("desktop-runtime-jobs.jsonl")
            .is_file());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_job_retry_count_reexecutes_failed_command() {
        let vault = test_vault("job-retry");
        let marker = vault.join("_state").join("retry-count.txt");
        let marker_arg = marker.to_string_lossy().replace('\'', "'\\''");
        let script = format!(
            "count=$(cat '{marker_arg}' 2>/dev/null || echo 0); count=$((count + 1)); echo $count > '{marker_arg}'; if [ $count -lt 2 ]; then echo retry-fail; exit 7; fi; echo retry-ok; exit 0"
        );
        let log = run_process_job(
            None,
            &vault,
            "job-retry-test".to_string(),
            "retry_test",
            vec!["/bin/sh".to_string(), "-c".to_string(), script],
            5,
            2,
        )
        .expect("run retry job");
        assert_eq!(log.exit_code, 0);
        assert!(log.stdout.contains("retry-fail"));
        assert!(log.stdout.contains("retry-ok"));
        assert_eq!(read_text(&marker).trim(), "2");

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_job_history_lists_persisted_results() {
        let vault = test_vault("job-history");
        let log = run_process_job(
            None,
            &vault,
            "job-history-test".to_string(),
            "history_test",
            vec![
                "/bin/sh".to_string(),
                "-c".to_string(),
                "echo history-ok".to_string(),
            ],
            5,
            3,
        )
        .expect("run history job");
        assert_eq!(log.exit_code, 0);
        let history = list_runtime_jobs(to_display(&vault)).expect("list runtime jobs");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].job_id, "job-history-test");
        assert_eq!(history[0].status, "succeeded");
        assert_eq!(history[0].attempt, 1);
        assert_eq!(history[0].max_attempts, 3);
        assert_eq!(history[0].retry_count, 3);
        assert_eq!(history[0].duration_ms, history[0].elapsed_ms);
        assert_eq!(history[0].live_log_path, history[0].log_path);
        assert!(history[0]
            .stdout_tail
            .as_deref()
            .unwrap_or_default()
            .contains("history-ok"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_job_history_collapses_running_and_final_events() {
        let vault = test_vault("job-history-collapse");
        let started_at = Local::now().to_rfc3339();
        let running = runtime_job_start_event(
            "job-collapse-test",
            "lint",
            vec!["desktop:runtime_command".to_string(), "lint".to_string()],
            started_at.clone(),
            2,
            "queued",
            None,
            None,
        );
        assert_eq!(running.status, "queued");
        append_runtime_job_state(&vault, &running).expect("append running event");
        let mut finished = running.clone();
        finished.status = "succeeded".to_string();
        finished.ended_at = Some(Local::now().to_rfc3339());
        finished.exit_code = Some(0);
        finished.message = Some("completed".to_string());
        append_runtime_job_state(&vault, &finished).expect("append finished event");

        let history = list_runtime_jobs(to_display(&vault)).expect("list runtime jobs");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].job_id, "job-collapse-test");
        assert_eq!(history[0].status, "succeeded");
        assert_eq!(history[0].started_at, started_at);

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn runtime_job_cancel_terminates_running_child() {
        let vault = test_vault("job-cancel");
        let job_id = "job-cancel-test".to_string();
        let cancel_id = job_id.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(250));
            cancel_runtime_job(cancel_id).expect("cancel job");
        });
        let log = run_process_job(
            None,
            &vault,
            job_id,
            "cancel_test",
            vec![
                "/bin/sh".to_string(),
                "-c".to_string(),
                "sleep 5".to_string(),
            ],
            10,
            1,
        )
        .expect("run cancel job");
        assert_eq!(log.exit_code, -1);
        assert!(read_text(&PathBuf::from(&log.log_path)).contains("status: cancelled"));

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn query_writeback_composer_creates_review_proposal_without_apply() {
        let vault = test_vault("query-writeback");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# DeepSeek Source\n\nEfficient reasoning evidence.\n",
        )
        .expect("source page");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:fresh\",\"source_id\":\"LLM-0001\",\"source_path\":\"raw/inbox/fresh.pdf\",\"source_sha256\":\"fresh\",\"status\":\"published\",\"source_page\":\"sources/LLM-0001.md\"}\n",
        )
        .expect("registry");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            "{\"claim_id\":\"c1\",\"claim_text\":\"DeepSeek optimizes for efficient reasoning.\",\"verdict\":\"supported\",\"source_id\":\"LLM-0001\",\"source_uuid\":\"sha256:fresh\",\"source_path\":\"sources/LLM-0001.md\",\"evidence_quote\":\"efficient reasoning\"}\n",
        )
        .expect("write claim");
        let draft = create_query_writeback_proposal(
            to_display(&vault),
            "Summarize DeepSeek research strategy".to_string(),
            "reviews/query-writeback/deepseek-research-insights.md".to_string(),
            "DeepSeek research insights".to_string(),
        )
        .expect("create query proposal");
        assert_eq!(draft.proposal.status, "proposed");
        assert_eq!(draft.evidence_map.len(), 1);
        assert_eq!(
            draft.evidence_map[0].claim_text,
            "DeepSeek optimizes for efficient reasoning."
        );
        assert_eq!(draft.evidence_map[0].claim_path, "claims/claims.jsonl");
        assert_eq!(
            draft.evidence_map[0].conclusion_type,
            "evidence-backed conclusion"
        );
        assert_eq!(draft.evidence_map[0].freshness_status, "fresh");
        assert_eq!(draft.citation_coverage.conclusions, 1);
        assert_eq!(draft.citation_coverage.cited, 1);
        assert_eq!(draft.citation_coverage.unsupported, 0);
        assert_eq!(draft.citation_coverage.stale_or_risky, 0);
        assert!(!draft.citation_coverage.needs_evidence_review);
        assert!(draft
            .answer
            .contains("1 conclusions / 1 cited / 0 unsupported / 0 stale-or-risky"));
        assert!(draft.answer.contains("## Evidence map"));
        assert!(draft.answer.contains("## Answer schema"));
        assert!(draft.answer.contains("### Evidence"));
        assert!(draft.answer.contains("### Inference"));
        assert!(draft.answer.contains("### Hypothesis"));
        assert!(draft.answer.contains("### Forecast"));
        assert!(draft.answer.contains("### Writeback plan"));
        assert!(draft
            .answer
            .contains("target_page: `reviews/query-writeback/deepseek-research-insights.md`"));
        assert!(draft.answer.contains("## Source index"));
        assert!(draft.answer.contains("## Concept index"));
        assert!(draft.answer.contains("## Diff preview"));
        assert!(draft.answer.contains("## Approval status"));
        assert!(draft.writeback_proposal.contains("human approval required"));
        assert_eq!(draft.approval_status, "proposed");
        assert_eq!(draft.diff_preview, draft.proposal.diff);
        assert!(!vault
            .join("reviews")
            .join("query-writeback")
            .join("deepseek-research-insights.md")
            .exists());

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn query_writeback_unsupported_draft_stays_review_only() {
        let vault = test_vault("query-writeback-unsupported");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("concepts").join("research-strategy.md"),
            "# Research Strategy\n",
        )
        .expect("concept");

        let concept_error = create_query_writeback_proposal(
            to_display(&vault),
            "Summarize DeepSeek research strategy".to_string(),
            "concepts/research-strategy.md".to_string(),
            "Unsupported concept writeback".to_string(),
        )
        .expect_err("unsupported concept target should fail");
        assert!(concept_error.contains("unsupported query draft cannot target concepts/"));

        let draft = create_query_writeback_proposal(
            to_display(&vault),
            "Summarize DeepSeek research strategy".to_string(),
            "reviews/query-writeback/unsupported.md".to_string(),
            "Unsupported review draft".to_string(),
        )
        .expect("review-only unsupported draft");
        assert_eq!(draft.proposal.status, "proposed");
        assert_eq!(draft.citation_coverage.conclusions, 1);
        assert_eq!(draft.citation_coverage.cited, 0);
        assert_eq!(draft.citation_coverage.unsupported, 1);
        assert_eq!(draft.citation_coverage.stale_or_risky, 0);
        assert!(draft.citation_coverage.needs_evidence_review);
        assert!(draft.answer.contains("unsupported_draft: true"));
        assert!(draft.answer.contains("needs evidence review"));
        assert!(draft
            .answer
            .contains("Empty / unsupported: 当前 vault 没有 fresh supported evidence claim"));
        assert!(draft.answer.contains("### Writeback plan"));
        assert!(
            !read_text(&vault.join("concepts").join("research-strategy.md"))
                .contains("Unsupported")
        );

        let _ = fs::remove_dir_all(vault);
    }

    #[test]
    fn query_writeback_blocks_stale_or_mismatched_evidence_from_conclusions() {
        let vault = test_vault("query-writeback-blocked-evidence");
        create_minimal_vault(&vault).expect("create minimal vault");
        write_text(
            &vault.join("sources").join("LLM-0001.md"),
            "# Fresh Source\n\nFresh evidence.\n",
        )
        .expect("fresh source page");
        write_text(
            &vault.join("sources").join("LLM-0002.md"),
            "# Stale Source\n\nStale evidence.\n",
        )
        .expect("stale source page");
        write_text(
            &vault.join("_state").join("source-registry.jsonl"),
            "{\"source_uuid\":\"sha256:fresh\",\"source_id\":\"LLM-0001\",\"source_path\":\"raw/inbox/fresh.pdf\",\"source_sha256\":\"fresh\",\"status\":\"published\",\"source_page\":\"sources/LLM-0001.md\"}\n{\"source_uuid\":\"sha256:stale\",\"source_id\":\"LLM-0002\",\"source_path\":\"raw/inbox/stale.pdf\",\"source_sha256\":\"stale\",\"status\":\"published\",\"source_page\":\"sources/LLM-0002.md\",\"artifact_path\":\"parsed/stale/combined.md\"}\n",
        )
        .expect("registry");
        write_text(
            &vault.join("_state").join("artifacts.jsonl"),
            "{\"source_uuid\":\"sha256:stale\",\"source_id\":\"LLM-0002\",\"artifact_path\":\"parsed/stale/combined.md\",\"manifest_path\":\"parsed/stale/manifest.json\",\"status\":\"stale\",\"contract_valid\":false}\n",
        )
        .expect("artifacts");
        write_text(
            &vault.join("claims").join("claims.jsonl"),
            "{\"claim_id\":\"fresh-claim\",\"claim_text\":\"Fresh claim can support a conclusion.\",\"verdict\":\"supported\",\"status\":\"supported\",\"source_id\":\"LLM-0001\",\"source_uuid\":\"sha256:fresh\",\"source_path\":\"sources/LLM-0001.md\",\"evidence_quote\":\"Fresh evidence\",\"evidence_hash\":\"fresh-hash\"}\n{\"claim_id\":\"blocked-claim\",\"claim_text\":\"Blocked claim must not become a conclusion.\",\"verdict\":\"supported\",\"status\":\"supported\",\"source_id\":\"LLM-0002\",\"source_uuid\":\"sha256:stale\",\"source_path\":\"sources/LLM-0002.md\",\"evidence_quote\":\"Stale evidence\",\"evidence_hash\":\"stale-hash\"}\n{\"claim_id\":\"unknown-source\",\"claim_text\":\"Unknown source evidence must stay risk-only.\",\"verdict\":\"supported\",\"status\":\"supported\",\"source_uuid\":\"sha256:unknown\",\"evidence_quote\":\"Unknown evidence\",\"evidence_hash\":\"unknown-hash\"}\n",
        )
        .expect("claims");

        let draft = create_query_writeback_proposal(
            to_display(&vault),
            "Summarize DeepSeek research strategy".to_string(),
            "reviews/query-writeback/deepseek-risk-gated.md".to_string(),
            "DeepSeek risk gated insights".to_string(),
        )
        .expect("create gated proposal");
        let fresh = draft
            .evidence_map
            .iter()
            .find(|item| item.claim_id == "fresh-claim")
            .expect("fresh evidence");
        assert_eq!(fresh.conclusion_type, "evidence-backed conclusion");
        assert_eq!(fresh.freshness_status, "fresh");
        let blocked = draft
            .evidence_map
            .iter()
            .find(|item| item.claim_id == "blocked-claim")
            .expect("blocked evidence");
        assert_eq!(blocked.conclusion_type, "blocked evidence - risk only");
        assert_eq!(blocked.freshness_status, "blocked");
        assert!(blocked
            .blocked_reason
            .as_deref()
            .unwrap_or_default()
            .contains("artifact parsed/stale/combined.md hash does not match manifest"));
        let unknown = draft
            .evidence_map
            .iter()
            .find(|item| item.claim_id == "unknown-source")
            .expect("unknown source evidence");
        assert_eq!(unknown.freshness_status, "blocked");
        assert!(unknown
            .blocked_reason
            .as_deref()
            .unwrap_or_default()
            .contains("unknown source_uuid sha256:unknown"));
        assert_eq!(draft.citation_coverage.conclusions, 3);
        assert_eq!(draft.citation_coverage.cited, 1);
        assert_eq!(draft.citation_coverage.unsupported, 0);
        assert_eq!(draft.citation_coverage.stale_or_risky, 2);
        assert!(draft.citation_coverage.needs_evidence_review);
        assert!(draft.writeback_proposal.contains(
            "Citation coverage: 3 conclusions / 1 cited / 0 unsupported / 2 stale-or-risky"
        ));
        assert!(draft.answer.contains("### Blocked evidence / risks"));
        assert!(draft.answer.contains("## Risk / Needs human confirmation"));
        assert!(draft.answer.contains("needs evidence review"));
        assert!(draft
            .uncertainty_conflicts
            .iter()
            .any(|item| item.contains("blocked evidence")));
        assert!(!draft
            .insight_candidates
            .iter()
            .any(|item| item.contains("blocked-claim")));
        assert!(draft.diff_preview.contains("blocked-claim"));
        assert!(draft
            .diff_preview
            .contains("Risk / Needs human confirmation"));
        assert!(!draft.diff_preview.contains(
            "Evidence-backed conclusion: 先从这些 claim 提炼确定性内容：`blocked-claim`"
        ));

        let _ = fs::remove_dir_all(vault);
    }
}

fn command_spec(
    kind: &str,
    vault: &Path,
    profile: &str,
    skip_downloads: bool,
) -> Result<(&'static str, Vec<String>), String> {
    let vault_arg = to_display(vault);
    let mut spec = match kind {
        "lint" => (
            "wiki_lint.py",
            vec![
                vault_arg,
                "--obsidian".to_string(),
                "--fail-on".to_string(),
                "p1".to_string(),
            ],
        ),
        "obsidian_setup" => (
            "wiki_obsidian_setup.py",
            vec![vault_arg, "--profile".to_string(), profile.to_string()],
        ),
        "status_dashboard" => (
            "wiki_status.py",
            vec![
                vault_arg,
                "--write-dashboard".to_string(),
                "--force".to_string(),
            ],
        ),
        "discover" => ("wiki_discover_sources.py", vec![vault_arg]),
        "ingest_corpus" => (
            "wiki_ingest_corpus.py",
            vec![vault_arg, "--resume".to_string()],
        ),
        "claims" => ("wiki_claims.py", vec![vault_arg]),
        "normalize" => (
            "wiki_normalize_metrics.py",
            vec![vault_arg, "--in-place".to_string()],
        ),
        "semantic_qa" => (
            "wiki_semantic_qa.py",
            vec![
                vault_arg,
                "--write-report".to_string(),
                "--assign-verdicts".to_string(),
                "--in-place".to_string(),
                "--fail-on".to_string(),
                "p1".to_string(),
            ],
        ),
        "contradictions" => (
            "wiki_contradictions.py",
            vec![vault_arg, "--write-report".to_string()],
        ),
        "science_review" => (
            "wiki_science_review.py",
            vec![
                vault_arg,
                "--queue".to_string(),
                "--write-report".to_string(),
            ],
        ),
        "concept_revision_preview" => ("wiki_concept_revision.py", vec![vault_arg]),
        "concept_revision_apply" => (
            "wiki_concept_revision.py",
            vec![vault_arg, "--apply".to_string()],
        ),
        _ => return Err(format!("unsupported runtime command: {kind}")),
    };
    if kind == "obsidian_setup" && skip_downloads {
        spec.1.push("--skip-downloads".to_string());
    }
    Ok(spec)
}

fn resolve_scripts_dir(vault: &Path, runtime_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = runtime_scripts_path(vault) {
        return Ok(path);
    }
    if let Some(runtime) = runtime_path.filter(|value| !value.trim().is_empty()) {
        let root = PathBuf::from(runtime);
        let direct = root.join("scripts");
        if direct.join("wiki_lint.py").is_file() {
            return Ok(direct);
        }
        if root.join("wiki_lint.py").is_file() {
            return Ok(root);
        }
    }
    Err(
        "missing open-llm-wiki runtime scripts; select runtime path or initialize the vault"
            .to_string(),
    )
}

fn is_workspace_root(path: &Path) -> bool {
    path.join("deepseek_paper").is_dir()
        && path.join("vaults").is_dir()
        && path.join("open-llm-wiki").is_dir()
}

fn looks_like_generated_vault(path: &Path) -> bool {
    path.join("_state").is_dir()
        || path.join("sources").is_dir()
        || path.join("concepts").is_dir()
        || path.join("claims").is_dir()
        || path.join("LLM Wiki Home.md").is_file()
}

fn folder_contains_pdf(path: &Path, depth: usize) -> bool {
    if depth == 0 {
        return false;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let candidate = entry.path();
        if candidate.is_file()
            && candidate
                .extension()
                .and_then(OsStr::to_str)
                .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        {
            return true;
        }
        if candidate.is_dir() && folder_contains_pdf(&candidate, depth - 1) {
            return true;
        }
    }
    false
}

fn is_raw_source_folder(path: &Path) -> bool {
    if looks_like_generated_vault(path) {
        return false;
    }
    let name = path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(name.as_str(), "deepseek_paper" | "raw" | "inbox") || folder_contains_pdf(path, 2)
}

fn first_generated_vault_under(root: &Path) -> Option<PathBuf> {
    let vaults = root.join("vaults");
    let mut candidates = fs::read_dir(&vaults)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && looks_like_generated_vault(path))
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.into_iter().next()
}

fn generated_vault_selection_hint(selected: &Path) -> String {
    let mut roots = Vec::new();
    roots.push(selected.to_path_buf());
    if let Some(parent) = selected.parent() {
        roots.push(parent.to_path_buf());
        if let Some(grandparent) = parent.parent() {
            roots.push(grandparent.to_path_buf());
        }
    }
    for root in roots {
        if let Some(vault) = first_generated_vault_under(&root) {
            return format!(
                "Choose generated vault `{}` or another child under `vaults/`.",
                to_display(&vault)
            );
        }
        let vaults = root.join("vaults");
        if vaults.is_dir() {
            return format!("Choose a generated vault under `{}`.", to_display(&vaults));
        }
    }
    "Choose a generated vault under `vaults/<generated-vault>`.".to_string()
}

fn vault_entry_candidates(vault: &Path) -> Vec<PathBuf> {
    let name = vault
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut candidates = Vec::new();
    if name.contains("deepseek") {
        candidates.extend([
            vault.join("LLM Wiki Home.md"),
            vault.join("concepts/deepseek/research-strategy.md"),
            vault.join("concepts/deepseek-research-strategy.md"),
            vault.join("concepts/deepseek-decision-logic.md"),
            vault.join("concepts/deepseek-evolution-forecast.md"),
            vault.join("reviews/query-writeback/deepseek-research-insights.md"),
        ]);
    }
    candidates.extend([
        vault.join("LLM Wiki Home.md"),
        vault.join("Home.md"),
        vault.join("_dashboard.md"),
        vault.join("index.md"),
        vault.join("README.md"),
    ]);
    candidates
}

fn generated_entry_note(vault: &Path) -> PathBuf {
    vault.join("LLM Wiki Home.md")
}

fn is_managed_entry_note(text: &str) -> bool {
    text.contains("<!-- llm-wiki-desktop:generated-home -->")
        || text.contains("This generated home note is a navigation aid.")
}

fn obsidian_link(vault: &Path, path: &Path) -> String {
    rel_path(vault, path).trim_end_matches(".md").to_string()
}

fn markdown_list_links(vault: &Path, paths: &[PathBuf], empty: &str, limit: usize) -> String {
    if paths.is_empty() {
        return format!("- {empty}\n");
    }
    paths
        .iter()
        .take(limit)
        .map(|path| format!("- [[{}]]\n", obsidian_link(vault, path)))
        .collect::<String>()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntryNoteIngestPlan {
    #[serde(default)]
    generated_at: String,
    #[serde(default)]
    entries: Vec<EntryNoteIngestPlanEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntryNoteIngestPlanEntry {
    source_path: String,
    #[serde(default)]
    file_name: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    action: String,
    #[serde(default)]
    current_state: String,
    #[serde(default)]
    next_action_label: String,
    #[serde(default)]
    requires_human_approval: bool,
}

impl EntryNoteIngestPlanEntry {
    fn is_review_gated(&self) -> bool {
        self.requires_human_approval
            || matches!(
                self.current_state.as_str(),
                "duplicate" | "needs_review" | "blocked_contract"
            )
    }

    fn is_runnable(&self) -> bool {
        if self.is_review_gated() {
            return false;
        }
        matches!(self.status.as_str(), "ready" | "stageable" | "cached")
            || (self.action == "parse_required"
                && is_parseable_binary(&PathBuf::from(&self.source_path)))
    }
}

#[derive(Default)]
struct EntryNotePlanState {
    generated_at: String,
    runnable: Vec<EntryNoteIngestPlanEntry>,
    review_gated: Vec<EntryNoteIngestPlanEntry>,
}

fn read_entry_note_plan_state(vault: &Path) -> EntryNotePlanState {
    let path = vault.join("_state").join("desktop-ingest-plan.json");
    let text = read_text(&path);
    if text.trim().is_empty() {
        return EntryNotePlanState::default();
    }
    let Ok(plan) = serde_json::from_str::<EntryNoteIngestPlan>(&text) else {
        return EntryNotePlanState::default();
    };
    let mut state = EntryNotePlanState {
        generated_at: plan.generated_at,
        ..EntryNotePlanState::default()
    };
    for entry in plan.entries {
        if entry.is_review_gated() {
            state.review_gated.push(entry);
        } else if entry.is_runnable() {
            state.runnable.push(entry);
        }
    }
    state
}

fn markdown_plan_entry_links(
    vault: &Path,
    entries: &[EntryNoteIngestPlanEntry],
    empty: &str,
    limit: usize,
) -> String {
    if entries.is_empty() {
        return format!("- {empty}\n");
    }
    entries
        .iter()
        .take(limit)
        .map(|entry| {
            let path = PathBuf::from(&entry.source_path);
            let label = if entry.file_name.trim().is_empty() {
                obsidian_link(vault, &path)
            } else {
                entry.file_name.clone()
            };
            let state = if entry.current_state.trim().is_empty() {
                entry.status.as_str()
            } else {
                entry.current_state.as_str()
            };
            let next_action = if entry.next_action_label.trim().is_empty() {
                entry.action.as_str()
            } else {
                entry.next_action_label.as_str()
            };
            format!(
                "- [[{}|{}]] - `{}`; {}\n",
                obsidian_link(vault, &path),
                label,
                state,
                next_action
            )
        })
        .collect::<String>()
}

fn count_status_rows(path: &Path) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for line in read_text(path)
        .lines()
        .filter(|line| !line.trim().is_empty())
    {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(status) = json_string(&value, "status") {
                *counts.entry(status).or_insert(0) += 1;
            }
        }
    }
    counts
}

fn pending_registry_rows(statuses: &HashMap<String, usize>) -> usize {
    statuses
        .iter()
        .filter(|(status, _)| {
            !matches!(
                status.as_str(),
                "published" | "archived" | "applied" | "ignored"
            )
        })
        .map(|(_, count)| *count)
        .sum()
}

fn count_writeback_statuses(vault: &Path) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    if let Ok(read_dir) = fs::read_dir(writeback_proposals_dir(vault)) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(OsStr::to_str) != Some("json") {
                continue;
            }
            if let Ok(proposal) = serde_json::from_str::<WritebackProposal>(&read_text(&path)) {
                *counts.entry(proposal.status).or_insert(0) += 1;
            }
        }
    }
    counts
}

fn generate_entry_note(vault: &Path) -> Result<PathBuf, String> {
    let path = generated_entry_note(vault);
    let reading_quality = vault
        .join("_state")
        .is_dir()
        .then(|| write_reading_quality_report(vault).ok())
        .flatten()
        .map(|report| report.summary)
        .unwrap_or_default();
    if path.is_file() && !is_managed_entry_note(&read_text(&path)) {
        return Ok(path);
    }
    let sources = list_markdown(&vault.join("sources"));
    let concepts = list_markdown(&vault.join("concepts"));
    let reviews = count_jsonl(&vault.join("_state").join("science-review-queue.jsonl"));
    let (claims, claims_needing_review, stale_claims, contradicted_claims) =
        count_claims(&vault.join("claims").join("claims.jsonl"));
    let registry_statuses = count_status_rows(&vault.join("_state").join("source-registry.jsonl"));
    let desktop_statuses =
        count_status_rows(&vault.join("_state").join("desktop-source-registry.jsonl"));
    let raw_evidence_inputs = collect_ingest_inputs(vault);
    let lint_findings = count_jsonl(&vault.join("_state").join("lint-findings.jsonl"));
    let writeback_statuses = count_writeback_statuses(vault);
    let proposed_writebacks = writeback_statuses
        .get("proposed")
        .copied()
        .unwrap_or_default();
    let published_sources = registry_statuses
        .get("published")
        .copied()
        .unwrap_or_default()
        .max(
            desktop_statuses
                .get("published")
                .copied()
                .unwrap_or_default(),
        );
    let stale_sources = registry_statuses
        .get("stale")
        .copied()
        .unwrap_or_default()
        .max(desktop_statuses.get("stale").copied().unwrap_or_default());
    let blocked_sources = desktop_statuses
        .get("blocked")
        .copied()
        .unwrap_or_default()
        .max(
            registry_statuses
                .get("blocked")
                .copied()
                .unwrap_or_default(),
        );
    let candidate_sources = registry_statuses
        .get("candidate")
        .copied()
        .unwrap_or_default()
        .max(
            desktop_statuses
                .get("candidate")
                .copied()
                .unwrap_or_default(),
        );
    let plan_state = read_entry_note_plan_state(vault);
    let pending_source_inputs = pending_registry_rows(&registry_statuses)
        .max(pending_registry_rows(&desktop_statuses))
        .max(raw_evidence_inputs.len().saturating_sub(published_sources));
    let source_links = markdown_list_links(vault, &sources, "No generated source pages yet.", 12);
    let raw_links = markdown_list_links(
        vault,
        &raw_evidence_inputs,
        "No raw evidence inputs staged.",
        12,
    );
    let runnable_plan_links = markdown_plan_entry_links(
        vault,
        &plan_state.runnable,
        "No runnable ingest inputs in the current desktop plan.",
        8,
    );
    let review_gated_plan_links = markdown_plan_entry_links(
        vault,
        &plan_state.review_gated,
        "No review-gated ingest inputs in the current desktop plan.",
        8,
    );
    let concept_links = markdown_list_links(vault, &concepts, "No concept pages yet.", 12);
    let _impact_canvas = write_impact_graph_canvas(vault)?;
    let graph_reports = graph_report_notes(vault);
    let graph_canvases = graph_canvas_files(vault);
    let graph_report_links =
        markdown_list_links(vault, &graph_reports, "No graph report generated yet.", 8);
    let graph_canvas_links = markdown_list_links(
        vault,
        &graph_canvases,
        "No Obsidian canvas generated yet.",
        4,
    );
    let rendered = format!(
        "# LLM Wiki Home\n\n<!-- llm-wiki-desktop:generated-home -->\n\n## Start Here\n\n- Read the corpus map first to understand which source pages exist and which inputs are still stale or blocked.\n- Use the current ingest plan section before running parse, staging, or runtime ingest.\n- Use the concept map for synthesis reading after checking the trust status below.\n- Open graph and traceability reports before trusting cross-source synthesis.\n- Resolve review-required claims before treating generated insights as stable knowledge.\n- Keep query writeback proposals in `reviews/query-writeback/` until a human explicitly approves them.\n\n## Corpus Map\n\n- Raw evidence inputs: {raw_evidence_count}\n- Registry candidates: {candidate_sources}\n- Pending parse or ingest: {pending_source_inputs}\n- Runnable ingest inputs: {runnable_ingest_inputs}\n- Review-gated ingest inputs: {review_gated_ingest_inputs}\n- Plan generated: {plan_generated_at}\n- Source pages: {source_count}\n- Published sources: {published_sources}\n- Stale sources: {stale_sources}\n- Blocked sources: {blocked_sources}\n\n### Raw Evidence Awaiting Ingest\n\n{raw_links}\n### Runnable Ingest Inputs\n\n{runnable_plan_links}\n### Review-Gated Ingest Inputs\n\n{review_gated_plan_links}\n### Source Pages\n\n{source_links}\n## Concept Map\n\n- Concept pages: {concept_count}\n\n{concept_links}\n## Graph & Traceability\n\n- Graph reports: {graph_report_count}\n- Obsidian canvases: {graph_canvas_count}\n\n### Graph Reports\n\n{graph_report_links}\n### Obsidian Canvases\n\n{graph_canvas_links}\n## Reading Quality\n\n- Report: [`{reading_report}`]({reading_report})\n- Findings: {reading_findings}\n- Trust issues: {reading_trust_issues}\n- Duplicate groups: {reading_duplicate_groups}\n- Orphan concepts: {reading_orphan_concepts}\n- Low-synthesis concepts: {reading_low_synthesis}\n\n## Trust Status\n\n- Claims: {claims}\n- Claims needing review: {claims_needing_review}\n- Stale claims: {stale_claims}\n- Contradicted claims: {contradicted_claims}\n- Science review queue: [`{review_path}`]({review_path}) ({reviews} items)\n- Traceability / lint findings: [`{lint_path}`]({lint_path}) ({lint_findings} items)\n- Query writeback proposals waiting for review: {proposed_writebacks}\n\n## Review Queue\n\n- Claims ledger: [`claims/claims.jsonl`](claims/claims.jsonl)\n- Science review queue: [`{review_path}`]({review_path})\n- Query writeback review area: [`reviews/query-writeback/`](reviews/query-writeback/)\n\n## Suggested Questions\n\n- Which raw evidence inputs are still waiting for parse or ingest?\n- Which runnable inputs can be parsed, staged, or published now, and which are review-gated?\n- Which sources are published, stale, or blocked, and what is the next action for each?\n- Which concepts are safe to read as stable synthesis, and which still depend on review-required claims?\n- What evidence supports the main research strategy, and which conclusions are inference or forecast?\n- Which graph report or canvas shows broken evidence paths, stale links, or disconnected concepts?\n- Which query writeback proposals are still review-only and should not be copied into concept pages?\n\n## Trust Boundary\n\nThis generated home note is a navigation aid. Source pages, claims, science review, reading quality findings, graph reports, and query writeback approval remain runtime-owned state. Do not treat proposed writeback content or review-required claims as approved knowledge.\n",
        raw_evidence_count = raw_evidence_inputs.len(),
        runnable_ingest_inputs = plan_state.runnable.len(),
        review_gated_ingest_inputs = plan_state.review_gated.len(),
        plan_generated_at = if plan_state.generated_at.trim().is_empty() {
            "not generated"
        } else {
            plan_state.generated_at.as_str()
        },
        source_count = sources.len(),
        concept_count = concepts.len(),
        graph_report_count = graph_reports.len(),
        graph_canvas_count = graph_canvases.len(),
        graph_report_links = graph_report_links,
        graph_canvas_links = graph_canvas_links,
        runnable_plan_links = runnable_plan_links,
        review_gated_plan_links = review_gated_plan_links,
        reading_report = if reading_quality.report_path.is_empty() {
            "_state/obsidian-reading-quality.json"
        } else {
            reading_quality.report_path.as_str()
        },
        reading_findings = reading_quality.findings,
        reading_trust_issues = reading_quality.trust_issues,
        reading_duplicate_groups = reading_quality.duplicate_groups,
        reading_orphan_concepts = reading_quality.orphan_concepts,
        reading_low_synthesis = reading_quality.low_synthesis_concepts,
        review_path = "_state/science-review-queue.jsonl",
        lint_path = "_state/lint-findings.jsonl",
    );
    write_text(&path, &rendered)?;
    Ok(path)
}

fn resolve_vault_entry_note_impl(
    vault: &Path,
    create_if_missing: bool,
) -> Result<VaultEntryNote, String> {
    require_existing_dir(vault, "vault")?;
    let workspace_root_selected = is_workspace_root(vault);
    let raw_source_folder_selected = is_raw_source_folder(vault);
    let warning = if workspace_root_selected {
        Some(format!(
            "This looks like the LLM-Wiki workspace root, not a generated vault. {}",
            generated_vault_selection_hint(vault)
        ))
    } else if raw_source_folder_selected {
        Some(format!(
            "This looks like a raw PDF/source folder, not a generated vault. {} Dashboard state, source registry, and the Obsidian entry note live in the generated vault.",
            generated_vault_selection_hint(vault)
        ))
    } else {
        None
    };
    let mut reason = "matched existing entry note".to_string();
    let entry = if workspace_root_selected || raw_source_folder_selected {
        reason = if workspace_root_selected {
            "workspace root selected; generated vault required".to_string()
        } else {
            "raw PDF/source folder selected; generated vault required".to_string()
        };
        None
    } else {
        let generated = if create_if_missing {
            let existed = generated_entry_note(vault).is_file();
            match generate_entry_note(vault) {
                Ok(path) => {
                    reason = if path == generated_entry_note(vault) {
                        if existed {
                            "matched generated LLM Wiki Home.md entry note".to_string()
                        } else {
                            "generated LLM Wiki Home.md entry note".to_string()
                        }
                    } else {
                        "matched existing entry note".to_string()
                    };
                    Some(path)
                }
                Err(_) => None,
            }
        } else {
            None
        };
        generated.or_else(|| {
            vault_entry_candidates(vault)
                .into_iter()
                .find(|path| path.is_file())
                .or_else(|| {
                    reason = "no entry note found".to_string();
                    None
                })
        })
    };
    let obsidian_uri = entry.as_ref().map(|path| obsidian_file_uri(vault, path));
    let fallback_path = entry.as_ref().map_or(vault, |path| path.as_path());
    Ok(VaultEntryNote {
        vault_path: to_display(vault),
        entry_relative_path: entry.as_ref().map(|path| rel_path(vault, path)),
        entry_path: entry.as_ref().map(|path| to_display(path)),
        obsidian_uri,
        fallback_path: to_display(fallback_path),
        reason,
        warning,
        is_workspace_root: workspace_root_selected,
        is_raw_source_folder: raw_source_folder_selected,
    })
}

#[tauri::command]
fn resolve_vault_entry_note(vault_path: String) -> Result<VaultEntryNote, String> {
    resolve_vault_entry_note_impl(&PathBuf::from(vault_path), true)
}

fn percent_encode_query_value(value: &str) -> String {
    let mut out = String::new();
    for &byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(char::from(byte))
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

fn obsidian_file_uri(_vault: &Path, file: &Path) -> String {
    let resolved = file.canonicalize().unwrap_or_else(|_| file.to_path_buf());
    format!(
        "obsidian://open?path={}",
        percent_encode_query_value(&to_display(&resolved))
    )
}

fn try_open_obsidian_file(vault: &Path, file: &Path) -> Result<(), String> {
    let platform = current_desktop_platform();
    let uri = obsidian_file_uri(vault, file);
    let spec = obsidian_uri_command(platform, &uri);
    let status = spec
        .command()
        .status()
        .map_err(|e| format!("failed to launch Obsidian entry note: {e}"))?;
    if status.success() {
        return Ok(());
    }
    Err(format!("Obsidian URI launch failed for {uri}"))
}

fn open_obsidian_file(vault: &Path, file: &Path) -> Result<(), String> {
    if try_open_obsidian_file(vault, file).is_ok() {
        return Ok(());
    }
    open_path(to_display(file))
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    open_path_command(current_desktop_platform(), &target)
        .command()
        .spawn()
        .map_err(|e| format!("failed to open {}: {e}", target.display()))?;
    Ok(())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    reveal_path_command(current_desktop_platform(), &target, target.is_dir())
        .command()
        .spawn()
        .map_err(|e| format!("failed to reveal {}: {e}", target.display()))?;
    Ok(())
}

fn resolve_vault_item_path(vault: &Path, path: &str) -> Result<PathBuf, String> {
    require_existing_dir(vault, "vault")?;
    let requested = PathBuf::from(path);
    let candidate = if requested.is_absolute() {
        requested
    } else {
        vault.join(requested)
    };
    let resolved = ensure_inside(&candidate, vault, "vault item must stay inside the vault")?;
    if resolved.exists() {
        Ok(resolved)
    } else {
        Err(format!("vault item does not exist: {}", resolved.display()))
    }
}

#[tauri::command]
fn open_vault_path(vault_path: String, path: String) -> Result<(), String> {
    let vault = PathBuf::from(vault_path);
    let target = resolve_vault_item_path(&vault, &path)?;
    let extension = target
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "md" | "markdown" | "canvas") {
        open_obsidian_file(&vault, &target)
    } else {
        open_path(to_display(&target))
    }
}

fn is_vault_text_preview_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "md" | "markdown" | "canvas" | "txt" | "json" | "jsonl" | "csv" | "tsv"
    )
}

fn vault_image_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

#[tauri::command]
fn read_vault_text_file(vault_path: String, path: String) -> Result<VaultTextFilePreview, String> {
    let vault = PathBuf::from(vault_path);
    let target = resolve_vault_item_path(&vault, &path)?;
    let vault_resolved = vault
        .canonicalize()
        .map_err(|e| format!("failed to resolve vault {}: {e}", vault.display()))?;
    let target_resolved = target
        .canonicalize()
        .map_err(|e| format!("failed to resolve {}: {e}", target.display()))?;
    if !target_resolved.starts_with(&vault_resolved) {
        return Err("vault text preview must stay inside the vault".to_string());
    }
    if !target.is_file() {
        return Err(format!("vault item is not a file: {}", target.display()));
    }
    if !is_vault_text_preview_extension(&target) {
        return Err(format!(
            "vault item is not a supported text preview: {}",
            target.display()
        ));
    }
    let mut file = fs::File::open(&target_resolved)
        .map_err(|e| format!("failed to open {}: {e}", target_resolved.display()))?;
    let size_bytes = file
        .metadata()
        .map_err(|e| format!("failed to inspect {}: {e}", target_resolved.display()))?
        .len();
    let mut buffer = Vec::new();
    std::io::Read::by_ref(&mut file)
        .take(MAX_VAULT_TEXT_PREVIEW_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|e| format!("failed to read {}: {e}", target_resolved.display()))?;
    let truncated = buffer.len() as u64 > MAX_VAULT_TEXT_PREVIEW_BYTES;
    if truncated {
        buffer.truncate(MAX_VAULT_TEXT_PREVIEW_BYTES as usize);
    }
    Ok(VaultTextFilePreview {
        path: rel_path(&vault_resolved, &target_resolved),
        size_bytes,
        content: String::from_utf8_lossy(&buffer).into_owned(),
        truncated,
    })
}

#[tauri::command]
fn read_vault_image_file(
    vault_path: String,
    path: String,
) -> Result<VaultImageFilePreview, String> {
    let vault = PathBuf::from(vault_path);
    let target = resolve_vault_item_path(&vault, &path)?;
    let vault_resolved = vault
        .canonicalize()
        .map_err(|e| format!("failed to resolve vault {}: {e}", vault.display()))?;
    let target_resolved = target
        .canonicalize()
        .map_err(|e| format!("failed to resolve {}: {e}", target.display()))?;
    if !target_resolved.starts_with(&vault_resolved) {
        return Err("vault image preview must stay inside the vault".to_string());
    }
    if !target.is_file() {
        return Err(format!("vault item is not a file: {}", target.display()));
    }
    let mime_type = vault_image_mime_type(&target).ok_or_else(|| {
        format!(
            "vault item is not a supported image preview: {}",
            target.display()
        )
    })?;
    let metadata = target_resolved
        .metadata()
        .map_err(|e| format!("failed to inspect {}: {e}", target_resolved.display()))?;
    let size_bytes = metadata.len();
    if size_bytes > MAX_VAULT_IMAGE_PREVIEW_BYTES {
        return Err(format!(
            "vault image is too large to preview: {} bytes exceeds {} bytes",
            size_bytes, MAX_VAULT_IMAGE_PREVIEW_BYTES
        ));
    }
    let bytes = fs::read(&target_resolved)
        .map_err(|e| format!("failed to read {}: {e}", target_resolved.display()))?;
    Ok(VaultImageFilePreview {
        path: rel_path(&vault_resolved, &target_resolved),
        size_bytes,
        mime_type: mime_type.to_string(),
        bytes,
    })
}

#[tauri::command]
fn open_obsidian_vault(vault_path: String) -> Result<VaultEntryNote, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let mut entry = resolve_vault_entry_note_impl(&vault, true)?;
    if entry.is_workspace_root || entry.is_raw_source_folder {
        return Ok(entry);
    }
    if let Some(entry_path) = &entry.entry_path {
        match try_open_obsidian_file(&vault, &PathBuf::from(entry_path)) {
            Ok(()) => return Ok(entry),
            Err(err) => {
                entry.warning = Some(format!(
                    "{err}. Use Copy URI, Copy path, Reveal in Finder, or Open folder to recover without changing the vault."
                ));
            }
        }
    } else if cfg!(target_os = "macos") {
        let status = Command::new("open")
            .arg("-a")
            .arg("Obsidian")
            .arg(&vault)
            .status()
            .map_err(|e| format!("failed to launch Obsidian: {e}"))?;
        if status.success() {
            return Ok(entry);
        }
        entry.warning = Some(
            "Obsidian did not accept the vault open request. Use reveal/open folder or copy the vault path."
                .to_string(),
        );
    }
    if let Err(err) = open_path(to_display(&vault)) {
        let previous = entry.warning.unwrap_or_default();
        entry.warning = Some(format!(
            "{} Folder fallback also failed: {err}. Copy this path manually: {}",
            previous.trim(),
            entry.fallback_path
        ));
    }
    Ok(entry)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_interface_language,
            save_last_selected_vault,
            restore_last_selected_vault,
            list_vault_suggestions,
            inspect_vault,
            create_vault,
            repair_obsidian_templates,
            generate_product_scorecard,
            agent_read_api_readiness,
            start_agent_read_api,
            stop_agent_read_api,
            import_to_inbox,
            import_sources,
            load_desktop_settings,
            save_desktop_settings,
            check_local_llm_cli,
            check_llm_api_key,
            generate_llm_answer,
            plan_ingest,
            run_ingest_lint,
            set_dashboard_action_status,
            set_ingest_job_status,
            list_claim_ledger,
            set_claim_verdict,
            list_evidence_paths,
            list_traceability_warnings,
            list_review_queue,
            set_review_item_status,
            create_followup_action,
            create_query_writeback_proposal,
            create_writeback_proposal,
            list_writeback_proposals,
            set_writeback_status,
            apply_writeback_proposal,
            create_diagnostic_bundle,
            cancel_runtime_job,
            list_runtime_jobs,
            start_ingest_pipeline_job,
            start_runtime_command_job,
            run_ingest_pipeline,
            run_runtime_command,
            open_path,
            reveal_path,
            open_vault_path,
            read_vault_text_file,
            read_vault_image_file,
            resolve_vault_entry_note,
            open_obsidian_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running llm-wiki-desktop");
}
