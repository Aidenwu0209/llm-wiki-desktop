import { useMemo, useState } from "react";
import {
  ClipboardCopy,
  FileInput,
  FileText,
  FolderOpen,
  ListChecks,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareStack,
} from "lucide-react";
import type {
  ArtifactContractSummary,
  ClaimLedgerItem,
  DesktopRegistryEntry,
  EvidencePathItem,
  ImportPreview,
  IngestPlan,
  IngestPlanEntry,
  TraceabilityWarning,
  VaultFile,
  VaultStatus,
} from "../../types";
import type { UiLanguage } from "../../i18n";

type RawSourceRecord = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  sourceId?: string | null;
  sourceUuid?: string | null;
  updated?: string | null;
  path: string;
  rawPath?: string | null;
  canonicalPath?: string | null;
  sourcePage?: string | null;
  artifactPath?: string | null;
  hash?: string | null;
  artifactHash?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  registry?: DesktopRegistryEntry;
  file?: VaultFile;
  artifact?: ArtifactContractSummary;
  linkedClaims: ClaimLedgerItem[];
  linkedConcepts: string[];
  warnings: TraceabilityWarning[];
  evidencePaths: EvidencePathItem[];
  traceabilityStatus: string;
};

type RawSourcesWorkspaceProps = {
  className?: string;
  language?: UiLanguage;
  vaultPath: string;
  status: VaultStatus | null;
  registry: DesktopRegistryEntry[];
  artifacts: ArtifactContractSummary[];
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  traceabilityWarnings: TraceabilityWarning[];
  ingestPlan: IngestPlan | null;
  importResults: ImportPreview[];
  preserveFolders: boolean;
  busy: string | null;
  onPreserveFoldersChange: (value: boolean) => void;
  onRefresh: () => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onPlanIngest: () => void;
  onOpenPath: (path: string) => void | Promise<void>;
  onRevealPath: (path: string) => void | Promise<void>;
  onOpenVaultItem: (path?: string | null) => void | Promise<void>;
  onCopyText: (label: string, text?: string | null) => void | Promise<void>;
  resolveVaultPath: (path?: string | null) => string;
};

