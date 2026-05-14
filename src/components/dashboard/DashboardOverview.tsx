import {
  AlertTriangle,
  BarChart3,
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
  TraceabilityWarning,
  VaultEntryNote,
  VaultStatus,
  WritebackProposal,
} from "../../types";

type ReadinessTone = "ok" | "warn" | "danger" | "idle";

type DashboardOverviewProps = {
  className?: string;
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

function vaultName(path: string) {
  return visiblePath(path).split("/").filter(Boolean).pop() || visiblePath(path) || "No vault";
}

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

export function DashboardOverview({
  className,
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
  const summary = ingestPlan?.summary;
  const parseablePdfs =
    ingestPlan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
  const runnableIngest = (summary?.ready ?? 0) + (summary?.stageable ?? 0) + (summary?.cached ?? 0) + parseablePdfs;
  const contractP0P1 = lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length;
  const proposedWritebacks = writebacks.filter((proposal) => proposal.status === "proposed").length;
  const writebackIssues = writebacks.filter((proposal) => proposal.status === "rejected").length;
  const reviewTotal = openReviewCount + (status?.counts.claimsNeedingReview ?? 0);
  const traceabilityTotal = traceabilityWarnings.length + brokenEvidence;
  const vaultErrors = status?.errors ?? [];
  const statusMessages: string[] = [];

  if (!status) statusMessages.push("Vault inspection is pending. Refresh the vault if this stays empty.");
  if (status && !status.schemaValid) {
    statusMessages.push(vaultErrors[0] || "Vault schema is invalid. Open contract lint and fix blocking findings.");
  }
  if (status && !status.runtimeInstalled) {
    statusMessages.push("Runtime missing. Select the local open-llm-wiki runtime path in Settings.");
  }
  if (status && !status.obsidianEnabled) {
    statusMessages.push("Obsidian is not configured for this vault. Run Obsidian setup before user-facing review.");
  }
  if (contractP0P1 > 0) {
    statusMessages.push(`${contractP0P1} blocking contract lint finding${contractP0P1 === 1 ? "" : "s"} need review.`);
  }
  if (traceabilityTotal > 0) {
    statusMessages.push(`${traceabilityTotal} traceability issue${traceabilityTotal === 1 ? "" : "s"} need source or claim follow-up.`);
  }
  if (proposedWritebacks > 0) {
    statusMessages.push(`${proposedWritebacks} writeback proposal${proposedWritebacks === 1 ? "" : "s"} waiting for explicit review.`);
  }
  if (statusMessages.length === 0) {
    statusMessages.push("Core desktop checks are clear. Continue with ingest, review, or query writeback from the cards below.");
  }

  return (
    <section className={classNames("dashboard-overview", className)}>
      <div className="dashboard-hero">
        <div>
          <span className="eyebrow">Current vault</span>
          <h2>{vaultName(vaultPath)}</h2>
          <p title={vaultPath}>{visiblePath(vaultPath)}</p>
          <div className="hero-meta">
            <span>Entry: {entryNote?.entryRelativePath || "pending"}</span>
            <span>Runtime: {status?.runtimeVersion || "unknown"}</span>
            <span>Parser: {desktopSettings.defaultPdfParser || "auto"}</span>
            <span>Jobs: {runtimeRunning ? "running" : `${runtimeHistoryCount} history`}</span>
          </div>
        </div>
        <div className="hero-actions">
          <button onClick={onRefresh} disabled={busy === "inspect"}>
            <BarChart3 size={16} />
            Refresh
          </button>
          <button onClick={onOpenObsidian} disabled={!vaultPath || busy === "obsidian_open"}>
            <SquareStack size={16} />
            Obsidian
          </button>
          <button onClick={onOpenSettings}>
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>

      <div className="readiness-grid">
        <ReadinessCard
          icon={Database}
          label="Vault"
          value={status?.schemaValid ? "Schema valid" : status ? "Schema invalid" : "Inspecting"}
          detail={status?.lastUpdated ? `Updated ${new Date(status.lastUpdated).toLocaleString()}` : "Refresh to inspect current state"}
          tone={status?.schemaValid ? "ok" : status ? "danger" : "idle"}
          action={status?.schemaValid ? "Sources" : "Refresh"}
          onAction={status?.schemaValid ? onOpenSources : onRefresh}
        />
        <ReadinessCard
          icon={TerminalSquare}
          label="Runtime"
          value={status?.runtimeInstalled ? "Ready" : "Missing"}
          detail={status?.runtimeScriptsPath || desktopSettings.runtimePath || "Select open-llm-wiki runtime path"}
          tone={status?.runtimeInstalled ? "ok" : "danger"}
          action={status?.runtimeInstalled ? "Activity" : "Choose"}
          onAction={status?.runtimeInstalled ? onOpenActivity : onChooseRuntime}
        />
        <ReadinessCard
          icon={SquareStack}
          label="Obsidian"
          value={status?.obsidianEnabled ? "Configured" : "Not configured"}
          detail={entryNote?.warning || entryNote?.entryRelativePath || "Run setup before first user review"}
          tone={status?.obsidianEnabled ? "ok" : "warn"}
          action={status?.obsidianEnabled ? "Open" : "Setup"}
          onAction={status?.obsidianEnabled ? onOpenObsidian : onRunObsidianSetup}
        />
        <ReadinessCard
          icon={ShieldCheck}
          label="Lint"
          value={contractP0P1 ? `${contractP0P1} blocking` : `${lintFindings.length} findings`}
          detail={contractP0P1 ? "Resolve P0/P1 findings before claiming readiness" : "Run contract lint after ingest or writeback"}
          tone={contractP0P1 ? "danger" : lintFindings.length ? "warn" : "ok"}
          action={contractP0P1 ? "Open" : "Run lint"}
          onAction={contractP0P1 ? onOpenTraceability : onRunLint}
        />
        <ReadinessCard
          icon={ClipboardList}
          label="Review"
          value={reviewTotal ? `${reviewTotal} open` : "Clear"}
          detail={reviewTotal ? "Claims or science review items need human attention" : "No open review queue items detected"}
          tone={reviewTotal ? "warn" : "ok"}
          action="Reviews"
          onAction={onOpenReviews}
        />
        <ReadinessCard
          icon={GitCompare}
          label="Writeback"
          value={proposedWritebacks ? `${proposedWritebacks} proposed` : `${writebacks.length} total`}
          detail={writebackIssues ? `${writebackIssues} rejected proposals need cleanup` : "Proposal-first gate is preserved"}
          tone={proposedWritebacks || writebackIssues ? "warn" : "ok"}
          action="Writeback"
          onAction={onOpenWriteback}
        />
      </div>

      <div className="dashboard-body">
        <section className="status-message-panel">
          <div className="section-head compact">
            <h3>Actionable status</h3>
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
            <h3>Next suggested actions</h3>
            <span>{runnableIngest} ingest-ready</span>
          </div>
          <div className="next-action-list">
            {!status?.runtimeInstalled && (
              <NextAction
                icon={Settings}
                title="Set runtime path"
                detail="Point desktop to the local open-llm-wiki runtime."
                tone="danger"
                onClick={onChooseRuntime}
              />
            )}
            {status && !status.obsidianEnabled && (
              <NextAction
                icon={SquareStack}
                title="Prepare Obsidian"
                detail="Create or repair the generated vault entry and templates."
                tone="warn"
                disabled={runtimeRunning}
                onClick={onRunObsidianSetup}
              />
            )}
            {(summary?.total ?? 0) === 0 && (status?.counts.inbox ?? 0) > 0 && (
              <NextAction
                icon={ListChecks}
                title="Plan ingest"
                detail="Turn raw inbox files into source actions and queue state."
                onClick={onPlanIngest}
              />
            )}
            {runnableIngest > 0 && (
              <NextAction
                icon={Play}
                title="Run pipeline"
                detail={`${runnableIngest} source${runnableIngest === 1 ? "" : "s"} can continue through runtime.`}
                disabled={runtimeRunning}
                onClick={onRunPipeline}
              />
            )}
            {traceabilityTotal > 0 && (
              <NextAction
                icon={ShieldCheck}
                title="Fix traceability"
                detail="Inspect missing anchors, broken evidence paths, and contract findings."
                tone="warn"
                onClick={onOpenTraceability}
              />
            )}
            {reviewTotal > 0 && (
              <NextAction
                icon={ClipboardList}
                title="Review claims"
                detail="Resolve science review queue and claim verdicts manually."
                tone="warn"
                onClick={onOpenReviews}
              />
            )}
            {proposedWritebacks > 0 && (
              <NextAction
                icon={GitCompare}
                title="Review writeback proposal"
                detail="Inspect diff and approve explicitly before applying."
                tone="warn"
                onClick={onOpenWriteback}
              />
            )}
            <NextAction
              icon={FileInput}
              title="Inspect sources"
              detail="Open raw inbox, generated sources, concepts, and reports."
              onClick={onOpenSources}
            />
            <NextAction
              icon={Wrench}
              title="Run contract lint"
              detail="Refresh dashboard contract health after changes."
              onClick={onRunLint}
            />
          </div>
        </section>
      </div>

      <div className="dashboard-metrics">
        <MiniMetric label="Raw inbox" value={status?.counts.inbox ?? 0} />
        <MiniMetric label="Sources" value={status?.counts.sources ?? 0} />
        <MiniMetric label="Concepts" value={status?.counts.concepts ?? 0} />
        <MiniMetric label="Reports" value={status?.counts.reports ?? 0} />
        <MiniMetric label="Review claims" value={status?.counts.claimsNeedingReview ?? 0} emphasis={(status?.counts.claimsNeedingReview ?? 0) > 0} />
        <MiniMetric label="Contradictions" value={status?.counts.contradictedClaims ?? 0} emphasis={(status?.counts.contradictedClaims ?? 0) > 0} />
        <MiniMetric label="Plan ready" value={summary?.ready ?? 0} />
        <MiniMetric label="Stageable" value={summary?.stageable ?? 0} />
        <MiniMetric label="Blocked" value={summary?.blocked ?? 0} emphasis={(summary?.blocked ?? 0) > 0} />
        <MiniMetric label="Traceability" value={traceabilityTotal} emphasis={traceabilityTotal > 0} />
      </div>
    </section>
  );
}
