import { useEffect, useMemo, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  FileInput,
  FolderOpen,
  GitCompare,
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
  applyWritebackProposal,
  createDiagnosticBundle,
  createQueryWritebackProposal,
  createFollowupAction,
  createVault,
  createWritebackProposal,
  cancelRuntimeJob,
  importSources,
  inspectVault,
  listClaimLedger,
  listEvidencePaths,
  listReviewQueue,
  listRuntimeJobs,
  listTraceabilityWarnings,
  listVaultSuggestions,
  listWritebackProposals,
  loadDesktopSettings,
  openObsidianVault,
  openPath,
  planIngest,
  repairObsidianTemplates,
  resolveVaultEntryNote,
  runIngestLint,
  runIngestPipeline,
  runRuntimeCommand,
  saveDesktopSettings,
  saveLastSelectedVault,
  setClaimVerdict,
  setDashboardActionStatus,
  setIngestJobStatus,
  setReviewItemStatus,
  setWritebackStatus,
  restoreLastSelectedVault,
} from "./tauri";
import type {
  ClaimLedgerItem,
  DesktopAppState,
  DesktopSettings,
  EvidencePathItem,
  ImportPreview,
  IngestPlan,
  QueryWritebackDraft,
  ReviewQueueItem,
  RuntimeJobEvent,
  RuntimeSettings,
  TaskLog,
  TraceabilityWarning,
  VaultEntryNote,
  VaultFile,
  VaultSuggestion,
  VaultStatus,
  WritebackProposal,
} from "./types";