const rawCopy = {
  zh: {
    title: "原始资料",
    loaded: (count: number) => `已从知识库状态和资料登记表加载 ${count} 条原始资料记录。`,
    emptyVault: "打开一个已生成的知识库来检查原始资料。",
    refresh: "刷新",
    import: "导入",
    folder: "文件夹",
    plan: "规划",
    planBoundary: "Refresh / Plan 只生成状态、影响和下一步；不会后台解析、联网、删除资料页或清理概念页。",
    preserve: "保留目录",
    sources: "资料",
    filter: "筛选资料 ID、文件、解析器、状态",
    noMatch: "没有匹配的原始资料。",
    preview: "预览 / 解析产物",
    noSelected: "未选择原始资料",
    noSelectedBody: "导入文件、刷新知识库，或运行导入规划来填充原始资料记录。",
    type: "类型",
    sourceId: "资料 ID",
    claims: "论断",
    concepts: "概念",
    traceability: "可追踪性",
    updated: "更新时间",
    artifactContract: "解析产物合约",
    needsReview: "需审核",
    noArtifact: "还没有关联的解析产物",
    noArtifactBody: "运行导入规划或解析流程来关联解析产物合约、分块和解析器元数据。",
    linkedClaims: "关联论断",
    linkedConcepts: "关联概念",
    noClaims: "没有论断台账关联。",
    noConcepts: "没有概念关联。",
    details: "详情",
    selectDetails: "选择一条资料来检查路径、哈希、解析器、解析产物和链接。",
    path: "路径",
    rawPath: "原始路径",
    sourcePage: "资料页面",
    hash: "哈希",
    parser: "解析器",
    artifact: "解析产物",
    artifactHash: "产物哈希",
    planState: "规划状态",
    aliases: "ID alias / migration",
    matchReason: "匹配原因",
    signals: "证据",
    nextAction: "下一步",
    command: "命令",
    inputs: "输入",
    outputs: "输出",
    lastLog: "最近日志",
    approval: "人工确认",
    network: "网络/API",
    required: "需要",
    notRequired: "不需要",
    enabled: "会使用",
    disabled: "不使用",
    complete: "该资料关联的证据路径当前完整。",
    manifest: "清单",
    chunks: "分块",
    parseLog: "解析日志",
    schema: "结构版本",
    anchors: "锚点",
    pages: "页面",
    tables: "表格",
    figures: "图像",
    yes: "有",
    no: "无",
    valid: "有效",
    empty: "空",
    missing: "缺失",
    unknown: "未知",
    noSourceId: "无资料 ID",
    notUpdated: "未更新",
    registryIssue: "登记表提示",
    recentImportResults: (count: number) => `上次导入后有 ${count} 条导入结果。`,
    actions: { open: "打开", reveal: "显示", copyPath: "复制路径", obsidian: "Obsidian" },
  },
  en: {
    title: "Raw Sources",
    loaded: (count: number) => `${count} raw/source records loaded from vault state and source registry.`,
    emptyVault: "Open a generated vault to inspect raw sources.",
    refresh: "Refresh",
    import: "Import",
    folder: "Folder",
    plan: "Plan",
    planBoundary: "Refresh / Plan only produces state, impact, and next actions; it does not parse in the background, call the network, delete source pages, or clean concept pages.",
    preserve: "preserve folders",
    sources: "Sources",
    filter: "Filter source id, file, parser, status",
    noMatch: "No raw sources match this filter.",
    preview: "Preview / Artifact",
    noSelected: "No raw source selected",
    noSelectedBody: "Import files, refresh the vault, or run ingest planning to populate raw source records.",
    type: "Type",
    sourceId: "Source ID",
    claims: "Claims",
    concepts: "Concepts",
    traceability: "Traceability",
    updated: "Updated",
    artifactContract: "Artifact contract",
    needsReview: "needs review",
    noArtifact: "No parsed artifact linked yet",
    noArtifactBody: "Run ingest planning or parsing to attach artifact contracts, chunks, and parser metadata.",
    linkedClaims: "Linked claims",
    linkedConcepts: "Linked concepts",
    noClaims: "No claim ledger links.",
    noConcepts: "No concept links.",
    details: "Details",
    selectDetails: "Select a source to inspect path, hashes, parser, artifacts, and links.",
    path: "Path",
    rawPath: "Raw path",
    sourcePage: "Source page",
    hash: "Hash",
    parser: "Parser",
    artifact: "Artifact",
    artifactHash: "Artifact hash",
    planState: "Plan state",
    aliases: "ID aliases / migrations",
    matchReason: "Match reason",
    signals: "Signals",
    nextAction: "Next action",
    command: "Command",
    inputs: "Inputs",
    outputs: "Outputs",
    lastLog: "Last log",
    approval: "Human approval",
    network: "Network/API",
    required: "required",
    notRequired: "not required",
    enabled: "used",
    disabled: "not used",
    complete: "Evidence paths linked to this source are currently complete.",
    manifest: "manifest",
    chunks: "chunks",
    parseLog: "parse log",
    schema: "Schema",
    anchors: "Anchors",
    pages: "pages",
    tables: "tables",
    figures: "figures",
    yes: "yes",
    no: "no",
    valid: "valid",
    empty: "empty",
    missing: "missing",
    unknown: "unknown",
    noSourceId: "no source id",
    notUpdated: "not updated",
    registryIssue: "Registry issue",
    recentImportResults: (count: number) => `${count} recent import results are available after the last import.`,
    actions: { open: "open", reveal: "reveal", copyPath: "copy path", obsidian: "Obsidian" },
  },
} as const;

type SourceIdentity = Pick<RawSourceRecord, "sourceId" | "sourceUuid" | "path" | "rawPath" | "canonicalPath" | "sourcePage" | "artifactPath">;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function basename(path?: string | null) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function extension(path?: string | null) {
  const name = basename(path);
  const match = name.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function compact(value?: string | null, fallback = "unknown") {
  return value && value.trim() ? value : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item && item.trim()))));
}

function normalizeVaultPath(path?: string | null, vaultPath?: string | null) {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\.\//, "");
  const vault = vaultPath?.replace(/\\/g, "/").replace(/\/+$/, "");
  if (vault && normalized === vault) return "";
  if (vault && normalized.startsWith(`${vault}/`)) return normalized.slice(vault.length + 1);
  return normalized;
}

function samePath(a?: string | null, b?: string | null, vaultPath?: string | null) {
  if (!a || !b) return false;
  return a === b || normalizeVaultPath(a, vaultPath) === normalizeVaultPath(b, vaultPath);
}

function isMarkdown(path?: string | null) {
  return Boolean(path && /\.(md|markdown)$/i.test(path));
}

