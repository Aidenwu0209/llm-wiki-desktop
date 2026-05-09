use chrono::Local;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultCounts {
    inbox: usize,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    name: String,
    path: String,
    kind: String,
    title: Option<String>,
    status: Option<String>,
    updated: Option<String>,
    qa_verdict: Option<String>,
    needs_review: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    path: String,
    schema_valid: bool,
    runtime_installed: bool,
    obsidian_enabled: bool,
    dashboard_available: bool,
    runtime_scripts_path: Option<String>,
    counts: VaultCounts,
    files: Vec<VaultFile>,
    errors: Vec<String>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    copied: Vec<VaultFile>,
    skipped_duplicates: Vec<String>,
    errors: Vec<String>,
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
    artifact_path: Option<String>,
    status: String,
    action: String,
    reason: String,
    parser_hint: Option<String>,
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
    artifacts: Vec<ArtifactContractSummary>,
    jobs: Vec<DesktopIngestJob>,
    actions: Vec<DashboardAction>,
    impact_edges: Vec<ImpactEdge>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestPipelineResult {
    id: String,
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
    links: Vec<DashboardLink>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopIngestJob {
    job_id: String,
    source_uuid: String,
    source_path: String,
    file_name: String,
    artifact_path: Option<String>,
    status: String,
    current_step: String,
    next_action: String,
    reason: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopRegistryEntry {
    source_uuid: String,
    source_id: Option<String>,
    source_path: String,
    source_sha256: String,
    artifact_path: Option<String>,
    artifact_sha256: Option<String>,
    parser: Option<String>,
    parser_version: Option<String>,
    status: String,
    last_error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ArtifactContractSummary {
    source_path: String,
    artifact_path: String,
    manifest_path: Option<String>,
    chunks_path: Option<String>,
    parser: Option<String>,
    parser_version: Option<String>,
    source_sha256: Option<String>,
    artifact_sha256: Option<String>,
    status: String,
    chunk_count: usize,
    anchors_lines: bool,
    anchors_pages: bool,
    limitations: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
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

fn to_display(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn require_existing_dir(path: &Path, label: &str) -> Result<(), String> {
    if path.is_dir() {
        Ok(())
    } else {
        Err(format!("{label} is not a directory: {}", path.display()))
    }
}

fn ensure_inside(path: &Path, root: &Path, message: &str) -> Result<PathBuf, String> {
    let resolved = path
        .canonicalize()
        .or_else(|_| Ok::<PathBuf, std::io::Error>(path.to_path_buf()))
        .map_err(|e| format!("failed to resolve {}: {e}", path.display()))?;
    let root_resolved = root
        .canonicalize()
        .map_err(|e| format!("failed to resolve {}: {e}", root.display()))?;
    if resolved.starts_with(&root_resolved) {
        Ok(resolved)
    } else {
        Err(message.to_string())
    }
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
    path.strip_prefix(vault)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
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
        _ => "application/octet-stream",
    }
    .to_string()
}

fn list_markdown(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(OsStr::to_str) == Some("md") {
                files.push(path);
            }
        }
    }
    files.sort();
    files
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

fn parse_frontmatter(path: &Path) -> HashMap<String, String> {
    let text = read_text(path);
    let mut fields = HashMap::new();
    if !text.starts_with("---\n") {
        return fields;
    }
    let Some(rest) = text.strip_prefix("---\n") else {
        return fields;
    };
    let Some((block, _body)) = rest.split_once("---\n") else {
        return fields;
    };
    for line in block.lines() {
        if let Some((key, value)) = line.split_once(':') {
            fields.insert(
                key.trim().to_string(),
                value.trim().trim_matches('"').to_string(),
            );
        }
    }
    fields
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

fn file_item(vault: &Path, path: &Path, kind: &str) -> VaultFile {
    let fields = parse_frontmatter(path);
    let needs_review = if kind == "source" || kind == "draft" {
        0
    } else {
        0
    };
    VaultFile {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path: to_display(path),
        kind: kind.to_string(),
        title: page_title(path),
        status: fields.get("status").cloned(),
        updated: fields.get("updated").cloned(),
        qa_verdict: source_qa(vault, path),
        needs_review,
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
    qa_verdict(&vault.join("qa-reports").join(format!("{stem}.md")))
}

fn runtime_scripts_path(vault: &Path) -> Option<PathBuf> {
    let path = vault.join(".open-llm-wiki").join("scripts");
    if path.join("wiki_lint.py").is_file() {
        Some(path)
    } else {
        None
    }
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
    let mut files = Vec::new();
    for path in list_markdown(&vault.join("sources")) {
        files.push(file_item(&vault, &path, "source"));
    }
    for path in list_markdown(&vault.join("drafts")) {
        files.push(file_item(&vault, &path, "draft"));
    }
    for path in list_markdown(&vault.join("concepts")) {
        files.push(file_item(&vault, &path, "concept"));
    }
    for path in list_markdown(&vault.join("qa-reports")) {
        files.push(file_item(&vault, &path, "report"));
    }
    if let Ok(read_dir) = fs::read_dir(vault.join("raw").join("inbox")) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_file() {
                files.push(VaultFile {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: to_display(&path),
                    kind: "inbox".to_string(),
                    title: None,
                    status: None,
                    updated: None,
                    qa_verdict: None,
                    needs_review: 0,
                });
            }
        }
    }

    let runtime = runtime_scripts_path(&vault);
    Ok(VaultStatus {
        path: to_display(&vault),
        schema_valid: errors.is_empty(),
        runtime_installed: runtime.is_some(),
        obsidian_enabled: vault.join(".obsidian").is_dir(),
        dashboard_available: vault.join("_dashboard.md").is_file(),
        runtime_scripts_path: runtime.map(|path| to_display(&path)),
        counts: VaultCounts {
            inbox: files.iter().filter(|item| item.kind == "inbox").count(),
            sources: list_markdown(&vault.join("sources")).len(),
            drafts: list_markdown(&vault.join("drafts")).len(),
            concepts: list_markdown(&vault.join("concepts")).len(),
            reports: list_markdown(&vault.join("qa-reports")).len(),
            claims,
            claims_needing_review,
            science_review_queue: count_jsonl(
                &vault.join("_state").join("science-review-queue.jsonl"),
            ),
            growth_queue: count_jsonl(&vault.join("_state").join("growth-queue.jsonl")),
            stale_claims,
            contradicted_claims,
            ingest_jobs: count_jsonl(&vault.join("_state").join("desktop-ingest-jobs.jsonl")),
            actions: count_jsonl(&vault.join("_state").join("desktop-actions.jsonl")),
        },
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
    create_minimal_vault(&vault)?;
    inspect_vault(to_display(&vault))
}

fn create_minimal_vault(vault: &Path) -> Result<(), String> {
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
    write_text(
        vault.join("templates/source.md").as_path(),
        "---\ntype: source\nsource_id: \"\"\nsource_uuid: \"\"\nstatus: draft\nsource_sha256: \"\"\nartifact_sha256: \"\"\nparser: \"\"\nparser_version: \"\"\nqa_verdict: unreviewed\nclaims_total: 0\nclaims_supported: 0\nclaims_needing_review: 0\nconcepts: []\n---\n\n# Source Title\n\n## 一句话结论\n\n## 为什么重要\n\n## 关键贡献\n\n## 关键 Claims\n\n| Claim | Verdict | Evidence |\n|---|---|---|\n\n## 关键指标 / 实验结果\n\n## 方法与数据\n\n## 局限与争议\n\n## 相关 Concepts\n\n## 证据与原文锚点\n\n## QA / Review 状态\n",
    )?;
    write_text(
        vault.join("templates/concept.md").as_path(),
        "---\ntype: concept\nconcept_id: \"\"\nstatus: current\nsupporting_claims: 0\ncontradicted_claims: 0\nstale_claims: 0\nrelated_concepts: []\n---\n\n# Concept Name\n\n## 定义\n\n## 核心直觉\n\n## 为什么重要\n\n## 关键机制\n\n## 支持证据\n\n## 反例 / 争议 / 限制\n\n## 相关方法与概念\n\n## 代表 Sources\n\n## 待确认问题\n",
    )?;
    write_text(vault.join("claims/claims.jsonl").as_path(), "")?;
    write_text(vault.join("_state/growth-queue.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/id-counter.md").as_path(),
        "# ID Counter\nnext: 1\n",
    )?;
    write_text(vault.join("_state/source-registry.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/desktop-source-registry.jsonl").as_path(),
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
    Ok(())
}

#[tauri::command]
fn import_to_inbox(vault_path: String, paths: Vec<String>) -> Result<ImportResult, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let inbox = vault.join("raw").join("inbox");
    fs::create_dir_all(&inbox).map_err(|e| format!("failed to create inbox: {e}"))?;
    let mut known_hashes = HashMap::new();
    collect_hashes(&inbox, &mut known_hashes);
    let mut copied = Vec::new();
    let mut skipped_duplicates = Vec::new();
    let mut errors = Vec::new();

    for path in paths {
        let source = PathBuf::from(&path);
        if !source.is_file() {
            errors.push(format!("skipped non-file input: {path}"));
            continue;
        }
        let hash = match sha256_file(&source) {
            Ok(value) => value,
            Err(error) => {
                errors.push(error);
                continue;
            }
        };
        if let Some(existing) = known_hashes.get(&hash) {
            skipped_duplicates.push(existing.clone());
            continue;
        }
        let Some(file_name) = source.file_name() else {
            errors.push(format!("missing file name: {path}"));
            continue;
        };
        let dest = unique_dest(&inbox, file_name);
        if let Err(error) =
            fs::copy(&source, &dest).map_err(|e| format!("failed to copy {path}: {e}"))
        {
            errors.push(error);
            continue;
        }
        known_hashes.insert(hash, to_display(&dest));
        copied.push(VaultFile {
            name: dest
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: to_display(&dest),
            kind: "inbox".to_string(),
            title: None,
            status: None,
            updated: None,
            qa_verdict: None,
            needs_review: 0,
        });
    }

    Ok(ImportResult {
        copied,
        skipped_duplicates,
        errors,
    })
}

fn collect_hashes(root: &Path, hashes: &mut HashMap<String, String>) {
    if let Ok(read_dir) = fs::read_dir(root) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_file() {
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

fn collect_inbox_files(dir: &Path, out: &mut Vec<PathBuf>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path
                    .file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.starts_with('.'))
                {
                    continue;
                }
                collect_inbox_files(&path, out);
            } else if path.is_file() {
                out.push(path);
            }
        }
    }
}

fn collect_ingest_inputs(vault: &Path) -> Vec<PathBuf> {
    let raw = vault.join("raw");
    let mut files = Vec::new();
    if let Ok(read_dir) = fs::read_dir(&raw) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(OsStr::to_str).unwrap_or_default();
            if name.starts_with('.') || name.ends_with("_markdown") {
                continue;
            }
            if path.is_file() {
                files.push(path);
            } else if name == "inbox" && path.is_dir() {
                collect_inbox_files(&path, &mut files);
            }
        }
    }
    files.sort();
    files
}

fn artifact_for_source(vault: &Path, source: &Path, hash: &str) -> PathBuf {
    let raw = vault.join("raw");
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

fn chunk_rows(vault: &Path, source_sha256: &str, artifact: &Path, content: &str) -> Vec<ChunkRow> {
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
            source_id: None,
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
    content: &str,
) -> Result<(), String> {
    write_text(artifact, content)?;
    let artifact_sha256 = sha256_file(artifact)?;
    let parent = artifact
        .parent()
        .ok_or_else(|| "artifact has no parent directory".to_string())?;
    let chunks = chunk_rows(vault, source_sha256, artifact, content);
    write_jsonl(&parent.join("chunks.jsonl"), &chunks)?;
    let manifest = serde_json::json!({
        "source_uuid": source_uuid(source_sha256),
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
        "pdf_to_markdown.py \"{}\" --output \"{}\"",
        source.display(),
        artifact
            .parent()
            .map(to_display)
            .unwrap_or_else(|| to_display(artifact))
    )
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
    let artifact_path = Some(to_display(&artifact));

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
    } else {
        (
            "blocked".to_string(),
            "unsupported_extension".to_string(),
            "desktop staging currently supports txt, md, markdown, and existing parsed artifacts"
                .to_string(),
            None,
        )
    };

    Ok(IngestPlanEntry {
        source_path: to_display(source),
        file_name,
        sha256: hash,
        artifact_path,
        status,
        action,
        reason,
        parser_hint,
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
) -> Option<ArtifactContractSummary> {
    let artifact_path = entry.artifact_path.as_ref()?;
    let artifact = PathBuf::from(artifact_path);
    if !artifact.is_file() {
        return None;
    }
    let parent = artifact.parent()?;
    let manifest_path = parent.join("manifest.json");
    let chunks_path = parent.join("chunks.jsonl");
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
        artifact_path: rel_path(vault, &artifact),
        manifest_path: manifest_path
            .is_file()
            .then(|| rel_path(vault, &manifest_path)),
        chunks_path: chunks_path.is_file().then(|| rel_path(vault, &chunks_path)),
        parser: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser")),
        parser_version: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser_version")),
        source_sha256: manifest_source_sha,
        artifact_sha256,
        status,
        chunk_count: count_jsonl(&chunks_path),
        anchors_lines: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "lines")),
        anchors_pages: manifest
            .as_ref()
            .is_some_and(|value| manifest_anchor(value, "pages")),
        limitations: manifest
            .as_ref()
            .map(manifest_limitations)
            .unwrap_or_else(|| {
                vec!["manifest.json is missing; artifact is treated as legacy".to_string()]
            }),
    })
}

fn registry_entry_for_plan_entry(vault: &Path, entry: &IngestPlanEntry) -> DesktopRegistryEntry {
    let artifact = entry.artifact_path.as_ref().map(PathBuf::from);
    let manifest = artifact.as_ref().and_then(|path| artifact_manifest(path));
    let artifact_sha256 = artifact
        .as_ref()
        .filter(|path| path.is_file())
        .and_then(|path| sha256_file(path).ok());
    DesktopRegistryEntry {
        source_uuid: source_uuid(&entry.sha256),
        source_id: None,
        source_path: rel_path(vault, &PathBuf::from(&entry.source_path)),
        source_sha256: entry.sha256.clone(),
        artifact_path: artifact.as_ref().map(|path| rel_path(vault, path)),
        artifact_sha256,
        parser: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser")),
        parser_version: manifest
            .as_ref()
            .and_then(|value| json_string(value, "parser_version")),
        status: entry.status.clone(),
        last_error: (entry.status == "blocked").then(|| entry.reason.clone()),
    }
}

fn job_for_plan_entry(vault: &Path, entry: &IngestPlanEntry) -> DesktopIngestJob {
    let status = match entry.status.as_str() {
        "published" => "succeeded",
        "blocked" => "blocked",
        _ => "queued",
    };
    let current_step = match entry.action.as_str() {
        "stage_text_artifact" | "restage_text_artifact" => "stage_artifact",
        "parse_required" => "parse_artifact",
        "run_ingest_corpus" | "skip_staging" => "runtime_ingest",
        "skip_runtime" => "published",
        _ => "inspect",
    };
    DesktopIngestJob {
        job_id: format!("job-{}", short_hash(&entry.sha256)),
        source_uuid: source_uuid(&entry.sha256),
        source_path: rel_path(vault, &PathBuf::from(&entry.source_path)),
        file_name: entry.file_name.clone(),
        artifact_path: entry
            .artifact_path
            .as_ref()
            .map(|path| rel_path(vault, &PathBuf::from(path))),
        status: status.to_string(),
        current_step: current_step.to_string(),
        next_action: entry.action.clone(),
        reason: entry.reason.clone(),
    }
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

fn build_ingest_contracts(
    vault: &Path,
    entries: &[IngestPlanEntry],
) -> (
    Vec<DesktopRegistryEntry>,
    Vec<ArtifactContractSummary>,
    Vec<DesktopIngestJob>,
    Vec<DashboardAction>,
    Vec<ImpactEdge>,
) {
    let registry = entries
        .iter()
        .map(|entry| registry_entry_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    let artifacts = entries
        .iter()
        .filter_map(|entry| artifact_summary_for_entry(vault, entry))
        .collect::<Vec<_>>();
    let jobs = entries
        .iter()
        .map(|entry| job_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    let mut actions = entries
        .iter()
        .filter_map(|entry| action_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    actions.extend(vault_level_actions(vault));
    let impact_edges = entries
        .iter()
        .flat_map(|entry| impact_edges_for_plan_entry(vault, entry))
        .collect::<Vec<_>>();
    (registry, artifacts, jobs, actions, impact_edges)
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
            links: vec![DashboardLink {
                label: "science review queue".to_string(),
                path: "_state/science-review-queue.jsonl".to_string(),
            }],
        });
    }
    actions
}

fn write_ingest_plan(vault: &Path, entries: Vec<IngestPlanEntry>) -> Result<IngestPlan, String> {
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
    let (registry, artifacts, jobs, actions, impact_edges) =
        build_ingest_contracts(vault, &entries);
    let state = vault.join("_state");
    write_jsonl(&state.join("desktop-source-registry.jsonl"), &registry)?;
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
        artifacts,
        jobs,
        actions,
        impact_edges,
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
    if let Ok(read_dir) = fs::read_dir(&raw) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if !path.is_dir()
                || !path
                    .file_name()
                    .and_then(OsStr::to_str)
                    .is_some_and(|name| name.ends_with("_markdown"))
            {
                continue;
            }
            let combined = path.join("combined.md");
            if combined.is_file() && !artifact_paths.contains(&combined) {
                let hash = sha256_file(&combined)?;
                let published = published_keys.contains(&(hash.clone(), hash.clone()));
                entries.push(IngestPlanEntry {
                    source_path: to_display(&combined),
                    file_name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    sha256: hash,
                    artifact_path: Some(to_display(&combined)),
                    status: if published { "published" } else { "ready" }.to_string(),
                    action: if published {
                        "skip_runtime"
                    } else {
                        "run_ingest_corpus"
                    }
                    .to_string(),
                    reason: if published {
                        "standalone parsed artifact already completed a desktop ingest pipeline"
                    } else {
                        "parsed artifact exists without a matching raw source in the desktop scan"
                    }
                    .to_string(),
                    parser_hint: None,
                });
            }
        }
    }

    entries.sort_by(|a, b| a.source_path.cmp(&b.source_path));
    write_ingest_plan(&vault, entries)
}