const runtimeActions = [
  { id: "lint", label: "运行 lint", icon: ListChecks },
  { id: "parse_pdfs", label: "本地解析 PDFs", icon: FileInput },
  { id: "obsidian_setup", label: "Obsidian setup", icon: SquareStack },
  { id: "status_dashboard", label: "刷新 dashboard", icon: RefreshCw },
  { id: "discover", label: "Source discovery", icon: Search },
  { id: "claims", label: "Claim extraction", icon: ClipboardList },
  { id: "semantic_qa", label: "Semantic QA", icon: ShieldCheck },
  { id: "science_review", label: "Science review", icon: AlertTriangle },
  { id: "concept_revision_preview", label: "Concept preview", icon: Database },
  { id: "concept_revision_apply", label: "Concept apply", icon: Wrench },
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

const initialDesktopSettings: DesktopSettings = {
  runtimePath: "",
  pythonPath: "python3",
  uvPath: "uv",
  layoutParsingApiUrl: "",
  layoutParsingTokenPresent: false,
  cloudParsingAllowed: false,
  defaultPdfParser: "auto",
  defaultIngestMode: "inbox_only",
  defaultObsidianProfile: "minimal",
  retryCount: 3,
  timeoutSeconds: 1800,
  autoRunLintAfterWrites: true,
  autoOpenReportsAfterFailures: false,
  skipObsidianPluginDownloads: true,
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

function runtimeSettings(settings: DesktopSettings): RuntimeSettings {
  return {
    runtimePath: settings.runtimePath,
    pythonPath: settings.pythonPath || "python3",
    obsidianProfile: settings.defaultObsidianProfile as RuntimeSettings["obsidianProfile"],
    skipDownloads: settings.skipObsidianPluginDownloads,
    pdfParser: settings.defaultPdfParser as RuntimeSettings["pdfParser"],
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    retryCount: settings.retryCount,
    timeoutSeconds: settings.timeoutSeconds,
  };
}

function pipelineState(index: number, status: VaultStatus | null, plan: IngestPlan | null) {
  const inbox = status?.counts.inbox ?? 0;
  const ready = plan?.summary.ready ?? 0;
  const stageable = plan?.summary.stageable ?? 0;
  const blocked = plan?.summary.blocked ?? 0;
  const cached = plan?.summary.cached ?? 0;
  const published = plan?.summary.published ?? 0;
  const parseable = plan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
  const runnable = ready + stageable + cached + parseable;
  if (index === 0) return inbox > 0 ? "ready" : "waiting";
  if (index === 1) {
    if (blocked > 0 && parseable > 0) return "local parse ready";
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
  const [appState, setAppState] = useState<DesktopAppState | null>(null);
  const [vaultSuggestions, setVaultSuggestions] = useState<VaultSuggestion[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [entryNote, setEntryNote] = useState<VaultEntryNote | null>(null);
  const [newVaultPath, setNewVaultPath] = useState("");
  const [enableObsidian, setEnableObsidian] = useState(true);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(initialDesktopSettings);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [ingestPlan, setIngestPlan] = useState<IngestPlan | null>(null);
  const [claims, setClaims] = useState<ClaimLedgerItem[]>([]);
  const [evidencePaths, setEvidencePaths] = useState<EvidencePathItem[]>([]);
  const [traceabilityWarnings, setTraceabilityWarnings] = useState<TraceabilityWarning[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewQueueItem[]>([]);
  const [writebacks, setWritebacks] = useState<WritebackProposal[]>([]);
  const [importResults, setImportResults] = useState<ImportPreview[]>([]);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [actionFilter, setActionFilter] = useState("open");
  const [claimFilter, setClaimFilter] = useState("needs_review");
  const [reviewFilter, setReviewFilter] = useState("open");
  const [preserveFolders, setPreserveFolders] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [writebackTarget, setWritebackTarget] = useState("reviews/query-writeback/research-insight.md");
  const [writebackTitle, setWritebackTitle] = useState("");
  const [writebackContent, setWritebackContent] = useState("");
  const [queryText, setQueryText] = useState("基于当前 LLM Wiki，请整理 DeepSeek 的研发思路、思考问题的方式、关键决策依据，并预测可能的技术演进方向。请区分 evidence、inference、hypothesis、forecast，并生成可回写到 LLM Wiki 的 proposal。");
  const [queryTarget, setQueryTarget] = useState("reviews/query-writeback/deepseek-research-insights.md");
  const [queryDraft, setQueryDraft] = useState<QueryWritebackDraft | null>(null);
  const [diagnosticPath, setDiagnosticPath] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<RuntimeJobEvent | null>(null);
  const [runtimeHistory, setRuntimeHistory] = useState<RuntimeJobEvent[]>([]);
  const [liveLogLines, setLiveLogLines] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, VaultFile[]> = { source: [], draft: [], concept: [], report: [], inbox: [] };
    for (const file of status?.files ?? []) groups[file.kind]?.push(file);
    return groups;
  }, [status]);

  const rt = useMemo(() => runtimeSettings(desktopSettings), [desktopSettings]);
  const enqueueAfterImport = desktopSettings.defaultIngestMode === "enqueue_after_import";
  const tone = statusTone(status);
  const planned = ingestPlan?.summary;
  const runnableIngest = (planned?.ready ?? 0) + (planned?.stageable ?? 0) + (planned?.cached ?? 0);
  const parseablePdfs = ingestPlan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
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
  const visibleReviewItems = reviewItems.filter((item) => {
    if (reviewFilter === "all") return true;
    if (reviewFilter === "open") return !["approved", "resolved", "ignored", "rejected"].includes(item.status);
    return item.status === reviewFilter;
  });
  const brokenEvidence = evidencePaths.filter((item) => item.chainStatus !== "ok").length;
  const progressDone = jobs.filter((job) => job.status === "succeeded").length;
  const vaultFilePath = (path?: string | null) => {
    if (!path) return vaultPath;
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
    return `${vaultPath}/${path}`;
  };

  useEffect(() => {
    let ignore = false;
    async function boot() {
      try {
        const [restore, suggestions] = await Promise.all([
          restoreLastSelectedVault(),
          listVaultSuggestions(),
        ]);
        if (ignore) return;
        setAppState(restore.state);
        setVaultSuggestions(suggestions);
        if (restore.vaultPath && restore.status) {
          setVaultPath(restore.vaultPath);
          setStatus(restore.status);
          await refresh(restore.vaultPath);
        } else if (restore.error) {
          setRestoreError(restore.error);
        }
      } catch (err) {
        if (!ignore) setRestoreError(String(err));
      }
    }
    void boot();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<RuntimeJobEvent>("runtime-job-event", (event) => {
      const next = event.payload;
      setActiveJob(next);
      if (next.line) {
        setLiveLogLines((current) =>
          [`${next.stream || "log"} | ${next.line}`, ...current].slice(0, 160),
        );
      } else if (next.message) {
        setLiveLogLines((current) =>
          [`${next.status} | ${next.message}`, ...current].slice(0, 160),
        );
      }
      if (next.endedAt) {
        setRuntimeHistory((current) => [next, ...current.filter((item) => item.jobId !== next.jobId)].slice(0, 40));
      }
    }).then((dispose) => {
      unlisten = dispose;
    }).catch((err) => setError(String(err)));
    return () => {
      unlisten?.();
    };
  }, []);

  async function refresh(path = vaultPath) {
    if (!path) return;
    setBusy("inspect");
    setError(null);
    try {
      const nextSettings = await loadDesktopSettings(path);
      const nextPlan = await planIngest(path);
      const nextClaims = await listClaimLedger(path);
      const nextEvidence = await listEvidencePaths(path);
      const nextWarnings = await listTraceabilityWarnings(path);
      const nextRuntimeHistory = await listRuntimeJobs(path);
      const nextReview = await listReviewQueue(path);
      const nextWritebacks = await listWritebackProposals(path);
      const nextStatus = await inspectVault(path);
      const nextEntry = await resolveVaultEntryNote(path);
      setStatus(nextStatus);
      setIngestPlan(nextPlan);
      setClaims(nextClaims);
      setEvidencePaths(nextEvidence);
      setTraceabilityWarnings(nextWarnings);
      setRuntimeHistory(nextRuntimeHistory);
      setReviewItems(nextReview);
      setWritebacks(nextWritebacks);
      setDesktopSettings(nextSettings);
      setEntryNote(nextEntry);
      setAppState(await saveLastSelectedVault(path));
      setVaultSuggestions(await listVaultSuggestions());
      setRestoreError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function chooseVault() {
    const picked = await open({ directory: true, multiple: false, title: "选择 open-llm-wiki vault" });
    if (typeof picked !== "string") return;
    await selectVault(picked);
  }

  async function selectVault(path: string) {
    setRestoreError(null);
    setVaultPath(path);
    await refresh(path);
  }

  async function chooseRuntime() {
    const picked = await open({ directory: true, multiple: false, title: "选择 open-llm-wiki runtime 仓库或已安装 vault" });
    if (typeof picked !== "string") return;
    setDesktopSettings((current) => ({ ...current, runtimePath: picked }));
  }

  async function handleCreateVault() {
    if (!newVaultPath.trim()) {
      setError("请先填写要创建的 vault 绝对路径。");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const next = await createVault(newVaultPath.trim(), rt, enableObsidian);
      await saveDesktopSettings(next.path, desktopSettings);
      setVaultPath(next.path);
      setNewVaultPath("");
      await refresh(next.path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSettings() {
    if (!vaultPath) return;
    setBusy("save_settings");
    setError(null);
    try {
      setDesktopSettings(await saveDesktopSettings(vaultPath, desktopSettings));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImportPaths(paths: string[]) {
    if (!vaultPath || paths.length === 0) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importSources(vaultPath, paths, enqueueAfterImport, preserveFolders);
      setImportResults([...result.imported, ...result.skippedDuplicates]);
      if (result.errors.length) setError(result.errors.join("\n"));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImportFiles() {
    const picked = await open({
      directory: false,
      multiple: true,
      title: "导入 PDF / Markdown / txt 到 raw/inbox",
      filters: [{ name: "Documents", extensions: ["pdf", "md", "markdown", "txt"] }],
    });
    const paths = Array.isArray(picked) ? picked.filter((item): item is string => typeof item === "string") : [];
    await handleImportPaths(paths);
  }

  async function handleImportFolder() {
    const picked = await open({ directory: true, multiple: true, title: "导入文件夹到 raw/inbox" });
    const paths = Array.isArray(picked) ? picked.filter((item): item is string => typeof item === "string") : typeof picked === "string" ? [picked] : [];
    await handleImportPaths(paths);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (!paths.length) {
      setError("拖拽事件没有提供本地文件路径，请使用导入文件或导入文件夹按钮。");
      return;
    }
    await handleImportPaths(paths);
  }

  async function handleRuntime(kind: string) {
    if (!vaultPath) return;
    setBusy(kind);
    setError(null);
    setLiveLogLines([]);
    try {
      const log = await runRuntimeCommand(vaultPath, rt, kind);
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
      setIngestPlan(nextPlan);
      await refresh();
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
      await refresh();
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
      await refresh();
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
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleReviewStatus(
    itemId: string,
    status: "open" | "approved" | "rejected" | "resolved" | "ignored" | "needs_review",
  ) {
    if (!vaultPath) return;
    setBusy(`review:${itemId}`);
    setError(null);
    try {
      setReviewItems(await setReviewItemStatus(vaultPath, itemId, status));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleFollowup(item: ReviewQueueItem) {
    if (!vaultPath) return;
    setBusy(`followup:${item.itemId}`);
    setError(null);
    try {
      setReviewItems(await createFollowupAction(vaultPath, item.title, item.body, item.targetPath));
      await refresh();
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
    setLiveLogLines([]);
    try {
      const result = await runIngestPipeline(vaultPath, rt);
      setLogs((current) => [...result.logs, ...current].slice(0, 12));
      await refresh();
      if (result.exitCode !== 0) setError(`ingest pipeline 失败，exit code ${result.exitCode}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateWriteback() {
    if (!vaultPath || !writebackTarget.trim()) return;
    setBusy("writeback_proposal");
    setError(null);
    try {
      const proposal = await createWritebackProposal(
        vaultPath,
        writebackTarget.trim(),
        writebackTitle.trim() || "Desktop writeback proposal",
        writebackContent,
      );
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposal.proposalId)]);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateQueryWriteback() {
    if (!vaultPath || !queryText.trim()) return;
    setBusy("query_writeback");
    setError(null);
    try {
      const draft = await createQueryWritebackProposal(
        vaultPath,
        queryText,
        queryTarget.trim() || "reviews/query-writeback/deepseek-research-insights.md",
        "DeepSeek research insight query",
      );
      setQueryDraft(draft);
      setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenObsidian() {
    if (!vaultPath) return;
    setBusy("obsidian_open");
    setError(null);
    try {
      const entry = await openObsidianVault(vaultPath);
      setEntryNote(entry);
      if (entry.warning) setRestoreError(entry.warning);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelRuntimeJob() {
    if (!activeJob?.jobId) return;
    try {
      await cancelRuntimeJob(activeJob.jobId);
      setLiveLogLines((current) => [`cancel requested | ${activeJob.jobId}`, ...current].slice(0, 160));
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRetryRuntimeJob(job: RuntimeJobEvent) {
    if (job.kind === "ingest_pipeline") {
      await handleIngestPipeline();
      return;
    }
    await handleRuntime(job.kind);
  }

  async function handleWritebackStatus(proposalId: string, status: "proposed" | "approved" | "rejected") {
    if (!vaultPath) return;
    setBusy(`writeback:${proposalId}`);
    setError(null);
    try {
      const proposal = await setWritebackStatus(vaultPath, proposalId, status);
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposalId)]);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyWriteback(proposalId: string) {
    if (!vaultPath) return;
    setBusy(`apply:${proposalId}`);
    setError(null);
    try {
      const proposal = await applyWritebackProposal(vaultPath, proposalId);
      if (desktopSettings.autoRunLintAfterWrites) await runIngestLint(vaultPath);
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposalId)]);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDiagnostic() {
    if (!vaultPath) return;
    setBusy("diagnostic");
    setError(null);
    try {
      const path = await createDiagnosticBundle(vaultPath);
      setDiagnosticPath(path);
      await openPath(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      className={classNames("app-shell", dragActive && "drag-active")}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
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
          <div className="path-field" title={entryNote?.entryPath || "No entry note resolved"}>
            {entryNote?.entryRelativePath || "Entry note pending"}
          </div>
          {entryNote?.warning && <p className="note warn-text">{entryNote.warning}</p>}
          <div className="button-row">
            <button onClick={chooseVault}><FolderOpen size={16} />打开</button>
            <button onClick={() => refresh()} disabled={!vaultPath || busy === "inspect"}><RefreshCw size={16} />刷新</button>
          </div>
          <input value={newVaultPath} onChange={(event) => setNewVaultPath(event.target.value)} placeholder="/absolute/path/to/new-vault" />
          <label className="check-row">
            <input type="checkbox" checked={enableObsidian} onChange={(event) => setEnableObsidian(event.target.checked)} />
            创建时启用 Obsidian profile
          </label>
          <button className="wide" onClick={handleCreateVault} disabled={busy === "create"}><Archive size={16} />创建 vault</button>
          <div className="button-row">
            <button onClick={() => vaultPath && openPath(vaultPath)} disabled={!vaultPath}><FolderOpen size={16} />文件夹</button>
            <button onClick={handleOpenObsidian} disabled={!vaultPath || busy === "obsidian_open"}><SquareStack size={16} />Obsidian</button>
          </div>
        </section>

        <section className="panel">
          <h2>Runtime 设置</h2>
          <input value={desktopSettings.pythonPath} onChange={(event) => setDesktopSettings((current) => ({ ...current, pythonPath: event.target.value }))} placeholder="python3" />
          <input value={desktopSettings.uvPath} onChange={(event) => setDesktopSettings((current) => ({ ...current, uvPath: event.target.value }))} placeholder="uv" />
          <div className="path-field" title={desktopSettings.runtimePath || "优先使用 vault 内 .open-llm-wiki/scripts"}>{desktopSettings.runtimePath || "优先使用 vault 内 runtime"}</div>
          <button className="wide" onClick={chooseRuntime}><Settings size={16} />选择 runtime 路径</button>
          <select value={desktopSettings.defaultObsidianProfile} onChange={(event) => setDesktopSettings((current) => ({ ...current, defaultObsidianProfile: event.target.value }))}>
            <option value="minimal">minimal</option>
            <option value="research">research</option>
            <option value="full">full</option>
          </select>
          <select value={desktopSettings.defaultIngestMode} onChange={(event) => setDesktopSettings((current) => ({ ...current, defaultIngestMode: event.target.value }))}>
            <option value="inbox_only">先入 inbox</option>
            <option value="enqueue_after_import">导入后入队</option>
          </select>
          <div className="settings-grid">
            <label>Retry<input type="number" min={1} value={desktopSettings.retryCount} onChange={(event) => setDesktopSettings((current) => ({ ...current, retryCount: Number(event.target.value) || 1 }))} /></label>
            <label>Timeout<input type="number" min={60} value={desktopSettings.timeoutSeconds} onChange={(event) => setDesktopSettings((current) => ({ ...current, timeoutSeconds: Number(event.target.value) || 60 }))} /></label>
          </div>
          <input value={desktopSettings.layoutParsingApiUrl} onChange={(event) => setDesktopSettings((current) => ({ ...current, layoutParsingApiUrl: event.target.value }))} placeholder="Layout parsing API URL" />
          <select value={desktopSettings.defaultPdfParser} onChange={(event) => setDesktopSettings((current) => ({ ...current, defaultPdfParser: event.target.value }))}>
            <option value="auto">PDF parser: auto / local-first</option>
            <option value="local-text">PDF parser: local-text</option>
            <option value="layout-api">PDF parser: layout-api</option>
          </select>
          <p className="note">Token: {desktopSettings.layoutParsingTokenPresent ? "环境变量已配置" : "未检测到"} · auto/local-text 不上传 PDF；layout-api 会发送文档内容</p>
          <label className="check-row">
            <input type="checkbox" checked={desktopSettings.cloudParsingAllowed} onChange={(event) => setDesktopSettings((current) => ({ ...current, cloudParsingAllowed: event.target.checked }))} />
            允许云解析
          </label>
          <label className="check-row">
            <input type="checkbox" checked={desktopSettings.autoRunLintAfterWrites} onChange={(event) => setDesktopSettings((current) => ({ ...current, autoRunLintAfterWrites: event.target.checked }))} />
            写回后自动 lint
          </label>
          <label className="check-row">
            <input type="checkbox" checked={desktopSettings.autoOpenReportsAfterFailures} onChange={(event) => setDesktopSettings((current) => ({ ...current, autoOpenReportsAfterFailures: event.target.checked }))} />
            失败后打开 report
          </label>
          <label className="check-row">
            <input type="checkbox" checked={desktopSettings.skipObsidianPluginDownloads} onChange={(event) => setDesktopSettings((current) => ({ ...current, skipObsidianPluginDownloads: event.target.checked }))} />
            Obsidian setup 跳过插件下载
          </label>
          <button className="wide" onClick={handleSaveSettings} disabled={!vaultPath || busy === "save_settings"}><Check size={16} />保存设置</button>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>任务流控制台</h2>
            <p>所有 source 发布、QA、review 和 writeback 都通过 runtime-owned state 留痕。</p>
          </div>
          <div className={classNames("health", tone)}>
            {tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {vaultPath ? (status ? (status.schemaValid ? "Schema valid" : "Schema invalid") : "Inspecting vault") : "Choose vault"}
          </div>
        </header>

        {error && <pre className="error-box">{error}</pre>}
        {restoreError && <pre className="error-box subtle">{restoreError}</pre>}

        {!vaultPath && (
          <EmptyVaultState
            appState={appState}
            suggestions={vaultSuggestions}
            onChooseVault={chooseVault}
            onSelectVault={selectVault}
            newVaultPath={newVaultPath}
            setNewVaultPath={setNewVaultPath}
            onCreateVault={handleCreateVault}
            busy={busy}
          />
        )}

        {vaultPath && (
          <>
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
          <Metric label="Evidence breaks" value={brokenEvidence} emphasis={brokenEvidence > 0} />
          <Metric label="Lint P1/P0" value={lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length} emphasis={lintFindings.some((finding) => finding.severity === "p0" || finding.severity === "p1")} />
          <Metric label="Queue" value={`${progressDone}/${jobs.length}`} />
          <Metric label="Runtime" value={status?.runtimeInstalled ? "installed" : "missing"} />
          <Metric label="Runtime version" value={status?.runtimeVersion || "unknown"} />
          <Metric label="Last update" value={status?.lastUpdated ? new Date(status.lastUpdated).toLocaleDateString() : "unknown"} />
          <Metric label="Obsidian" value={status?.obsidianEnabled ? "enabled" : "disabled"} />
          <Metric label="Dashboard" value={status?.dashboardAvailable ? "ready" : "missing"} />
        </section>

        <section className={classNames("drop-zone", dragActive && "active")}>
          <div>
            <strong>导入 PDF / Markdown / txt / folder</strong>
            <span>{enqueueAfterImport ? "导入后写入 runtime-owned ingest queue" : "仅进入 raw/inbox，等待手动规划"}</span>
          </div>
          <div className="inline-actions">
            <button onClick={handleImportFiles} disabled={!vaultPath || busy === "import"}><FileInput size={16} />导入文件</button>
            <button onClick={handleImportFolder} disabled={!vaultPath || busy === "import"}><FolderOpen size={16} />导入文件夹</button>
            <label className="check-row">
              <input type="checkbox" checked={preserveFolders} onChange={(event) => setPreserveFolders(event.target.checked)} />
              保留目录上下文
            </label>
          </div>
        </section>

        <section className="action-strip">
          <button onClick={handlePlanIngest} disabled={!vaultPath || busy === "plan_ingest"}><ListChecks size={16} />规划 ingest</button>
          <button onClick={handleIngestLint} disabled={!vaultPath || busy === "ingest_lint"}><ShieldCheck size={16} />合约 lint</button>
          <button onClick={handleIngestPipeline} disabled={!vaultPath || busy === "ingest_pipeline" || (runnableIngest + parseablePdfs) === 0}><Play size={16} />运行 ingest pipeline</button>
          <button onClick={handleRepairTemplates} disabled={!vaultPath || busy === "repair_templates"}><Wrench size={16} />修复模板</button>
          <button onClick={handleDiagnostic} disabled={!vaultPath || busy === "diagnostic"}><TerminalSquare size={16} />诊断 bundle</button>
          {runtimeActions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} onClick={() => handleRuntime(action.id)} disabled={!vaultPath || busy === action.id}>
                <Icon size={16} />{action.label}
              </button>
            );
          })}
        </section>

        <section className="panel activity-panel">
          <div className="section-head">
            <h2>Activity Panel</h2>
            <span>{activeJob ? `${activeJob.status} · ${Math.round(activeJob.elapsedMs / 1000)}s` : "idle"}</span>
          </div>
          <div className="activity-meta">
            <span>Job: {activeJob?.jobId || "none"}</span>
            <span>Stage: {activeJob?.stage || busy || "idle"}</span>
            <span>Attempt: {activeJob ? `${activeJob.attempt}/${activeJob.maxAttempts}` : `${desktopSettings.retryCount} configured`}</span>
            <span>Timeout: {desktopSettings.timeoutSeconds}s</span>
          </div>
          <div className="inline-actions">
            <button onClick={handleCancelRuntimeJob} disabled={!activeJob || ["succeeded", "failed", "timeout", "cancelled"].includes(activeJob.status)}><XCircle size={14} />取消当前 job</button>
            <button onClick={() => activeJob?.logPath && openPath(activeJob.logPath)} disabled={!activeJob?.logPath}><TerminalSquare size={14} />打开结果日志</button>
            <button onClick={() => activeJob && handleRetryRuntimeJob(activeJob)} disabled={!activeJob || !["failed", "timeout", "cancelled"].includes(activeJob.status)}><RotateCcw size={14} />重试同类任务</button>
          </div>
          <pre className="live-log">{liveLogLines.length ? liveLogLines.join("\n") : "Runtime stdout/stderr will stream here while commands run."}</pre>
          <div className="runtime-history">
            {runtimeHistory.length === 0 && <p className="empty">暂无持久 runtime job 记录。</p>}
            {runtimeHistory.slice(0, 8).map((job) => (
              <div className="runtime-history-item" key={job.jobId}>
                <span className={classNames("status-chip", job.status)}>{job.status}</span>
                <strong>{job.kind}</strong>
                <em>{job.startedAt} · attempt {job.attempt}/{job.maxAttempts} · exit {job.exitCode ?? "running"}</em>
                <code>{job.logPath || job.message || job.command.join(" ")}</code>
                <div className="history-actions">
                  <button type="button" onClick={() => job.logPath && openPath(job.logPath)} disabled={!job.logPath}><TerminalSquare size={12} />log</button>
                  <button type="button" onClick={() => handleRetryRuntimeJob(job)} disabled={!["failed", "timeout", "cancelled"].includes(job.status)}><RotateCcw size={12} />retry</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>导入结果</h2>
              <span>{importResults.length} files</span>
            </div>
            <div className="ingest-list">
              {importResults.length === 0 && <p className="empty">暂无本轮导入结果。</p>}
              {importResults.map((item) => (
                <button key={`${item.sourcePath}-${item.sha256}`} onClick={() => item.targetPath && openPath(item.targetPath)}>
                  <span className={classNames("status-chip", item.status)}>{item.status}</span>
                  <strong>{item.fileName}</strong>
                  <em>{item.mime} · {(item.sizeBytes / 1024).toFixed(1)} KB · {item.folderContext || "root"}</em>
                  <code>{item.sha256.slice(0, 16)} · {item.doi || item.arxivId || item.titleHint || "no metadata"} · {item.duplicateOf || item.approximateDuplicateOf || item.targetPath}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Per-source queue</h2>
              <span>{jobs.length ? `${progressDone}/${jobs.length} done` : "0 jobs"}</span>
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
                    <button title="打开当前 artifact 或原始 source" onClick={() => openPath(vaultFilePath(job.artifactPath || job.sourcePath))}><FolderOpen size={14} />打开</button>
                    <button title="重新排队" onClick={() => handleJobStatus(job.jobId, "queued")} disabled={job.status === "queued"}><RotateCcw size={14} />重试</button>
                    <button title="取消本 source 的 pipeline 处理" onClick={() => handleJobStatus(job.jobId, "cancelled")} disabled={job.status === "cancelled"}><XCircle size={14} />取消</button>
                    <button title="打开 job 日志" onClick={() => job.logPath && openPath(vaultFilePath(job.logPath))} disabled={!job.logPath}><TerminalSquare size={14} />日志</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>Traceability warnings</h2>
              <span>{traceabilityWarnings.length} evidence-anchor issues</span>
            </div>
            <div className="impact-list">
              {traceabilityWarnings.length === 0 && <p className="empty">暂无 evidence-anchor warning。</p>}
              {traceabilityWarnings.map((warning) => (
                <div className="work-item" key={warning.warningId}>
                  <span className={classNames("status-chip", warning.severity)}>{warning.severity}</span>
                  <strong>{warning.claimId}</strong>
                  <em>{warning.sourcePath || "source unknown"}</em>
                  <code>{warning.missingHeading}</code>
                  <div className="inline-actions">
                    <button onClick={() => openPath(vaultFilePath(warning.claimPath))}><ClipboardList size={14} />claim</button>
                    <button onClick={() => warning.sourcePath && openPath(vaultFilePath(warning.sourcePath))} disabled={!warning.sourcePath}><FolderOpen size={14} />source</button>
                    <button onClick={() => warning.artifactPath && openPath(vaultFilePath(warning.artifactPath))} disabled={!warning.artifactPath}><FileInput size={14} />artifact</button>
                  </div>
                  <p className="note">{warning.suggestedAction}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Evidence path</h2>
              <span>{evidencePaths.length} claims</span>
            </div>
            <div className="impact-list">
              {evidencePaths.length === 0 && <p className="empty">暂无可追踪 claim。</p>}
              {evidencePaths.map((item) => (
                <div className="work-item" key={item.claimId}>
                  <span className={classNames("status-chip", item.chainStatus)}>{item.chainStatus}</span>
                  <strong>{item.claimText}</strong>
                  <em>{item.concept || "no concept"} · {item.sourceId || item.sourceUuid || "no source"}</em>
                  <code>{item.evidenceAnchor || "missing anchor"} · {item.missing.join(", ") || "chain complete"}</code>
                  <div className="inline-actions">
                    <button onClick={() => item.sourcePage && openPath(vaultFilePath(item.sourcePage))} disabled={!item.sourcePage}><FolderOpen size={14} />source</button>
                    <button onClick={() => item.artifactPath && openPath(vaultFilePath(item.artifactPath))} disabled={!item.artifactPath}><FileInput size={14} />artifact</button>
                    <button onClick={() => item.qaReportPath && openPath(vaultFilePath(item.qaReportPath))} disabled={!item.qaReportPath}><ShieldCheck size={14} />QA</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>QA / Review 工作台</h2>
              <select className="compact-select" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
                <option value="open">open</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="ignored">ignored</option>
                <option value="all">all</option>
              </select>
            </div>
            <div className="action-list">
              {visibleReviewItems.length === 0 && <p className="empty">暂无审核项。</p>}
              {visibleReviewItems.map((item) => (
                <div className="work-item" key={item.itemId}>
                  <span className={classNames("status-chip", item.severity)}>{item.severity}</span>
                  <strong>{item.title}</strong>
                  <em>{item.kind} · {item.status} · {item.recommendedAction}</em>
                  <code>{item.body}</code>
                  <div className="inline-actions">
                    <button onClick={() => item.targetPath && openPath(vaultFilePath(item.targetPath))} disabled={!item.targetPath}><FolderOpen size={14} />打开</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "approved")} disabled={item.status === "approved"}><Check size={14} />批准</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "rejected")} disabled={item.status === "rejected"}><XCircle size={14} />拒绝</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "ignored")} disabled={item.status === "ignored"}><XCircle size={14} />忽略</button>
                    <button onClick={() => handleFollowup(item)}><ClipboardList size={14} />follow-up</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
          <section className="panel large">
            <div className="section-head">
              <h2>Query / Insight / Writeback Composer</h2>
              <GitCompare size={18} />
            </div>
            <div className="writeback-form">
              <textarea value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="基于当前 vault 提问；输出必须区分 evidence / inference / hypothesis / forecast。" />
              <input value={queryTarget} onChange={(event) => setQueryTarget(event.target.value)} placeholder="reviews/query-writeback/deepseek-research-insights.md" />
              <button onClick={handleCreateQueryWriteback} disabled={!vaultPath || busy === "query_writeback"}><GitCompare size={16} />生成 evidence-backed proposal</button>
              {queryDraft && (
                <div className="composer-result">
                  <strong>Answer</strong>
                  <pre className="diff-box">{queryDraft.answer}</pre>
                  <strong>Evidence map</strong>
                  <div className="impact-list compact">
                    {queryDraft.evidenceMap.map((item) => (
                      <button key={item.claimId} onClick={() => item.sourcePath && openPath(vaultFilePath(item.sourcePath))}>
                        <span className="status-chip proposed">{item.conclusionType}</span>
                        <strong>{item.claimId}</strong>
                        <em>{item.sourceId || item.sourcePath || "source unknown"} · {item.confidence}</em>
                        <code>{item.quote || "hash-backed evidence without quote"}</code>
                      </button>
                    ))}
                  </div>
                  <strong>Writeback proposal</strong>
                  <pre className="diff-box">{queryDraft.proposal.diff}</pre>
                </div>
              )}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Manual Writeback 安全流程</h2>
              <GitCompare size={18} />
            </div>
            <div className="writeback-form">
              <input value={writebackTarget} onChange={(event) => setWritebackTarget(event.target.value)} placeholder="reviews/query-writeback/example.md 或 concepts/example.md" />
              <input value={writebackTitle} onChange={(event) => setWritebackTitle(event.target.value)} placeholder="proposal title" />
              <textarea value={writebackContent} onChange={(event) => setWritebackContent(event.target.value)} placeholder="proposal 内容；默认写入 reviews/query-writeback/，不静默修改 source/concept。" />
              <button onClick={handleCreateWriteback} disabled={!vaultPath || busy === "writeback_proposal"}><GitCompare size={16} />生成 review proposal</button>
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>Writeback proposals</h2>
              <span>{writebacks.length} proposals</span>
            </div>
            <div className="impact-list">
              {writebacks.length === 0 && <p className="empty">暂无 writeback proposal。</p>}
              {writebacks.map((proposal) => (
                <div className="work-item" key={proposal.proposalId}>
                  <span className={classNames("status-chip", proposal.status)}>{proposal.status}</span>
                  <strong>{proposal.title}</strong>
                  <em>{proposal.targetPath} · {proposal.updatedAt}</em>
                  <code>{proposal.diff.split("\n").slice(0, 2).join(" | ")}</code>
                  <div className="inline-actions">
                    <button onClick={() => openPath(vaultFilePath(proposal.targetPath))}><FolderOpen size={14} />target</button>
                    <button onClick={() => handleWritebackStatus(proposal.proposalId, "approved")} disabled={proposal.status !== "proposed"}><Check size={14} />审批</button>
                    <button onClick={() => handleWritebackStatus(proposal.proposalId, "rejected")} disabled={proposal.status === "applied"}><XCircle size={14} />拒绝</button>
                    <button onClick={() => handleApplyWriteback(proposal.proposalId)} disabled={proposal.status !== "approved"}><Play size={14} />应用</button>
                    <button onClick={() => proposal.logPath && openPath(vaultFilePath(proposal.logPath))} disabled={!proposal.logPath}><TerminalSquare size={14} />日志</button>
                  </div>
                  <pre className="diff-box">{proposal.diff}</pre>
                </div>
              ))}
            </div>
          </section>
        </div>

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
                    <button title="打开关联文件" onClick={() => action.links[0] && openPath(vaultFilePath(action.links[0].path))}><FolderOpen size={14} />打开</button>
                    <button title="标记已解决" onClick={() => handleActionStatus(action.actionId, "resolved")} disabled={action.status === "resolved"}><Check size={14} />解决</button>
                    <button title="忽略该行动" onClick={() => handleActionStatus(action.actionId, "ignored")} disabled={action.status === "ignored"}><XCircle size={14} />忽略</button>
                    <button title="重新打开行动" onClick={() => handleActionStatus(action.actionId, "open")} disabled={action.status === "open"}><RotateCcw size={14} />重开</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

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
                    <button onClick={() => openPath(vaultFilePath("claims/claims.jsonl"))}><FolderOpen size={14} />打开</button>
                    <button onClick={() => handleClaimVerdict(claim.claimId, "supported")} disabled={claim.verdict === "supported"}><Check size={14} />支持</button>
                    <button onClick={() => handleClaimVerdict(claim.claimId, "needs_review")} disabled={claim.verdict === "needs_review"}><AlertTriangle size={14} />待审</button>
                    <button onClick={() => handleClaimVerdict(claim.claimId, "stale")} disabled={claim.verdict === "stale"}><RotateCcw size={14} />失效</button>
                    <button onClick={() => handleClaimVerdict(claim.claimId, "contradicted")} disabled={claim.verdict === "contradicted"}><XCircle size={14} />冲突</button>
                    <button onClick={() => handleClaimVerdict(claim.claimId, "ignored")} disabled={claim.verdict === "ignored"}><XCircle size={14} />忽略</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
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
              <h2>Ingest plan</h2>
              <ShieldCheck size={18} />
            </div>
            <div className="ingest-list">
              {!ingestPlan?.entries.length && <p className="empty">暂无可规划输入。</p>}
              {ingestPlan?.entries.map((entry) => (
                <button key={`${entry.sourcePath}-${entry.sha256}`} onClick={() => openPath(entry.status === "blocked" ? entry.sourcePath : entry.artifactPath || entry.sourcePath)}>
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.fileName}</strong>
                  <em>{entry.reason}</em>
                  {entry.parserHint && <code>{entry.parserHint}</code>}
                </button>
              ))}
            </div>
            {ingestPlan && <p className="note">Plan file: {ingestPlan.planPath}</p>}
          </section>
        </div>

        <div className="main-grid">
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
              {diagnosticPath && (
                <button className="log-item" onClick={() => openPath(diagnosticPath)}>
                  <span>diagnostic bundle</span>
                  <strong className="pass">ready</strong>
                  <em>{diagnosticPath}</em>
                </button>
              )}
            </div>
          </section>

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
                  <em>{artifact.parser || "legacy parser"} · schema {artifact.schemaVersion || "missing"} · valid {artifact.contractValid ? "yes" : "no"} · chunks {artifact.chunkCount}</em>
                  <code>pages {artifact.anchorsPages ? "yes" : "no"} · tables {artifact.anchorsTables ? "yes" : "no"} · figures {artifact.anchorsFigures ? "yes" : "no"} · {artifact.parseLogPath || artifact.limitations[0] || "contract complete"}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="main-grid">
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
                "_state/review-decisions.jsonl",
                "_state/writeback-log.jsonl",
                "_state/import-report.jsonl",
              ].map((path) => (
                <button key={path} onClick={() => openPath(vaultFilePath(path))}>
                  <span className="status-chip published">state</span>
                  <strong>{path}</strong>
                  <em>canonical desktop/runtime contract</em>
                  <code>{vaultFilePath(path)}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="section-head">
            <h2>Impact graph</h2>
            <span>{impactEdges.length} edges</span>
          </div>
          <div className="impact-list compact">
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

        {selectedFile && (
          <section className="detail-bar">
            <div>
              <strong>{selectedFile.title || selectedFile.name}</strong>
              <span>{selectedFile.kind} · {selectedFile.status || "no status"} · {selectedFile.updated || "no updated date"} · QA {selectedFile.qaVerdict || "unknown"}</span>
              <code>{selectedFile.path}</code>
            </div>
            <button onClick={() => openPath(selectedFile.path)}><FolderOpen size={16} />打开</button>
          </section>
        )}
          </>
        )}
      </section>
    </main>
  );
}

function EmptyVaultState({
  appState,
  suggestions,
  onChooseVault,
  onSelectVault,
  newVaultPath,
  setNewVaultPath,
  onCreateVault,
  busy,
}: {
  appState: DesktopAppState | null;
  suggestions: VaultSuggestion[];
  onChooseVault: () => void;
  onSelectVault: (path: string) => void;
  newVaultPath: string;
  setNewVaultPath: (path: string) => void;
  onCreateVault: () => void;
  busy: string | null;
}) {
  const lastVault = appState?.lastSelectedVault || "";
  return (
    <section className="empty-vault">
      <div>
        <h2>选择 vault</h2>
        <p>打开已有 LLM Wiki vault 后，桌面端会自动 inspect vault、恢复 dashboard，并记住最近使用的位置。</p>
      </div>
      <div className="empty-actions">
        <button onClick={onChooseVault}><FolderOpen size={16} />选择 vault</button>
        <button onClick={() => lastVault && onSelectVault(lastVault)} disabled={!lastVault}><RotateCcw size={16} />最近 vault</button>
        {suggestions.filter((item) => item.kind === "deepseek").slice(0, 1).map((item) => (
          <button key={item.path} onClick={() => onSelectVault(item.path)}><Database size={16} />打开 DeepSeek vault</button>
        ))}
      </div>
      <div className="suggestion-list">
        {suggestions.map((item) => (
          <button key={`${item.kind}-${item.path}`} onClick={() => onSelectVault(item.path)} disabled={!item.exists}>
            <span className={classNames("status-chip", item.exists ? "ready" : "failed")}>{item.kind}</span>
            <strong>{item.label}</strong>
            <em>{item.exists ? "available" : "missing"}</em>
            <code>{item.path}</code>
          </button>
        ))}
      </div>
      <div className="create-inline">
        <input value={newVaultPath} onChange={(event) => setNewVaultPath(event.target.value)} placeholder="/absolute/path/to/new-vault" />
        <button onClick={onCreateVault} disabled={busy === "create"}><Archive size={16} />创建新 vault</button>
      </div>
    </section>
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