function recordMatchesValue(record: SourceIdentity, value?: string | null, vaultPath?: string | null) {
  if (!value) return false;
  if ([record.sourceId, record.sourceUuid].some((candidate) => candidate && candidate === value)) return true;
  return [record.path, record.rawPath, record.canonicalPath, record.sourcePage, record.artifactPath].some((candidate) =>
    samePath(candidate, value, vaultPath),
  );
}

function fileMatchesRegistry(file: VaultFile, entry: DesktopRegistryEntry, vaultPath?: string | null) {
  return [
    entry.sourcePage,
    entry.sourcePath,
    entry.rawPath,
    entry.canonicalPath,
    entry.artifactPath,
  ].some((path) => samePath(file.path, path, vaultPath));
}

function artifactMatches(record: SourceIdentity, artifact: ArtifactContractSummary, vaultPath?: string | null) {
  return (
    Boolean(artifact.sourceUuid && record.sourceUuid && artifact.sourceUuid === record.sourceUuid) ||
    Boolean(artifact.sourceId && record.sourceId && artifact.sourceId === record.sourceId) ||
    samePath(artifact.sourcePath, record.path, vaultPath) ||
    samePath(artifact.sourcePath, record.rawPath, vaultPath) ||
    samePath(artifact.sourcePath, record.sourcePage, vaultPath) ||
    samePath(artifact.artifactPath, record.artifactPath, vaultPath)
  );
}

function planEntryMatchesRecord(record: RawSourceRecord, entry: IngestPlanEntry, vaultPath?: string | null) {
  return (
    Boolean(record.hash && entry.sha256 === record.hash) ||
    Boolean(record.artifactHash && entry.artifactSha256 && entry.artifactSha256 === record.artifactHash) ||
    [record.path, record.rawPath, record.canonicalPath, record.sourcePage].some((path) => samePath(path, entry.sourcePath, vaultPath)) ||
    samePath(record.artifactPath, entry.artifactPath, vaultPath)
  );
}

function sourceAliasMatchesRecord(record: RawSourceRecord, alias: IngestPlan["sourceAliases"][number], vaultPath?: string | null) {
  return (
    Boolean(record.sourceId && alias.sourceId === record.sourceId) ||
    Boolean(record.sourceUuid && [alias.oldSourceUuid, alias.newSourceUuid].includes(record.sourceUuid)) ||
    [record.path, record.rawPath, record.canonicalPath, record.sourcePage].some((path) =>
      samePath(path, alias.oldSourcePath, vaultPath) || samePath(path, alias.newSourcePath, vaultPath),
    )
  );
}

function hydrateRecord(
  base: Omit<RawSourceRecord, "linkedClaims" | "linkedConcepts" | "warnings" | "evidencePaths" | "traceabilityStatus" | "artifact">,
  artifacts: ArtifactContractSummary[],
  claims: ClaimLedgerItem[],
  evidencePaths: EvidencePathItem[],
  traceabilityWarnings: TraceabilityWarning[],
  vaultPath?: string | null,
): RawSourceRecord {
  const artifact = artifacts.find((item) => artifactMatches(base, item, vaultPath));
  const withArtifact = {
    ...base,
    artifact,
    artifactPath: base.artifactPath || artifact?.artifactPath,
    artifactHash: base.artifactHash || artifact?.artifactSha256,
    parser: base.parser || artifact?.parser,
    parserVersion: base.parserVersion || artifact?.parserVersion,
  };

  const linkedClaims = claims.filter((claim) =>
    recordMatchesValue(withArtifact, claim.sourceId, vaultPath) ||
    recordMatchesValue(withArtifact, claim.sourceUuid, vaultPath) ||
    recordMatchesValue(withArtifact, claim.sourcePath, vaultPath),
  );
  const claimIds = new Set(linkedClaims.map((claim) => claim.claimId));
  const linkedEvidence = evidencePaths.filter((item) =>
    claimIds.has(item.claimId) ||
    recordMatchesValue(withArtifact, item.sourceId, vaultPath) ||
    recordMatchesValue(withArtifact, item.sourceUuid, vaultPath) ||
    recordMatchesValue(withArtifact, item.sourcePage, vaultPath) ||
    recordMatchesValue(withArtifact, item.rawPath, vaultPath) ||
    recordMatchesValue(withArtifact, item.artifactPath, vaultPath),
  );
  const warnings = traceabilityWarnings.filter((warning) =>
    claimIds.has(warning.claimId) ||
    recordMatchesValue(withArtifact, warning.sourceId, vaultPath) ||
    recordMatchesValue(withArtifact, warning.sourcePath, vaultPath) ||
    recordMatchesValue(withArtifact, warning.artifactPath, vaultPath),
  );
  const linkedConcepts = uniqueStrings([
    ...linkedClaims.flatMap((claim) => claim.concepts),
    ...linkedEvidence.map((item) => item.concept),
  ]);
  const brokenEvidence = linkedEvidence.some((item) => item.chainStatus !== "ok");
  const traceabilityStatus = warnings[0]?.severity || (brokenEvidence ? "broken" : linkedEvidence.length || linkedClaims.length ? "ok" : "unknown");

  return {
    ...withArtifact,
    linkedClaims,
    linkedConcepts,
    warnings,
    evidencePaths: linkedEvidence,
    traceabilityStatus,
  };
}

