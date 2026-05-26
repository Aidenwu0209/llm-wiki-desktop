import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Database,
  FileInput,
  GitCompare,
  ListChecks,
  Play,
  Settings,
  ShieldCheck,
  SquareStack,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import type {
  ContractFinding,
  DesktopSettings,
  IngestPlan,
  ReadingQualitySummary,
  TraceabilityWarning,
  VaultEntryNote,
  VaultStatus,
  WritebackProposal,
} from "../../types";
import type { UiLanguage } from "../../i18n";

type ReadinessTone = "ok" | "warn" | "danger" | "idle";

type DashboardOverviewProps = {
  className?: string;
  language?: UiLanguage;
  vaultPath: string;
  status: VaultStatus | null;
  desktopSettings: DesktopSettings;
  ingestPlan: IngestPlan | null;
  writebacks: WritebackProposal[];
  traceabilityWarnings: TraceabilityWarning[];
  lintFindings: ContractFinding[];
  entryNote: VaultEntryNote | null;
  brokenEvidence: number;
  openReviewCount: number;
  runtimeRunning: boolean;
  runtimeHistoryCount: number;
  busy: string | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenSources: () => void;
  onOpenReviews: () => void;
  onOpenTraceability: () => void;
  onOpenWriteback: () => void;
  onOpenActivity: () => void;
  onChooseRuntime: () => void;
  onPlanIngest: () => void;
  onRunLint: () => void;
  onRunPipeline: () => void;
  onOpenObsidian: () => void;
  onRunObsidianSetup: () => void;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function visiblePathPart(part: string) {
  return part.replace(/^ +| +$/g, (match) => "[space]".repeat(match.length));
}

function vaultName(path: string) {
  return visiblePath(path).split("/").filter(Boolean).pop() || visiblePath(path) || "No vault";
}

function whitespacePathParts(path: string) {
  return path
    .split(/[\\/]/)
    .filter(Boolean)
    .filter((part) => part !== part.trim())
    .map(visiblePathPart);
}

const dashboardCopy = {
  zh: {
    currentVault: "当前知识库",
    entry: "入口",
    pending: "待生成",
    runtime: "运行时",
    unknown: "未知",
    parser: "解析器",
    auto: "自动",
    jobs: "任务",
    running: "运行中",
    history: "条历史",
    refresh: "刷新",
    settings: "设置",
    sources: "资料",
    activity: "活动",
    choose: "选择",
    open: "打开",
    setup: "配置",
    runLint: "运行检查",
    reviews: "审核",
    writeback: "写回",
    vault: "知识库",
    schemaValid: "结构有效",
    schemaInvalid: "结构无效",
    inspecting: "检查中",
    refreshInspect: "刷新以检查当前状态",
    updated: "更新于",
    runtimeReady: "可用",
    runtimeMissing: "缺失",
    runtimeDetail: "选择本地 open-llm-wiki 运行时路径",
    obsidian: "Obsidian",
    obsidianConfigured: "已配置",
    obsidianMissing: "未配置",
    obsidianDetail: "首次用户审阅前先运行配置",
    lint: "合约检查",
    blocking: "阻塞项",
    findings: "发现项",
    lintBlockingDetail: "声称就绪前需解决 P0/P1 问题",
    lintDetail: "导入或写回后运行合约检查",
    review: "审核",
    openCount: "未处理",
    clear: "清空",
    reviewDetail: "论断或科学审核项需要人工处理",
    reviewClearDetail: "未检测到未处理审核队列项",
    readingQuality: "阅读质量",
    readingClear: "清晰",
    readingFindings: "发现项",
    readingQualityDetail: "检查重复、孤立概念和证据漂移",
    readingQualityBreakdown: {
      trust: "可信风险",
      duplicates: "重复组",
      orphanConcepts: "孤立概念",
      staleEvidence: "过期证据",
      brokenEvidence: "断裂证据",
      sourceDrift: "source 漂移",
      lowSynthesis: "低合成概念",
      noCategory: "打开阅读质量报告查看具体条目",
    },
    proposed: "待审核",
    total: "总数",
    writebackIssueDetail: "个被拒提案需要清理",
    writebackDetail: "先提案后写回的审批门保持启用",
    actionableStatus: "可处理状态",
    nextActions: "下一步建议",
    ingestReady: "可导入",
    setRuntime: "设置运行时路径",
    setRuntimeDetail: "把桌面端指向本地 open-llm-wiki 运行时。",
    prepareObsidian: "准备 Obsidian",
    prepareObsidianDetail: "创建或修复生成知识库的入口和模板。",
    planIngest: "规划导入",
    planIngestDetail: "把 raw/ 下的原始证据文件转成资料动作和队列状态。",
    runPipeline: "运行处理流程",
    runPipelineDetail: (count: number) => `${count} 个资料可继续通过运行时处理。`,
    fixTraceability: "修复可追踪性",
    fixTraceabilityDetail: "检查缺失锚点、断裂证据路径和合约问题。",
    reviewClaims: "审核论断",
    reviewClaimsDetail: "人工处理科学审核队列和论断结论。",
    reviewWriteback: "审核写回提案",
    reviewWritebackDetail: "应用前检查差异并明确批准。",
    inspectSources: "查看资料",
    inspectSourcesDetail: "打开原始证据、生成资料、概念和报告。",
    runContractLint: "运行合约检查",
    runContractLintDetail: "变更后刷新仪表盘合约健康度。",
    metrics: {
      rawInbox: "原始证据",
      sources: "资料",
      concepts: "概念",
      reports: "报告",
      reviewClaims: "待审论断",
      contradictions: "冲突",
      planReady: "计划就绪",
      stageable: "可入队",
      blocked: "阻塞",
      traceability: "可追踪性",
      readingQuality: "阅读风险",
    },
    messages: {
      pending: "知识库检查尚未完成。如果这里一直为空，请刷新知识库。",
      schemaInvalid: "知识库结构无效。打开合约检查并修复阻塞问题。",
      runtimeMissing: "运行时缺失。请在设置中选择本地 open-llm-wiki 运行时路径。",
      obsidianMissing: "该知识库尚未配置 Obsidian。用户审阅前请先运行 Obsidian 配置。",
      blockingFindings: (count: number) => `${count} 个阻塞性合约检查问题需要审核。`,
      pathWhitespace: (parts: string) => `路径组件包含首尾空格：${parts}。跨设备同步、Obsidian 打开或发布验证前建议迁移到无首尾空格路径。`,
      traceabilityIssues: (count: number) => `${count} 个可追踪性问题需要跟进资料或论断。`,
      readingQualityIssues: (count: number) => `${count} 个阅读质量问题需要检查 source/concept 重复、漂移或过期证据。`,
      writebackWaiting: (count: number) => `${count} 个写回提案等待明确审核。`,
      clear: "核心桌面检查清晰。可以从下方卡片继续导入、审核或问答写回。",
    },
  },
  en: {
    currentVault: "Current vault",
    entry: "Entry",
    pending: "pending",
    runtime: "Runtime",
    unknown: "unknown",
    parser: "Parser",
    auto: "auto",
    jobs: "Jobs",
    running: "running",
    history: "history",
    refresh: "Refresh",
    settings: "Settings",
    sources: "Sources",
    activity: "Activity",
    choose: "Choose",
    open: "Open",
    setup: "Setup",
    runLint: "Run lint",
    reviews: "Reviews",
    writeback: "Writeback",
    vault: "Vault",
    schemaValid: "Schema valid",
    schemaInvalid: "Schema invalid",
    inspecting: "Inspecting",
    refreshInspect: "Refresh to inspect current state",
    updated: "Updated",
    runtimeReady: "Ready",
    runtimeMissing: "Missing",
    runtimeDetail: "Select open-llm-wiki runtime path",
    obsidian: "Obsidian",
    obsidianConfigured: "Configured",
    obsidianMissing: "Not configured",
    obsidianDetail: "Run setup before first user review",
    lint: "Lint",
    blocking: "blocking",
    findings: "findings",
    lintBlockingDetail: "Resolve P0/P1 findings before claiming readiness",
    lintDetail: "Run contract lint after ingest or writeback",
    review: "Review",
    openCount: "open",
    clear: "Clear",
    reviewDetail: "Claims or science review items need human attention",
    reviewClearDetail: "No open review queue items detected",
    readingQuality: "Reading quality",
    readingClear: "Clear",
    readingFindings: "findings",
    readingQualityDetail: "Checks duplicates, orphan concepts, and evidence drift",
    readingQualityBreakdown: {
      trust: "trust risks",
      duplicates: "duplicate groups",
      orphanConcepts: "orphan concepts",
      staleEvidence: "stale evidence",
      brokenEvidence: "broken evidence",
      sourceDrift: "source drift",
      lowSynthesis: "low-synthesis concepts",
      noCategory: "Open the reading quality report for item details",
    },
    proposed: "proposed",
    total: "total",
    writebackIssueDetail: "Rejected proposals need cleanup",
    writebackDetail: "Proposal-first gate is preserved",
    actionableStatus: "Actionable status",
    nextActions: "Next suggested actions",
    ingestReady: "ingest-ready",
    setRuntime: "Set runtime path",
    setRuntimeDetail: "Point desktop to the local open-llm-wiki runtime.",
    prepareObsidian: "Prepare Obsidian",
    prepareObsidianDetail: "Create or repair the generated vault entry and templates.",
    planIngest: "Plan ingest",
    planIngestDetail: "Turn raw evidence files into source actions and queue state.",
    runPipeline: "Run pipeline",
    runPipelineDetail: (count: number) => `${count} source${count === 1 ? "" : "s"} can continue through runtime.`,
    fixTraceability: "Fix traceability",
    fixTraceabilityDetail: "Inspect missing anchors, broken evidence paths, and contract findings.",
    reviewClaims: "Review claims",
    reviewClaimsDetail: "Resolve science review queue and claim verdicts manually.",
    reviewWriteback: "Review writeback proposal",
    reviewWritebackDetail: "Inspect diff and approve explicitly before applying.",
    inspectSources: "Inspect sources",
    inspectSourcesDetail: "Open raw evidence, generated sources, concepts, and reports.",
    runContractLint: "Run contract lint",
    runContractLintDetail: "Refresh dashboard contract health after changes.",
    metrics: {
      rawInbox: "Raw evidence",
      sources: "Sources",
      concepts: "Concepts",
      reports: "Reports",
      reviewClaims: "Review claims",
      contradictions: "Contradictions",
      planReady: "Plan ready",
      stageable: "Stageable",
      blocked: "Blocked",
      traceability: "Traceability",
      readingQuality: "Reading risk",
    },
    messages: {
      pending: "Vault inspection is pending. Refresh the vault if this stays empty.",
      schemaInvalid: "Vault schema is invalid. Open contract lint and fix blocking findings.",
      runtimeMissing: "Runtime missing. Select the local open-llm-wiki runtime path in Settings.",
      obsidianMissing: "Obsidian is not configured for this vault. Run Obsidian setup before user-facing review.",
      blockingFindings: (count: number) => `${count} blocking contract lint finding${count === 1 ? "" : "s"} need review.`,
      pathWhitespace: (parts: string) =>
        parts.includes(", ")
          ? `Path components contain leading/trailing spaces: ${parts}. Migrate before sync, Obsidian handoff, or release validation.`
          : `Path component contains leading/trailing spaces: ${parts}. Migrate before sync, Obsidian handoff, or release validation.`,
      traceabilityIssues: (count: number) => `${count} traceability issue${count === 1 ? "" : "s"} need source or claim follow-up.`,
      readingQualityIssues: (count: number) => `${count} reading quality issue${count === 1 ? "" : "s"} need source/concept duplicate, drift, or stale evidence review.`,
      writebackWaiting: (count: number) => `${count} writeback proposal${count === 1 ? "" : "s"} waiting for explicit review.`,
      clear: "Core desktop checks are clear. Continue with ingest, review, or query writeback from the cards below.",
    },
  },
} as const;

function ReadinessCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  action,
  onAction,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
  tone: ReadinessTone;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={classNames("readiness-card", tone)}>
      <div>
        <Icon size={18} />
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
      {action && onAction && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function MiniMetric({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div className={classNames("mini-metric", emphasis && "emphasis")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NextAction({
  icon: Icon,
  title,
  detail,
  tone = "idle",
  disabled,
  onClick,
}: {
  icon: typeof Database;
  title: string;
  detail: string;
  tone?: ReadinessTone;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={classNames("next-action-card", tone)} onClick={onClick} disabled={disabled}>
      <Icon size={17} />
      <span>{title}</span>
      <em>{detail}</em>
    </button>
  );
}

function ingestPlanPriority(entry: IngestPlan["entries"][number]) {
  if (entry.currentState === "parse_required" || entry.currentState === "stale_artifact") return 0;
  if (entry.currentState === "blocked_contract" || entry.status === "blocked") return 1;
  if (entry.currentState === "duplicate" || entry.currentState === "needs_review") return 2;
  if (entry.currentState === "imported" || entry.currentState === "staged") return 3;
  if (entry.currentState === "ingest_ready" || entry.status === "ready") return 4;
  if (entry.currentState === "published") return 9;
  return 5;
}

function topIngestPlanEntry(ingestPlan: IngestPlan | null) {
  return (ingestPlan?.entries ?? [])
    .filter((entry) => entry.currentState !== "published")
    .slice()
    .sort((a, b) => ingestPlanPriority(a) - ingestPlanPriority(b) || a.fileName.localeCompare(b.fileName))[0] ?? null;
}

function readingQualityDetail(
  summary: ReadingQualitySummary | null | undefined,
  text: typeof dashboardCopy.zh | typeof dashboardCopy.en,
) {
  if (!summary?.findings) return text.readingQualityDetail;
  const items = [
    [summary.trustIssues, text.readingQualityBreakdown.trust],
    [summary.duplicateGroups, text.readingQualityBreakdown.duplicates],
    [summary.orphanConcepts, text.readingQualityBreakdown.orphanConcepts],
    [summary.staleEvidenceReferences, text.readingQualityBreakdown.staleEvidence],
    [summary.brokenEvidenceReferences, text.readingQualityBreakdown.brokenEvidence],
    [summary.sourceIdentityDrift, text.readingQualityBreakdown.sourceDrift],
    [summary.lowSynthesisConcepts, text.readingQualityBreakdown.lowSynthesis],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${count} ${label}`);
  return items.slice(0, 4).join(" · ") || text.readingQualityBreakdown.noCategory;
}

export function DashboardOverview({
  className,
  language = "zh",
  vaultPath,
  status,
  desktopSettings,
  ingestPlan,
  writebacks,
  traceabilityWarnings,
  lintFindings,
  entryNote,
  brokenEvidence,
  openReviewCount,
  runtimeRunning,
  runtimeHistoryCount,
  busy,
  onRefresh,
  onOpenSettings,
  onOpenSources,
  onOpenReviews,
  onOpenTraceability,
  onOpenWriteback,
  onOpenActivity,
  onChooseRuntime,
  onPlanIngest,
  onRunLint,
  onRunPipeline,
  onOpenObsidian,
  onRunObsidianSetup,
}: DashboardOverviewProps) {
  const text = dashboardCopy[language];
  const summary = ingestPlan?.summary;
  const parseablePdfs =
    ingestPlan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
  const topPlanEntry = topIngestPlanEntry(ingestPlan);
  const runnableIngest = (summary?.ready ?? 0) + (summary?.stageable ?? 0) + (summary?.cached ?? 0) + parseablePdfs;
  const contractP0P1 = lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length;
  const proposedWritebacks = writebacks.filter((proposal) => proposal.status === "proposed").length;
  const writebackIssues = writebacks.filter((proposal) => proposal.status === "rejected").length;
  const reviewTotal = openReviewCount + (status?.counts.claimsNeedingReview ?? 0);
  const traceabilityTotal = traceabilityWarnings.length + brokenEvidence;
  const readingQualityIssues = status?.readingQuality?.findings ?? 0;
  const readingQualityDetailText = readingQualityDetail(status?.readingQuality, text);
  const vaultErrors = status?.errors ?? [];
  const unsafePathParts = whitespacePathParts(vaultPath);
  const statusMessages: string[] = [];

  if (!status) statusMessages.push(text.messages.pending);
  if (status && !status.schemaValid) {
    statusMessages.push(vaultErrors[0] || text.messages.schemaInvalid);
  }
  if (status && !status.runtimeInstalled) {
    statusMessages.push(text.messages.runtimeMissing);
  }
  if (status && !status.obsidianEnabled) {
    statusMessages.push(text.messages.obsidianMissing);
  }
  if (contractP0P1 > 0) {
    statusMessages.push(text.messages.blockingFindings(contractP0P1));
  }
  if (unsafePathParts.length > 0) {
    statusMessages.push(text.messages.pathWhitespace(unsafePathParts.join(", ")));
  }
  if (traceabilityTotal > 0) {
    statusMessages.push(text.messages.traceabilityIssues(traceabilityTotal));
  }
  if (readingQualityIssues > 0) {
    statusMessages.push(text.messages.readingQualityIssues(readingQualityIssues));
  }
  if (proposedWritebacks > 0) {
    statusMessages.push(text.messages.writebackWaiting(proposedWritebacks));
  }
  if (statusMessages.length === 0) {
    statusMessages.push(text.messages.clear);
  }

  return (
    <section className={classNames("dashboard-overview", className)}>
      <div className="dashboard-hero">
        <div>
          <span className="eyebrow">{text.currentVault}</span>
          <h2>{vaultName(vaultPath)}</h2>
          <p title={vaultPath}>{visiblePath(vaultPath)}</p>
          <div className="hero-meta">
            <span>{text.entry}: {entryNote?.entryRelativePath || text.pending}</span>
            <span>{text.runtime}: {status?.runtimeVersion || text.unknown}</span>
            <span>{text.parser}: {desktopSettings.defaultPdfParser || text.auto}</span>
            <span>{text.jobs}: {runtimeRunning ? text.running : `${runtimeHistoryCount} ${text.history}`}</span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={onRefresh} disabled={busy === "inspect"}>
            <BarChart3 size={16} />
            {text.refresh}
          </button>
          <button onClick={onOpenObsidian} disabled={!vaultPath || busy === "obsidian_open"}>
            <SquareStack size={16} />
            Obsidian
          </button>
          <button onClick={onOpenSettings}>
            <Settings size={16} />
            {text.settings}
          </button>
        </div>
      </div>

      <div className="readiness-grid">
        <ReadinessCard
          icon={Database}
          label={text.vault}
          value={status?.schemaValid ? text.schemaValid : status ? text.schemaInvalid : text.inspecting}
          detail={status?.lastUpdated ? `${text.updated} ${new Date(status.lastUpdated).toLocaleString()}` : text.refreshInspect}
          tone={status?.schemaValid ? "ok" : status ? "danger" : "idle"}
          action={status?.schemaValid ? text.sources : text.refresh}
          onAction={status?.schemaValid ? onOpenSources : onRefresh}
        />
        <ReadinessCard
          icon={TerminalSquare}
          label={text.runtime}
          value={status?.runtimeInstalled ? text.runtimeReady : text.runtimeMissing}
          detail={status?.runtimeScriptsPath || desktopSettings.runtimePath || text.runtimeDetail}
          tone={status?.runtimeInstalled ? "ok" : "danger"}
          action={status?.runtimeInstalled ? text.activity : text.choose}
          onAction={status?.runtimeInstalled ? onOpenActivity : onChooseRuntime}
        />
        <ReadinessCard
          icon={SquareStack}
          label={text.obsidian}
          value={status?.obsidianEnabled ? text.obsidianConfigured : text.obsidianMissing}
          detail={entryNote?.warning || entryNote?.entryRelativePath || text.obsidianDetail}
          tone={status?.obsidianEnabled ? "ok" : "warn"}
          action={status?.obsidianEnabled ? text.open : text.setup}
          onAction={status?.obsidianEnabled ? onOpenObsidian : onRunObsidianSetup}
        />
        <ReadinessCard
          icon={BookOpenCheck}
          label={text.readingQuality}
          value={readingQualityIssues ? `${readingQualityIssues} ${text.readingFindings}` : text.readingClear}
          detail={readingQualityIssues ? readingQualityDetailText : text.readingQualityDetail}
          tone={readingQualityIssues ? "warn" : "ok"}
          action={text.open}
          onAction={onOpenObsidian}
        />
        <ReadinessCard
          icon={ShieldCheck}
          label={text.lint}
          value={contractP0P1 ? `${contractP0P1} ${text.blocking}` : `${lintFindings.length} ${text.findings}`}
          detail={contractP0P1 ? text.lintBlockingDetail : text.lintDetail}
          tone={contractP0P1 ? "danger" : lintFindings.length ? "warn" : "ok"}
          action={contractP0P1 ? text.open : text.runLint}
          onAction={contractP0P1 ? onOpenTraceability : onRunLint}
        />
        <ReadinessCard
          icon={ClipboardList}
          label={text.review}
          value={reviewTotal ? `${reviewTotal} ${text.openCount}` : text.clear}
          detail={reviewTotal ? text.reviewDetail : text.reviewClearDetail}
          tone={reviewTotal ? "warn" : "ok"}
          action={text.reviews}
          onAction={onOpenReviews}
        />
        <ReadinessCard
          icon={GitCompare}
          label={text.writeback}
          value={proposedWritebacks ? `${proposedWritebacks} ${text.proposed}` : `${writebacks.length} ${text.total}`}
          detail={writebackIssues ? `${writebackIssues} ${text.writebackIssueDetail}` : text.writebackDetail}
          tone={proposedWritebacks || writebackIssues ? "warn" : "ok"}
          action={text.writeback}
          onAction={onOpenWriteback}
        />
      </div>

      <div className="dashboard-body">
        <section className="status-message-panel">
          <div className="section-head compact">
            <h3>{text.actionableStatus}</h3>
            {status?.schemaValid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </div>
          <ul>
            {statusMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>

        <section className="next-actions-panel">
          <div className="section-head compact">
            <h3>{text.nextActions}</h3>
            <span>{runnableIngest} {text.ingestReady}</span>
          </div>
          <div className="next-action-list">
            {!status?.runtimeInstalled && (
              <NextAction
                icon={Settings}
                title={text.setRuntime}
                detail={text.setRuntimeDetail}
                tone="danger"
                onClick={onChooseRuntime}
              />
            )}
            {status && !status.obsidianEnabled && (
              <NextAction
                icon={SquareStack}
                title={text.prepareObsidian}
                detail={text.prepareObsidianDetail}
                tone="warn"
                disabled={runtimeRunning}
                onClick={onRunObsidianSetup}
              />
            )}
            {(summary?.total ?? 0) === 0 && (status?.counts.inbox ?? 0) > 0 && (
              <NextAction
                icon={ListChecks}
                title={text.planIngest}
                detail={text.planIngestDetail}
                onClick={onPlanIngest}
              />
            )}
            {topPlanEntry && (
              <NextAction
                icon={FileInput}
                title={`${topPlanEntry.fileName}: ${topPlanEntry.currentState}`}
                detail={topPlanEntry.nextActionLabel || topPlanEntry.reason}
                tone={topPlanEntry.status === "blocked" || topPlanEntry.requiresHumanApproval ? "warn" : "idle"}
                onClick={onOpenSources}
              />
            )}
            {runnableIngest > 0 && (
              <NextAction
                icon={Play}
                title={text.runPipeline}
                detail={text.runPipelineDetail(runnableIngest)}
                disabled={runtimeRunning}
                onClick={onRunPipeline}
              />
            )}
            {traceabilityTotal > 0 && (
              <NextAction
                icon={ShieldCheck}
                title={text.fixTraceability}
                detail={text.fixTraceabilityDetail}
                tone="warn"
                onClick={onOpenTraceability}
              />
            )}
            {reviewTotal > 0 && (
              <NextAction
                icon={ClipboardList}
                title={text.reviewClaims}
                detail={text.reviewClaimsDetail}
                tone="warn"
                onClick={onOpenReviews}
              />
            )}
            {proposedWritebacks > 0 && (
              <NextAction
                icon={GitCompare}
                title={text.reviewWriteback}
                detail={text.reviewWritebackDetail}
                tone="warn"
                onClick={onOpenWriteback}
              />
            )}
            <NextAction
              icon={FileInput}
              title={text.inspectSources}
              detail={text.inspectSourcesDetail}
              onClick={onOpenSources}
            />
            <NextAction
              icon={Wrench}
              title={text.runContractLint}
              detail={text.runContractLintDetail}
              onClick={onRunLint}
            />
          </div>
        </section>
      </div>

      <div className="dashboard-metrics">
        <MiniMetric label={text.metrics.rawInbox} value={status?.counts.inbox ?? 0} />
        <MiniMetric label={text.metrics.sources} value={status?.counts.sources ?? 0} />
        <MiniMetric label={text.metrics.concepts} value={status?.counts.concepts ?? 0} />
        <MiniMetric label={text.metrics.reports} value={status?.counts.reports ?? 0} />
        <MiniMetric label={text.metrics.reviewClaims} value={status?.counts.claimsNeedingReview ?? 0} emphasis={(status?.counts.claimsNeedingReview ?? 0) > 0} />
        <MiniMetric label={text.metrics.contradictions} value={status?.counts.contradictedClaims ?? 0} emphasis={(status?.counts.contradictedClaims ?? 0) > 0} />
        <MiniMetric label={text.metrics.planReady} value={summary?.ready ?? 0} />
        <MiniMetric label={text.metrics.stageable} value={summary?.stageable ?? 0} />
        <MiniMetric label={text.metrics.blocked} value={summary?.blocked ?? 0} emphasis={(summary?.blocked ?? 0) > 0} />
        <MiniMetric label={text.metrics.traceability} value={traceabilityTotal} emphasis={traceabilityTotal > 0} />
        <MiniMetric label={text.metrics.readingQuality} value={readingQualityIssues} emphasis={readingQualityIssues > 0} />
      </div>
    </section>
  );
}
