use chrono::Local;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs;
use std::io::Read;
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

#[derive(Debug, Deserialize)]
struct ClaimRow {
    #[serde(default)]
    needs_review: bool,
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

fn count_claims(path: &Path) -> (usize, usize) {
    let mut total = 0;
    let mut review = 0;
    for line in read_text(path)
        .lines()
        .filter(|line| !line.trim().is_empty())
    {
        total += 1;
        if let Ok(row) = serde_json::from_str::<ClaimRow>(line) {
            if row.needs_review {
                review += 1;
            }
        }
    }
    (total, review)
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

    let (claims, claims_needing_review) = count_claims(&vault.join("claims").join("claims.jsonl"));
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
    write_text(vault.join("claims/claims.jsonl").as_path(), "")?;
    write_text(vault.join("_state/growth-queue.jsonl").as_path(), "")?;
    write_text(
        vault.join("_state/id-counter.md").as_path(),
        "# ID Counter\nnext: 1\n",
    )?;
    write_text(vault.join("_state/source-registry.jsonl").as_path(), "")?;
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
    let (script, mut args) = command_spec(&kind, &vault, &obsidian_profile, skip_downloads)?;
    let scripts_dir = resolve_scripts_dir(&vault, runtime_path.as_deref())?;
    let script_path = scripts_dir.join(script);
    if !script_path.is_file() {
        return Err(format!(
            "runtime script not found: {}",
            script_path.display()
        ));
    }
    let started_at = Local::now().to_rfc3339();
    let mut command = vec![python_path.clone(), to_display(&script_path)];
    command.append(&mut args);
    let output = Command::new(&python_path)
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
        kind,
        command,
        started_at,
        ended_at,
        exit_code,
        stdout,
        stderr,
        log_path: to_display(&log_path),
    })
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
            run_runtime_command,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running llm-wiki-desktop");
}