function buildRawSourceRecords(input: {
  vaultPath?: string | null;
  status: VaultStatus | null;
  registry: DesktopRegistryEntry[];
  artifacts: ArtifactContractSummary[];
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  traceabilityWarnings: TraceabilityWarning[];
}) {
  const files = input.status?.files ?? [];
  const sourceFiles = files.filter((file) => ["inbox", "source", "draft"].includes(file.kind));
  const records = new Map<string, Omit<RawSourceRecord, "linkedClaims" | "linkedConcepts" | "warnings" | "evidencePaths" | "traceabilityStatus" | "artifact">>();

  for (const entry of input.registry) {
    const file = sourceFiles.find((item) => fileMatchesRegistry(item, entry, input.vaultPath));
    const path = entry.sourcePage || entry.sourcePath || entry.rawPath || entry.canonicalPath || file?.path || "";
    const id = entry.sourceUuid || entry.sourceId || path;
    records.set(id, {
      id,
      fileName: basename(entry.rawPath || entry.sourcePath || entry.sourcePage || file?.name || path) || entry.sourceId || entry.sourceUuid,
      type: entry.mime || extension(entry.rawPath || entry.sourcePath || path) || file?.kind || "source",
      status: entry.status || file?.status || "registered",
      sourceId: entry.sourceId,
      sourceUuid: entry.sourceUuid,
      updated: entry.updatedAt || entry.publishedAt || file?.updated || entry.createdAt,
      path,
      rawPath: entry.rawPath,
      canonicalPath: entry.canonicalPath,
      sourcePage: entry.sourcePage || file?.path,
      artifactPath: entry.artifactPath,
      hash: entry.sourceSha256,
      artifactHash: entry.artifactSha256,
      parser: entry.parser,
      parserVersion: entry.parserVersion,
      registry: entry,
      file,
    });
  }

  for (const file of sourceFiles) {
    const alreadyRegistered = Array.from(records.values()).some((record) =>
      samePath(record.path, file.path, input.vaultPath) ||
      samePath(record.sourcePage, file.path, input.vaultPath) ||
      samePath(record.rawPath, file.path, input.vaultPath) ||
      samePath(record.canonicalPath, file.path, input.vaultPath),
    );
    if (alreadyRegistered) continue;
    records.set(`file:${file.path}`, {
      id: `file:${file.path}`,
      fileName: file.name || basename(file.path),
      type: file.kind,
      status: file.status || (file.needsReview ? "needs_review" : "unregistered"),
      sourceId: null,
      sourceUuid: null,
      updated: file.updated,
      path: file.path,
      sourcePage: file.kind === "source" || file.kind === "draft" ? file.path : null,
      hash: null,
      artifactHash: null,
      parser: file.qaVerdict,
      parserVersion: null,
      file,
    });
  }

  return Array.from(records.values())
    .map((record) => hydrateRecord(record, input.artifacts, input.claims, input.evidencePaths, input.traceabilityWarnings, input.vaultPath))
    .sort((a, b) => {
      const statusRank = Number(b.traceabilityStatus !== "ok") - Number(a.traceabilityStatus !== "ok");
      if (statusRank !== 0) return statusRank;
      return (b.updated || "").localeCompare(a.updated || "") || a.fileName.localeCompare(b.fileName);
    });
}

