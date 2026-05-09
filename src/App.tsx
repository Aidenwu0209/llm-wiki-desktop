import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  FileInput,
  FolderOpen,
  ListChecks,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SquareStack,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  createVault,
  importToInbox,
  inspectVault,
  listClaimLedger,
  openPath,
  planIngest,
  repairObsidianTemplates,
  runIngestLint,
  runIngestPipeline,
  runRuntimeCommand,
  setClaimVerdict,
  setDashboardActionStatus,
  setIngestJobStatus,
} from "./tauri";
import type { ClaimLedgerItem, IngestPlan, RuntimeSettings, TaskLog, VaultFile, VaultStatus } from "./types";

const runtimeActions = [
  { id: "lint", label: "运行 lint", icon: ListChecks },
  { id: "obsidian_setup", label: "Obsidian setup", icon: SquareStack },
  { id: "status_dashboard", label: "刷新 dashboard", icon: RefreshCw },
  { id: "discover", label: "Source discovery", icon: Search },
  { id: "claims", label: "Claim extraction", icon: ClipboardList },
  { id: "semantic_qa", label: "Semantic QA", icon: ShieldCheck },
  { id: "science_review", label: "Science review", icon: AlertTriangle },
  { id: "concept_revision_preview", label: "Concept preview", icon: Database },
];

const pipeline = [
  "Import",
  "Parse PDF / Markdown",
  "Draft source page",
  "Independent QA",
  "Publish stable source",
  "Extract claims",
  "Normalize metrics",
  "Semantic QA",
  "Contradiction scan",
  "Science review queue",
  "Concept revision",
  "Lint",
];