fn stage_text_artifacts(vault: &Path) -> Result<Vec<String>, String> {
    let cached_hashes = load_cached_ingest_hashes(vault);
    let published_keys = load_published_ingest_keys(vault);
    let mut staged = Vec::new();
    for source in collect_ingest_inputs(vault) {
        let entry = plan_entry_for_source(vault, &source, &cached_hashes, &published_keys)?;
        if entry.status != "stageable" {
            continue;
        }
        let artifact = entry
            .artifact_path
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| "missing artifact path for stageable source".to_string())?;
        let content = fs::read_to_string(&source)
            .map_err(|e| format!("failed to read {}: {e}", source.display()))?;
        write_text_artifact_contract(vault, &source, &artifact, &entry.sha256, &content)?;
        append_cache_row(vault, &source, &entry.sha256, &artifact)?;
        staged.push(to_display(&artifact));
    }
    Ok(staged)
}

#[tauri::command]
fn run_runtime_command(
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    kind: String,
    obsidian_profile: String,
    skip_downloads: bool,
) -> Result<TaskLog, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    run_runtime_task(
        &vault,
        runtime_path.as_deref(),
        &python_path,
        &kind,
        &obsidian_profile,
        skip_downloads,
    )
}

fn run_runtime_task(
    vault: &Path,
    runtime_path: Option<&str>,
    python_path: &str,
    kind: &str,
    obsidian_profile: &str,
    skip_downloads: bool,
) -> Result<TaskLog, String> {
    let (script, mut args) = command_spec(kind, vault, obsidian_profile, skip_downloads)?;
    let scripts_dir = resolve_scripts_dir(vault, runtime_path)?;
    let script_path = scripts_dir.join(script);
    if !script_path.is_file() {
        return Err(format!(
            "runtime script not found: {}",
            script_path.display()
        ));
    }
    let started_at = Local::now().to_rfc3339();
    let mut command = vec![python_path.to_string(), to_display(&script_path)];
    command.append(&mut args);
    let output = Command::new(python_path)
        .arg(&script_path)
        .args(command.iter().skip(2))
        .output()
        .map_err(|e| format!("failed to run {kind}: {e}"))?;
    let ended_at = Local::now().to_rfc3339();
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let id = format!("{}-{}", Local::now().format("%Y%m%d-%H%M%S"), kind);
    let log_path = vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{id}.log"));
    let rendered = format!(
        "# Runtime Task Log\n\nkind: {kind}\nstarted_at: {started_at}\nended_at: {ended_at}\nexit_code: {exit_code}\ncommand: {}\n\n## stdout\n\n{}\n\n## stderr\n\n{}\n",
        command.join(" "),
        stdout,
        stderr
    );
    write_text(&log_path, &rendered)?;
    let _ = ensure_inside(&log_path, &vault, "task log must stay inside the vault")?;
    Ok(TaskLog {
        id,
        kind: kind.to_string(),
        command,
        started_at,
        ended_at,
        exit_code,
        stdout,
        stderr,
        log_path: to_display(&log_path),
    })
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
    let mut rows = String::new();
    let mut published_sources = Vec::new();

    for entry in &plan.entries {
        if entry.status != "ready" && entry.status != "cached" {
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
    vault_path: String,
    runtime_path: Option<String>,
    python_path: String,
    obsidian_profile: String,
    skip_downloads: bool,
) -> Result<IngestPipelineResult, String> {
    let vault = PathBuf::from(vault_path);
    require_existing_dir(&vault, "vault")?;
    let _lock = acquire_ingest_lock(&vault)?;
    let initial_plan = plan_ingest(to_display(&vault))?;
    let runnable =
        initial_plan.summary.ready + initial_plan.summary.stageable + initial_plan.summary.cached;
    if runnable == 0 {
        if initial_plan.summary.published > 0 && initial_plan.summary.blocked == 0 {
            return Err(
                "all ingest inputs are already published for their current source/artifact hash"
                    .to_string(),
            );
        }
        return Err("no unpublished ingest inputs are ready; parse blocked sources first or import Markdown/txt".to_string());
    }
    let staged_artifacts = stage_text_artifacts(&vault)?;
    let final_plan = plan_ingest(to_display(&vault))?;

    let sequence = [
        "discover",
        "ingest_corpus",
        "claims",
        "normalize",
        "semantic_qa",
        "contradictions",
        "science_review",
        "lint",
    ];
    let id = format!("{}-ingest-pipeline", Local::now().format("%Y%m%d-%H%M%S"));
    let log_path = vault
        .join("log-archive")
        .join("desktop")
        .join(format!("{id}.log"));
    let mut logs = Vec::new();
    let mut exit_code = 0;
    for kind in sequence {
        let log = run_runtime_task(
            &vault,
            runtime_path.as_deref(),
            &python_path,
            kind,
            &obsidian_profile,
            skip_downloads,
        )?;
        if log.exit_code != 0 {
            exit_code = log.exit_code;
            logs.push(log);
            break;
        }
        logs.push(log);
    }

    let published_sources = if exit_code == 0 {
        let sources = record_published_ingest(&vault, &final_plan, &id, &log_path)?;
        let _ = plan_ingest(to_display(&vault))?;
        sources
    } else {
        Vec::new()
    };
    let mut rendered = format!(
        "# Desktop Ingest Pipeline\n\nstarted_at: {}\nexit_code: {}\nstaged_artifacts: {}\npublished_sources: {}\n\n",
        Local::now().to_rfc3339(),
        exit_code,
        staged_artifacts.len(),
        published_sources.len()
    );
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
        staged_artifacts,
        published_sources,
        logs,
        exit_code,
        log_path: to_display(&log_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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
        assert!(entry.parser_hint.is_some());

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

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let mut command = if cfg!(target_os = "macos") {
        let mut cmd = Command::new("open");
        cmd.arg(&target);
        cmd
    } else if cfg!(target_os = "windows") {
        let mut cmd = Command::new("explorer");
        cmd.arg(&target);
        cmd
    } else {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&target);
        cmd
    };
    command
        .spawn()
        .map_err(|e| format!("failed to open {}: {e}", target.display()))?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            inspect_vault,
            create_vault,
            import_to_inbox,
            plan_ingest,
            run_ingest_pipeline,
            run_runtime_command,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running llm-wiki-desktop");
}