function SourceActions({
  record,
  text,
  resolveVaultPath,
  onOpenPath,
  onRevealPath,
  onOpenVaultItem,
  onCopyText,
}: {
  record: RawSourceRecord;
  text: (typeof rawCopy)[UiLanguage]["actions"];
  resolveVaultPath: (path?: string | null) => string;
  onOpenPath: (path: string) => void | Promise<void>;
  onRevealPath: (path: string) => void | Promise<void>;
  onOpenVaultItem: (path?: string | null) => void | Promise<void>;
  onCopyText: (label: string, text?: string | null) => void | Promise<void>;
}) {
  const primaryPath = record.path || record.sourcePage || record.rawPath;
  const obsidianPath = record.sourcePage || (isMarkdown(record.path) ? record.path : null);
  return (
    <div className="raw-source-actions">
      <button type="button" disabled={!primaryPath} onClick={() => primaryPath && onOpenPath(resolveVaultPath(primaryPath))}>
        <FolderOpen size={14} />{text.open}
      </button>
      <button type="button" disabled={!primaryPath} onClick={() => primaryPath && onRevealPath(resolveVaultPath(primaryPath))}>
        <Search size={14} />{text.reveal}
      </button>
      <button type="button" disabled={!primaryPath} onClick={() => onCopyText("source path", resolveVaultPath(primaryPath))}>
        <ClipboardCopy size={14} />{text.copyPath}
      </button>
      <button type="button" disabled={!obsidianPath} onClick={() => onOpenVaultItem(obsidianPath)}>
        <SquareStack size={14} />{text.obsidian}
      </button>
    </div>
  );
}

