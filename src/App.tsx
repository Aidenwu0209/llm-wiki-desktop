import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Database,
  FileInput,
  FolderOpen,
  ListChecks,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SquareStack,
  TerminalSquare,
} from "lucide-react";
import { createVault, importToInbox, inspectVault, openPath, runRuntimeCommand } from "./tauri";
import type { RuntimeSettings, TaskLog, VaultFile, VaultStatus } from "./types";

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

function App() {
  const [vaultPath, setVaultPath] = useState("");
  const [newVaultPath, setNewVaultPath] = useState("");
  const [enableObsidian, setEnableObsidian] = useState(true);
  const [settings, setSettings] = useState<RuntimeSettings>(initialSettings);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
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
      setStatus(await inspectVault(path));
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

  const tone = statusTone(status);

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
          <Metric label="Runtime" value={status?.runtimeInstalled ? "installed" : "missing"} />
          <Metric label="Obsidian" value={status?.obsidianEnabled ? "enabled" : "disabled"} />
          <Metric label="Dashboard" value={status?.dashboardAvailable ? "ready" : "missing"} />
        </section>

        <section className="action-strip">
          <button onClick={handleImport} disabled={!vaultPath || busy === "import"}><FileInput size={16} />导入到 inbox</button>
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
              <h2>Pipeline 状态</h2>
              <span>{busy ? `running: ${busy}` : "idle"}</span>
            </div>
            <ol className="pipeline">
              {pipeline.map((stage, index) => (
                <li key={stage}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                  <em>{index === 0 && (status?.counts.inbox ?? 0) > 0 ? "ready" : "runtime gated"}</em>
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
              <h2>Evidence / Review 摘要</h2>
              <ShieldCheck size={18} />
            </div>
            <ul className="review-list">
              <li>Claims total: <strong>{status?.counts.claims ?? 0}</strong></li>
              <li>Claims needing review: <strong>{status?.counts.claimsNeedingReview ?? 0}</strong></li>
              <li>Science review queue: <strong>{status?.counts.scienceReviewQueue ?? 0}</strong></li>
              <li>Growth queue: <strong>{status?.counts.growthQueue ?? 0}</strong></li>
            </ul>
            <p className="note">审核决策必须进入 runtime 的 queue/report/log，不允许只存在 UI 状态里。</p>
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