const initialSettings: RuntimeSettings = {
  runtimePath: "",
  pythonPath: "python3",
  obsidianProfile: "minimal",
  skipDownloads: true,
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function statusTone(status: VaultStatus | null) {
  if (!status) return "idle";
  if (!status.schemaValid) return "danger";
  if (!status.runtimeInstalled) return "warn";
  return "ok";
}

function pipelineState(index: number, status: VaultStatus | null, plan: IngestPlan | null) {
  const inbox = status?.counts.inbox ?? 0;
  const ready = plan?.summary.ready ?? 0;
  const stageable = plan?.summary.stageable ?? 0;
  const blocked = plan?.summary.blocked ?? 0;
  const cached = plan?.summary.cached ?? 0;
  const published = plan?.summary.published ?? 0;
  const runnable = ready + stageable + cached;
  if (index === 0) return inbox > 0 ? "ready" : "waiting";
  if (index === 1) {
    if (blocked > 0 && runnable === 0) return "parse blocked";
    if (runnable > 0) return "ready";
    if (published > 0) return "published";
    return "waiting";
  }
  if (index >= 2 && index <= 4) return runnable > 0 ? "queued" : "runtime gated";
  if (index >= 5 && index <= 10) return (status?.counts.sources ?? 0) > 0 ? "available" : "after publish";
  return status?.schemaValid ? "available" : "blocked";
}

function App() {
  const [vaultPath, setVaultPath] = useState("");
  const [newVaultPath, setNewVaultPath] = useState("");
  const [enableObsidian, setEnableObsidian] = useState(true);
  const [settings, setSettings] = useState<RuntimeSettings>(initialSettings);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [ingestPlan, setIngestPlan] = useState<IngestPlan | null>(null);
  const [claims, setClaims] = useState<ClaimLedgerItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [actionFilter, setActionFilter] = useState("open");
  const [claimFilter, setClaimFilter] = useState("needs_review");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, VaultFile[]> = { source: [], draft: [], concept: [], report: [], inbox: [] };
    for (const file of status?.files ?? []) groups[file.kind]?.push(file);
    return groups;
  }, [status]);

  async function chooseVault() {
    const picked = await open({ directory: true, multiple: false, title: "选择 open-llm-wiki vault" });
    if (typeof picked !== "string") return;
    setVaultPath(picked);
    await refresh(picked);
  }

  async function chooseRuntime() {
    const picked = await open({ directory: true, multiple: false, title: "选择 open-llm-wiki runtime 仓库或已安装 vault" });
    if (typeof picked !== "string") return;
    setSettings((current) => ({ ...current, runtimePath: picked }));
  }

  async function refresh(path = vaultPath) {
    if (!path) return;
    setBusy("inspect");
    setError(null);
    try {
      const [nextPlan, nextClaims] = await Promise.all([planIngest(path), listClaimLedger(path)]);
      const nextStatus = await inspectVault(path);
      setStatus(nextStatus);
      setIngestPlan(nextPlan);
      setClaims(nextClaims);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateVault() {
    if (!newVaultPath.trim()) {
      setError("请先填写要创建的 vault 绝对路径。");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const next = await createVault(newVaultPath.trim(), settings, enableObsidian);
      setVaultPath(next.path);
      setStatus(next);
      setClaims([]);
      setIngestPlan(null);
      setNewVaultPath("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!vaultPath) return;
    const picked = await open({
      directory: false,
      multiple: true,
      title: "导入 PDF / Markdown / txt 到 raw/inbox",
      filters: [{ name: "Documents", extensions: ["pdf", "md", "markdown", "txt"] }],
    });
    const paths = Array.isArray(picked) ? picked.filter((item): item is string => typeof item === "string") : [];
    if (!paths.length) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importToInbox(vaultPath, paths);
      if (result.errors.length) setError(result.errors.join("\n"));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRuntime(kind: string) {
    if (!vaultPath) return;
    setBusy(kind);
    setError(null);
    try {
      const log = await runRuntimeCommand(vaultPath, settings, kind);
      setLogs((current) => [log, ...current].slice(0, 12));
      await refresh();
      if (log.exitCode !== 0) setError(`${kind} 失败，exit code ${log.exitCode}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePlanIngest() {
    if (!vaultPath) return;
    setBusy("plan_ingest");
    setError(null);
    try {
      const nextPlan = await planIngest(vaultPath);
      const nextClaims = await listClaimLedger(vaultPath);
      setIngestPlan(nextPlan);
      setClaims(nextClaims);
      setStatus(await inspectVault(vaultPath));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRepairTemplates() {
    if (!vaultPath) return;
    setBusy("repair_templates");
    setError(null);
    try {
      setStatus(await repairObsidianTemplates(vaultPath));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleIngestLint() {
    if (!vaultPath) return;
    setBusy("ingest_lint");
    setError(null);
    try {
      await runIngestLint(vaultPath);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleActionStatus(actionId: string, status: "open" | "resolved" | "ignored") {
    if (!vaultPath) return;
    setBusy(`action:${actionId}`);
    setError(null);
    try {
      setIngestPlan(await setDashboardActionStatus(vaultPath, actionId, status));
      setStatus(await inspectVault(vaultPath));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleJobStatus(
    jobId: string,
    status: "queued" | "running" | "blocked" | "cancelled" | "succeeded" | "failed",
  ) {
    if (!vaultPath) return;
    setBusy(`job:${jobId}`);
    setError(null);
    try {
      setIngestPlan(await setIngestJobStatus(vaultPath, jobId, status));
      setStatus(await inspectVault(vaultPath));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleClaimVerdict(
    claimId: string,
    verdict: "supported" | "needs_review" | "stale" | "contradicted" | "ignored" | "unknown",
  ) {
    if (!vaultPath) return;
    setBusy(`claim:${claimId}`);
    setError(null);
    try {
      setClaims(await setClaimVerdict(vaultPath, claimId, verdict));
      setIngestPlan(await planIngest(vaultPath));
      setStatus(await inspectVault(vaultPath));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleIngestPipeline() {
    if (!vaultPath) return;
    setBusy("ingest_pipeline");
    setError(null);
    try {
      const result = await runIngestPipeline(vaultPath, settings);
      setLogs((current) => [...result.logs, ...current].slice(0, 12));
      await refresh();
      if (result.exitCode !== 0) setError(`ingest pipeline 失败，exit code ${result.exitCode}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const tone = statusTone(status);
  const planned = ingestPlan?.summary;
  const runnableIngest = (planned?.ready ?? 0) + (planned?.stageable ?? 0) + (planned?.cached ?? 0);
  const actions = ingestPlan?.actions ?? [];
  const jobs = ingestPlan?.jobs ?? [];
  const artifacts = ingestPlan?.artifacts ?? [];
  const registry = ingestPlan?.registry ?? [];
  const impactEdges = ingestPlan?.impactEdges ?? [];
  const lintFindings = ingestPlan?.lintFindings ?? [];
  const visibleActions = actions.filter((action) => actionFilter === "all" || action.status === actionFilter);
  const visibleClaims = claims.filter((claim) => {
    if (claimFilter === "all") return true;
    if (claimFilter === "needs_review") return claim.needsReview || claim.status === "needs_review" || claim.verdict === "needs_review";
    return claim.status === claimFilter || claim.verdict === claimFilter;
  });
  const vaultFilePath = (path?: string | null) => {
    if (!path) return vaultPath;
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
    return `${vaultPath}/${path}`;
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LW</div>
          <div>
            <h1>LLM Wiki Desktop</h1>
            <p>open-llm-wiki runtime shell</p>
          </div>
        </div>

        <section className="panel">
          <h2>Vault 管理</h2>
          <div className="path-field" title={vaultPath || "No vault selected"}>{vaultPath || "No vault selected"}</div>
          <div className="button-row">
            <button onClick={chooseVault}><FolderOpen size={16} />打开</button>
            <button onClick={() => refresh()} disabled={!vaultPath || busy === "inspect"}><RefreshCw size={16} />刷新</button>
          </div>
          <input
            value={newVaultPath}
            onChange={(event) => setNewVaultPath(event.target.value)}
            placeholder="/absolute/path/to/new-vault"
          />
          <label className="check-row">
            <input type="checkbox" checked={enableObsidian} onChange={(event) => setEnableObsidian(event.target.checked)} />
            创建时启用 Obsidian profile
          </label>
          <button className="wide" onClick={handleCreateVault} disabled={busy === "create"}><Archive size={16} />创建 vault</button>
        </section>

        <section className="panel">
          <h2>Runtime 设置</h2>
          <input
            value={settings.pythonPath}
            onChange={(event) => setSettings((current) => ({ ...current, pythonPath: event.target.value }))}
            placeholder="python3"
          />
          <div className="path-field" title={settings.runtimePath || "优先使用 vault 内 .open-llm-wiki/scripts"}>{settings.runtimePath || "优先使用 vault 内 runtime"}</div>
          <button className="wide" onClick={chooseRuntime}><Settings size={16} />选择 runtime 路径</button>
          <select
            value={settings.obsidianProfile}
            onChange={(event) => setSettings((current) => ({ ...current, obsidianProfile: event.target.value as RuntimeSettings["obsidianProfile"] }))}
          >
            <option value="minimal">minimal</option>
            <option value="research">research</option>
            <option value="full">full</option>
          </select>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.skipDownloads}
              onChange={(event) => setSettings((current) => ({ ...current, skipDownloads: event.target.checked }))}
            />
            Obsidian setup 跳过插件下载
          </label>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>任务流控制台</h2>
            <p>所有写入通过 open-llm-wiki runtime 或受限 inbox 导入执行。</p>
          </div>
          <div className={classNames("health", tone)}>
            {tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {status ? (status.schemaValid ? "Schema valid" : "Schema invalid") : "No vault"}
          </div>
        </header>

        {error && <pre className="error-box">{error}</pre>}

        <section className="metrics">
          <Metric label="Raw inbox" value={status?.counts.inbox ?? 0} />
          <Metric label="Sources" value={status?.counts.sources ?? 0} />
          <Metric label="Concepts" value={status?.counts.concepts ?? 0} />
          <Metric label="Reports" value={status?.counts.reports ?? 0} />
          <Metric label="Review claims" value={status?.counts.claimsNeedingReview ?? 0} emphasis />
          <Metric label="Stale claims" value={status?.counts.staleClaims ?? 0} emphasis={(status?.counts.staleClaims ?? 0) > 0} />
          <Metric label="Contradictions" value={status?.counts.contradictedClaims ?? 0} emphasis={(status?.counts.contradictedClaims ?? 0) > 0} />
          <Metric label="Ingest ready" value={planned?.ready ?? 0} />
          <Metric label="Stageable" value={planned?.stageable ?? 0} />
          <Metric label="Published" value={planned?.published ?? 0} />
          <Metric label="Blocked" value={planned?.blocked ?? 0} emphasis={(planned?.blocked ?? 0) > 0} />
          <Metric label="Lint P1/P0" value={lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length} emphasis={lintFindings.some((finding) => finding.severity === "p0" || finding.severity === "p1")} />
          <Metric label="Actions" value={ingestPlan ? actions.length : status?.counts.actions ?? 0} emphasis={actions.length > 0} />
          <Metric label="Jobs" value={ingestPlan ? jobs.length : status?.counts.ingestJobs ?? 0} />
          <Metric label="Runtime" value={status?.runtimeInstalled ? "installed" : "missing"} />
          <Metric label="Obsidian" value={status?.obsidianEnabled ? "enabled" : "disabled"} />
          <Metric label="Dashboard" value={status?.dashboardAvailable ? "ready" : "missing"} />
        </section>

        <section className="action-strip">
          <button onClick={handleImport} disabled={!vaultPath || busy === "import"}><FileInput size={16} />导入到 inbox</button>
          <button onClick={handlePlanIngest} disabled={!vaultPath || busy === "plan_ingest"}><ListChecks size={16} />规划 ingest</button>
          <button onClick={handleIngestLint} disabled={!vaultPath || busy === "ingest_lint"}><ShieldCheck size={16} />合约 lint</button>
          <button onClick={handleIngestPipeline} disabled={!vaultPath || busy === "ingest_pipeline" || runnableIngest === 0}><Play size={16} />运行 ingest pipeline</button>
          <button onClick={handleRepairTemplates} disabled={!vaultPath || busy === "repair_templates"}><Wrench size={16} />修复模板</button>
          <button onClick={() => vaultPath && openPath(vaultPath)} disabled={!vaultPath}><FolderOpen size={16} />打开文件夹</button>
          {runtimeActions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} onClick={() => handleRuntime(action.id)} disabled={!vaultPath || busy === action.id}>
                <Icon size={16} />{action.label}
              </button>
            );
          })}
        </section>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>下一步行动</h2>
              <select className="compact-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="open">open</option>
                <option value="resolved">resolved</option>
                <option value="ignored">ignored</option>
                <option value="all">all</option>
              </select>
            </div>
            <div className="action-list">
              {visibleActions.length === 0 && <p className="empty">暂无待处理行动。</p>}
              {visibleActions.map((action) => (
                <div className="work-item" key={action.actionId}>
                  <span className={classNames("status-chip", action.severity)}>{action.severity}</span>
                  <strong>{action.title}</strong>
                  <em>{action.body}</em>
                  <code>{action.status} · {action.recommendedAction} · affected {action.affectedObjects.length} · {action.reason}</code>
                  <div className="inline-actions">
                    <button title="打开关联文件" onClick={() => action.links[0] && openPath(vaultFilePath(action.links[0].path))}>
                      <FolderOpen size={14} />打开
                    </button>
                    <button title="标记已解决" onClick={() => handleActionStatus(action.actionId, "resolved")} disabled={action.status === "resolved"}>
                      <Check size={14} />解决
                    </button>
                    <button title="忽略该行动" onClick={() => handleActionStatus(action.actionId, "ignored")} disabled={action.status === "ignored"}>
                      <XCircle size={14} />忽略
                    </button>
                    <button title="重新打开行动" onClick={() => handleActionStatus(action.actionId, "open")} disabled={action.status === "open"}>
                      <RotateCcw size={14} />重开
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Per-source queue</h2>
              <span>{jobs.length} jobs</span>
            </div>
            <div className="queue-list">
              {jobs.length === 0 && <p className="empty">暂无 source 任务。</p>}
              {jobs.map((job) => (
                <div className="work-item" key={job.jobId}>
                  <span className={classNames("status-chip", job.status)}>{job.status}</span>
                  <strong>{job.sourceId || job.fileName}</strong>
                  <em>{job.currentStep} · {job.nextAction} · attempt {job.attempt}/{job.maxAttempts}</em>
                  <code>{job.lastError || job.reason}</code>
                  <div className="inline-actions">
                    <button title="打开当前 artifact 或原始 source" onClick={() => openPath(vaultFilePath(job.artifactPath || job.sourcePath))}>
                      <FolderOpen size={14} />打开
                    </button>
                    <button title="重新排队" onClick={() => handleJobStatus(job.jobId, "queued")} disabled={job.status === "queued"}>
                      <RotateCcw size={14} />重试
                    </button>
                    <button title="取消本 source 的 pipeline 处理" onClick={() => handleJobStatus(job.jobId, "cancelled")} disabled={job.status === "cancelled"}>
                      <XCircle size={14} />取消
                    </button>
                    <button title="打开 job 日志" onClick={() => job.logPath && openPath(vaultFilePath(job.logPath))} disabled={!job.logPath}>
                      <TerminalSquare size={14} />日志
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>Claim Ledger</h2>
              <select className="compact-select" value={claimFilter} onChange={(event) => setClaimFilter(event.target.value)}>
                <option value="needs_review">needs_review</option>
                <option value="stale">stale</option>
                <option value="contradicted">contradicted</option>
                <option value="supported">supported</option>
                <option value="ignored">ignored</option>
                <option value="all">all</option>
              </select>
            </div>
            <div className="claim-list">
              {visibleClaims.length === 0 && <p className="empty">暂无匹配 claims。</p>}
              {visibleClaims.map((claim) => (
                <div className="work-item" key={claim.claimId}>
                  <span className={classNames("status-chip", claim.verdict)}>{claim.verdict}</span>
                  <strong>{claim.claimText}</strong>
                  <em>{claim.sourceId || claim.sourceUuid || claim.sourcePath || `line ${claim.line}`}</em>
                  <code>{claim.evidenceHash || "no evidence hash"} · {claim.evidenceQuote || "no quote"}</code>
                  <div className="inline-actions">
                    <button title="打开 Claim Ledger" onClick={() => openPath(vaultFilePath("claims/claims.jsonl"))}>
                      <FolderOpen size={14} />打开
                    </button>
                    <button title="标记为支持" onClick={() => handleClaimVerdict(claim.claimId, "supported")} disabled={claim.verdict === "supported"}>
                      <Check size={14} />支持
                    </button>
                    <button title="标记为待审" onClick={() => handleClaimVerdict(claim.claimId, "needs_review")} disabled={claim.verdict === "needs_review"}>
                      <AlertTriangle size={14} />待审
                    </button>
                    <button title="标记为失效" onClick={() => handleClaimVerdict(claim.claimId, "stale")} disabled={claim.verdict === "stale"}>
                      <RotateCcw size={14} />失效
                    </button>
                    <button title="标记为冲突" onClick={() => handleClaimVerdict(claim.claimId, "contradicted")} disabled={claim.verdict === "contradicted"}>
                      <XCircle size={14} />冲突
                    </button>
                    <button title="忽略该 claim" onClick={() => handleClaimVerdict(claim.claimId, "ignored")} disabled={claim.verdict === "ignored"}>
                      <XCircle size={14} />忽略
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Source Registry</h2>
              <span>{registry.length} rows</span>
            </div>
            <div className="registry-list">
              {registry.length === 0 && <p className="empty">暂无 registry 投影。</p>}
              {registry.map((entry) => (
                <button key={`${entry.sourceUuid}-${entry.sourcePath}`} onClick={() => openPath(vaultFilePath(entry.sourcePath))}>
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.sourceId || entry.sourceUuid}</strong>
                  <em>{entry.sourcePath}{entry.duplicateOf ? ` · duplicate of ${entry.duplicateOf}` : ""}</em>
                  <code>{entry.sourcePage || "source page pending"} · {entry.artifactSha256 || "no artifact hash"} · {entry.parser || "parser pending"}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>Pipeline 状态</h2>
              <span>{busy ? `running: ${busy}` : "idle"}</span>
            </div>
            <ol className="pipeline">
              {pipeline.map((stage, index) => (
                <li key={stage}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                  <em>{pipelineState(index, status, ingestPlan)}</em>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Sources / Concepts / Reports</h2>
              <span>{status?.files.length ?? 0} items</span>
            </div>
            <div className="browser">
              <FileColumn title="Inbox" files={grouped.inbox} onSelect={setSelectedFile} />
              <FileColumn title="Sources" files={[...grouped.source, ...grouped.draft]} onSelect={setSelectedFile} />
              <FileColumn title="Concepts" files={grouped.concept} onSelect={setSelectedFile} />
              <FileColumn title="Reports" files={grouped.report} onSelect={setSelectedFile} />
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel">
            <div className="section-head">
              <h2>Ingest plan</h2>
              <ShieldCheck size={18} />
            </div>
            <div className="ingest-list">
              {!ingestPlan?.entries.length && <p className="empty">暂无可规划输入。</p>}
              {ingestPlan?.entries.map((entry) => (
                <button
                  key={`${entry.sourcePath}-${entry.sha256}`}
                  onClick={() => openPath(entry.status === "blocked" ? entry.sourcePath : entry.artifactPath || entry.sourcePath)}
                >
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.fileName}</strong>
                  <em>{entry.reason}</em>
                  {entry.parserHint && <code>{entry.parserHint}</code>}
                </button>
              ))}
            </div>
            {ingestPlan && <p className="note">Plan file: {ingestPlan.planPath}</p>}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>任务日志</h2>
              <TerminalSquare size={18} />
            </div>
            <div className="log-list">
              {logs.length === 0 && <p className="empty">暂无命令日志。</p>}
              {logs.map((log) => (
                <button key={log.id} className="log-item" onClick={() => openPath(log.logPath)}>
                  <span>{log.kind}</span>
                  <strong className={log.exitCode === 0 ? "pass" : "fail"}>exit {log.exitCode}</strong>
                  <em>{log.logPath}</em>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel">
            <div className="section-head">
              <h2>Artifact contract</h2>
              <span>{artifacts.length} artifacts</span>
            </div>
            <div className="contract-list">
              {artifacts.length === 0 && <p className="empty">暂无 artifact contract。</p>}
              {artifacts.map((artifact) => (
                <button key={artifact.artifactPath} onClick={() => openPath(vaultFilePath(artifact.manifestPath || artifact.artifactPath))}>
                  <span className={classNames("status-chip", artifact.status)}>{artifact.status}</span>
                  <strong>{artifact.artifactPath}</strong>
                  <em>
                    {artifact.parser || "legacy parser"} · schema {artifact.schemaVersion || "missing"} · valid {artifact.contractValid ? "yes" : "no"} · chunks {artifact.chunkCount}
                  </em>
                  <code>pages {artifact.anchorsPages ? "yes" : "no"} · tables {artifact.anchorsTables ? "yes" : "no"} · figures {artifact.anchorsFigures ? "yes" : "no"} · {artifact.parseLogPath || artifact.limitations[0] || "contract complete"}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Contract lint</h2>
              <span>{lintFindings.length} findings</span>
            </div>
            <div className="impact-list">
              {lintFindings.length === 0 && <p className="empty">暂无 contract finding。</p>}
              {lintFindings.map((finding) => (
                <button key={finding.findingId} onClick={() => finding.path && openPath(vaultFilePath(finding.path))}>
                  <span className={classNames("status-chip", finding.severity)}>{finding.severity}</span>
                  <strong>{finding.title}</strong>
                  <em>{finding.objectType} · {finding.kind}</em>
                  <code>{finding.detail}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel">
            <div className="section-head">
              <h2>Impact graph</h2>
              <span>{impactEdges.length} edges</span>
            </div>
            <div className="impact-list">
              {impactEdges.length === 0 && <p className="empty">暂无影响边。</p>}
              {impactEdges.map((edge) => (
                <button key={edge.edgeId}>
                  <span className={classNames("status-chip", edge.status)}>{edge.status}</span>
                  <strong>{edge.fromType}{" -> "}{edge.toType}</strong>
                  <em>{edge.relationship}</em>
                  <code>{edge.fromId}{" -> "}{edge.toId}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Canonical state</h2>
              <span>runtime-owned</span>
            </div>
            <div className="impact-list">
              {[
                "_state/source-registry.jsonl",
                "_state/artifacts.jsonl",
                "_state/ingest-jobs.jsonl",
                "_state/actions.jsonl",
                "_state/impact-graph.jsonl",
                "_state/lint-findings.jsonl",
              ].map((path) => (
                <button key={path} onClick={() => openPath(vaultFilePath(path))}>
                  <span className="status-chip published">state</span>
                  <strong>{path}</strong>
                  <em>canonical ingest contract</em>
                  <code>{vaultFilePath(path)}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        {selectedFile && (
          <section className="detail-bar">
            <div>
              <strong>{selectedFile.title || selectedFile.name}</strong>
              <span>{selectedFile.kind} · {selectedFile.status || "no status"} · {selectedFile.updated || "no updated date"}</span>
              <code>{selectedFile.path}</code>
            </div>
            <button onClick={() => openPath(selectedFile.path)}><FolderOpen size={16} />打开</button>
          </section>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div className={classNames("metric", emphasis && "emphasis")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FileColumn({ title, files, onSelect }: { title: string; files: VaultFile[]; onSelect: (file: VaultFile) => void }) {
  return (
    <div className="file-column">
      <h3>{title}</h3>
      {files.length === 0 && <p className="empty">None</p>}
      {files.map((file) => (
        <button key={file.path} onClick={() => onSelect(file)}>
          <strong>{file.title || file.name}</strong>
          <span>{file.status || file.updated || file.kind}</span>
        </button>
      ))}
    </div>
  );
}

export default App;