export function RawSourcesWorkspace({
  className,
  language = "zh",
  vaultPath,
  status,
  registry,
  artifacts,
  claims,
  evidencePaths,
  traceabilityWarnings,
  ingestPlan,
  importResults,
  preserveFolders,
  busy,
  onPreserveFoldersChange,
  onRefresh,
  onImportFiles,
  onImportFolder,
  onPlanIngest,
  onOpenPath,
  onRevealPath,
  onOpenVaultItem,
  onCopyText,
  resolveVaultPath,
}: RawSourcesWorkspaceProps) {
  const text = rawCopy[language];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const records = useMemo(
    () => buildRawSourceRecords({ vaultPath, status, registry, artifacts, claims, evidencePaths, traceabilityWarnings }),
    [artifacts, claims, evidencePaths, registry, status, traceabilityWarnings, vaultPath],
  );
  const filteredRecords = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      [
        record.fileName,
        record.type,
        record.status,
        record.sourceId,
        record.sourceUuid,
        record.path,
        record.rawPath,
        record.sourcePage,
        record.artifactPath,
        record.parser,
        record.traceabilityStatus,
      ].join(" ").toLowerCase().includes(query),
    );
  }, [filter, records]);
  const selected = filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0] || null;
  const artifact = selected?.artifact;
  const selectedPlanEntry = useMemo(
    () => (selected ? ingestPlan?.entries.find((entry) => planEntryMatchesRecord(selected, entry, vaultPath)) ?? null : null),
    [ingestPlan?.entries, selected, vaultPath],
  );
  const selectedAliases = useMemo(
    () => (selected ? ingestPlan?.sourceAliases.filter((alias) => sourceAliasMatchesRecord(selected, alias, vaultPath)) ?? [] : []),
    [ingestPlan?.sourceAliases, selected, vaultPath],
  );
  const selectedBrokenEvidence = selected?.evidencePaths.some((item) => item.chainStatus !== "ok") ?? false;

  return (
    <section className={classNames("raw-sources-workspace", className)}>
      <div className="raw-sources-header">
        <div>
          <h2>{text.title}</h2>
          <p>{vaultPath ? text.loaded(records.length) : text.emptyVault}</p>
          <p className="workflow-hint">{text.planBoundary}</p>
        </div>
        <div className="raw-sources-toolbar">
          <button type="button" onClick={onRefresh} disabled={!vaultPath || busy === "inspect"}>
            <RefreshCw size={15} />{text.refresh}
          </button>
          <button type="button" onClick={onImportFiles} disabled={!vaultPath || busy === "import"}>
            <FileInput size={15} />{text.import}
          </button>
          <button type="button" onClick={onImportFolder} disabled={!vaultPath || busy === "import"}>
            <FolderOpen size={15} />{text.folder}
          </button>
          <button type="button" onClick={onPlanIngest} disabled={!vaultPath || busy === "plan_ingest"}>
            <ListChecks size={15} />{text.plan}
          </button>
          <label className="check-row">
            <input type="checkbox" checked={preserveFolders} onChange={(event) => onPreserveFoldersChange(event.target.checked)} />
            {text.preserve}
          </label>
        </div>
      </div>

      <div className="raw-sources-layout">
        <aside className="raw-source-list panel">
          <div className="section-head">
            <h3>{text.sources}</h3>
            <span>{filteredRecords.length}/{records.length}</span>
          </div>
          <label className="raw-source-filter">
            <Search size={14} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={text.filter} />
          </label>
          <div className="raw-source-list-body">
            {filteredRecords.length === 0 && <p className="empty">{text.noMatch}</p>}
            {filteredRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                className={classNames("raw-source-row", selected?.id === record.id && "selected")}
                onClick={() => setSelectedId(record.id)}
              >
                <span className={classNames("status-chip inline", record.traceabilityStatus || record.status)}>{record.traceabilityStatus}</span>
                <strong>{record.fileName}</strong>
                <em>{record.type} · {record.status}</em>
                <code>{record.sourceId || record.sourceUuid || text.noSourceId} · {record.updated || text.notUpdated}</code>
              </button>
            ))}
          </div>
        </aside>

        <main className="raw-source-preview panel">
          <div className="section-head">
            <h3>{selected ? text.preview : text.preview.split(" / ")[0]}</h3>
            <span>{selected?.status || text.empty}</span>
          </div>

          {!selected && (
            <div className="raw-source-empty">
              <FileText size={24} />
              <strong>{text.noSelected}</strong>
              <p>{text.noSelectedBody}</p>
              {importResults.length > 0 && <code>{text.recentImportResults(importResults.length)}</code>}
            </div>
          )}

          {selected && (
            <div className="raw-source-preview-body">
              <div className="raw-source-title">
                <span className={classNames("status-chip inline", selected.status)}>{selected.status}</span>
                <h3>{selected.fileName}</h3>
                <p>{selected.path}</p>
              </div>

              <div className="raw-source-summary-grid">
                <div><span>{text.type}</span><strong>{selected.type}</strong></div>
                <div><span>{text.sourceId}</span><strong>{selected.sourceId || selected.sourceUuid || text.missing}</strong></div>
                <div><span>{text.claims}</span><strong>{selected.linkedClaims.length}</strong></div>
                <div><span>{text.concepts}</span><strong>{selected.linkedConcepts.length}</strong></div>
                <div><span>{text.traceability}</span><strong>{selected.traceabilityStatus}</strong></div>
                <div><span>{text.updated}</span><strong>{selected.updated || "unknown"}</strong></div>
              </div>

              {artifact ? (
                <div className="artifact-card">
                  <div className="section-head compact">
                    <h3><ShieldCheck size={15} /> {text.artifactContract}</h3>
                    <span>{artifact.contractValid ? text.valid : text.needsReview}</span>
                  </div>
                  <dl className="raw-source-facts">
                    <div><dt>{text.artifact}</dt><dd>{artifact.artifactPath}</dd></div>
                    <div><dt>{text.parser}</dt><dd>{compact(artifact.parser)} {artifact.parserVersion || ""}</dd></div>
                    <div><dt>{text.schema}</dt><dd>{compact(artifact.schemaVersion)}</dd></div>
                    <div><dt>{text.chunks}</dt><dd>{artifact.chunkCount}</dd></div>
                    <div><dt>{text.anchors}</dt><dd>{text.pages} {artifact.anchorsPages ? text.yes : text.no} · {text.tables} {artifact.anchorsTables ? text.yes : text.no} · {text.figures} {artifact.anchorsFigures ? text.yes : text.no}</dd></div>
                  </dl>
                  {(artifact.limitations.length > 0 || artifact.lintErrors.length > 0) && (
                    <div className="raw-source-notes">
                      {[...artifact.limitations, ...artifact.lintErrors].slice(0, 5).map((item) => <code key={item}>{item}</code>)}
                    </div>
                  )}
                  <div className="raw-source-actions">
                    <button type="button" onClick={() => onOpenPath(resolveVaultPath(artifact.artifactPath))}>
                      <FileInput size={14} />{text.artifact}
                    </button>
                    <button type="button" disabled={!artifact.manifestPath} onClick={() => artifact.manifestPath && onOpenPath(resolveVaultPath(artifact.manifestPath))}>
                      <FileText size={14} />{text.manifest}
                    </button>
                    <button type="button" disabled={!artifact.chunksPath} onClick={() => artifact.chunksPath && onOpenPath(resolveVaultPath(artifact.chunksPath))}>
                      <ListChecks size={14} />{text.chunks}
                    </button>
                    <button type="button" disabled={!artifact.parseLogPath} onClick={() => artifact.parseLogPath && onOpenPath(resolveVaultPath(artifact.parseLogPath))}>
                      <Search size={14} />{text.parseLog}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="raw-source-empty compact">
                  <FileText size={20} />
                  <strong>{text.noArtifact}</strong>
                  <p>{text.noArtifactBody}</p>
                </div>
              )}

              <div className="linked-objects">
                <div>
                  <strong>{text.linkedClaims}</strong>
                  {selected.linkedClaims.length === 0 && <p className="empty">{text.noClaims}</p>}
                  {selected.linkedClaims.slice(0, 6).map((claim) => (
                    <button type="button" key={claim.claimId} onClick={() => onCopyText("claim id", claim.claimId)}>
                      <span className={classNames("status-chip inline", claim.verdict)}>{claim.verdict}</span>
                      <strong>{claim.claimId}</strong>
                      <em>{claim.claimText}</em>
                    </button>
                  ))}
                </div>
                <div>
                  <strong>{text.linkedConcepts}</strong>
                  {selected.linkedConcepts.length === 0 && <p className="empty">{text.noConcepts}</p>}
                  {selected.linkedConcepts.slice(0, 10).map((concept) => <code key={concept}>{concept}</code>)}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="raw-source-details panel">
          <div className="section-head">
            <h3>{text.details}</h3>
            <span>{selected?.traceabilityStatus || text.empty}</span>
          </div>

          {!selected && <p className="empty">{text.selectDetails}</p>}

          {selected && (
            <div className="raw-source-details-body">
              <details className="raw-source-detail-section" open>
                <summary>
                  <strong>{text.details}</strong>
                  <span>{selected.sourceId || selected.sourceUuid || selected.fileName}</span>
                </summary>
                <dl className="raw-source-facts">
                  <div><dt>{text.path}</dt><dd>{selected.path}</dd></div>
                  <div><dt>{text.rawPath}</dt><dd>{compact(selected.rawPath)}</dd></div>
                  <div><dt>{text.sourcePage}</dt><dd>{compact(selected.sourcePage)}</dd></div>
                  <div><dt>{text.hash}</dt><dd>{compact(selected.hash)}</dd></div>
                  <div><dt>{text.parser}</dt><dd>{compact(selected.parser)} {selected.parserVersion || ""}</dd></div>
                  <div><dt>{text.artifact}</dt><dd>{compact(selected.artifactPath)}</dd></div>
                  <div><dt>{text.artifactHash}</dt><dd>{compact(selected.artifactHash)}</dd></div>
                  <div><dt>{text.traceability}</dt><dd>{selected.traceabilityStatus}</dd></div>
                </dl>
                {selected.registry?.lastError && (
                  <div className="raw-source-notes">
                    <strong>{text.registryIssue}</strong>
                    <code>{selected.registry.lastError}</code>
                  </div>
                )}

                <SourceActions
                  record={selected}
                  text={text.actions}
                  resolveVaultPath={resolveVaultPath}
                  onOpenPath={onOpenPath}
                  onRevealPath={onRevealPath}
                  onOpenVaultItem={onOpenVaultItem}
                  onCopyText={onCopyText}
                />
              </details>

              {selectedPlanEntry && (
                <details className="raw-source-detail-section" open>
                  <summary>
                    <strong>{text.planState}</strong>
                    <span>{selectedPlanEntry.currentState}</span>
                  </summary>
                  <dl className="raw-source-facts">
                    <div><dt>{text.planState}</dt><dd>{selectedPlanEntry.currentState}</dd></div>
                    <div><dt>{text.nextAction}</dt><dd>{selectedPlanEntry.nextActionLabel || selectedPlanEntry.action}</dd></div>
                    <div><dt>{text.command}</dt><dd>{selectedPlanEntry.command.length ? selectedPlanEntry.command.join(" ") : selectedPlanEntry.action}</dd></div>
                    <div><dt>{text.approval}</dt><dd>{selectedPlanEntry.requiresHumanApproval ? text.required : text.notRequired}</dd></div>
                    <div><dt>{text.network}</dt><dd>{selectedPlanEntry.usesNetwork ? text.enabled : text.disabled}</dd></div>
                    <div><dt>{text.hash}</dt><dd>{compact(selectedPlanEntry.sha256)}</dd></div>
                    <div><dt>{text.artifactHash}</dt><dd>{compact(selectedPlanEntry.artifactSha256)}</dd></div>
                    <div><dt>{text.lastLog}</dt><dd>{compact(selectedPlanEntry.lastLogPath)}</dd></div>
                  </dl>
                  <div className="raw-source-notes">
                    <strong>{text.inputs}</strong>
                    {(selectedPlanEntry.inputs.length ? selectedPlanEntry.inputs : [selectedPlanEntry.sourcePath]).map((item) => <code key={`plan-input-${item}`}>{item}</code>)}
                    <strong>{text.outputs}</strong>
                    {(selectedPlanEntry.outputs.length ? selectedPlanEntry.outputs : [selectedPlanEntry.artifactPath || text.missing]).map((item) => <code key={`plan-output-${item}`}>{item}</code>)}
                  </div>
                  <div className="raw-source-actions">
                    <button type="button" disabled={!selectedPlanEntry.lastLogPath} onClick={() => selectedPlanEntry.lastLogPath && onOpenPath(resolveVaultPath(selectedPlanEntry.lastLogPath))}>
                      <Search size={14} />{text.lastLog}
                    </button>
                    <button type="button" onClick={() => onCopyText("ingest command", selectedPlanEntry.command.join(" "))}>
                      <ClipboardCopy size={14} />{text.command}
                    </button>
                  </div>
                </details>
              )}

              {selectedAliases.length > 0 && (
                <details className="raw-source-detail-section" open>
                  <summary>
                    <strong>{text.aliases}</strong>
                    <span>{selectedAliases.length}</span>
                  </summary>
                  {selectedAliases.map((alias) => (
                    <div className="trace-warning-row" key={alias.aliasId}>
                      <span className={classNames("status-chip inline", alias.needsReview ? "blocked" : "published")}>{alias.status}</span>
                      <strong>{alias.sourceId || alias.newSourceUuid}</strong>
                      <em>{alias.matchReason} · {alias.oldSourcePath || text.missing}{" -> "}{alias.newSourcePath}</em>
                      <code>{alias.signals.join(" · ")}</code>
                    </div>
                  ))}
                </details>
              )}

              <details className="raw-source-detail-section traceability-detail" open={selected.warnings.length > 0 || selectedBrokenEvidence}>
                <summary>
                  <strong>{text.traceability}</strong>
                  <span>{selected.traceabilityStatus}</span>
                </summary>
                {selected.warnings.length === 0 && selected.evidencePaths.every((item) => item.chainStatus === "ok") && (
                  <p>{text.complete}</p>
                )}
                {selected.warnings.map((warning) => (
                  <div className="trace-warning-row" key={warning.warningId}>
                    <span className={classNames("status-chip inline", warning.severity)}>{warning.severity}</span>
                    <strong>{warning.summary}</strong>
                    <em>{warning.missingAnchor || warning.missingHeading}</em>
                    <code>{warning.suggestedAction || warning.nextAction}</code>
                  </div>
                ))}
                {selected.warnings.length === 0 && selected.evidencePaths.filter((item) => item.chainStatus !== "ok").map((item) => (
                  <div className="trace-warning-row" key={`${item.claimId}-${item.chainStatus}`}>
                    <span className={classNames("status-chip inline", item.chainStatus)}>{item.chainStatus}</span>
                    <strong>{item.claimId}</strong>
                    <em>{item.evidenceAnchor || "missing anchor"}</em>
                    <code>{item.missing.join(", ") || "needs review"}</code>
                  </div>
                ))}
              </details>

              <details className="raw-source-detail-section raw-source-detail-links">
                <summary>
                  <strong>{text.linkedClaims}</strong>
                  <span>{selected.linkedClaims.length}</span>
                </summary>
                {selected.linkedClaims.length === 0 && <p className="empty">{text.noClaims}</p>}
                {selected.linkedClaims.slice(0, 5).map((claim) => (
                  <button type="button" key={`detail-${claim.claimId}`} onClick={() => onCopyText("claim id", claim.claimId)}>
                    <span className={classNames("status-chip inline", claim.verdict)}>{claim.verdict}</span>
                    <strong>{claim.claimId}</strong>
                    <em>{claim.claimText}</em>
                  </button>
                ))}
              </details>

              <details className="raw-source-detail-section raw-source-detail-links">
                <summary>
                  <strong>{text.linkedConcepts}</strong>
                  <span>{selected.linkedConcepts.length}</span>
                </summary>
                {selected.linkedConcepts.length === 0 && <p className="empty">{text.noConcepts}</p>}
                {selected.linkedConcepts.slice(0, 8).map((concept) => <code key={`detail-${concept}`}>{concept}</code>)}
              </details>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
