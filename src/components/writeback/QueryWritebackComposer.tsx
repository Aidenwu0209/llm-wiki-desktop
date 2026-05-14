import { Check, FolderOpen, GitCompare, PanelRightOpen, Play, TerminalSquare, XCircle } from "lucide-react";
import type { QueryWritebackDraft, WritebackApplyStatus, WritebackProposal } from "../../types";
import type { UiLanguage } from "../../i18n";

export const DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY = `基于当前 LLM Wiki，请整理 DeepSeek 的研发思路、思考问题的方式、关键决策依据，并预测可能的技术演进方向。
要求：
1. 所有确定性结论必须引用 LLM Wiki 中的 source / claim / concept 证据。
2. 区分 evidence、inference、hypothesis、forecast。
3. 不要把预测写成事实。
4. 生成 query writeback proposal，不要静默写入。
5. proposal 中必须说明目标页面、写入内容、证据链接、风险和需要人工确认的部分。`;

export const DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN = `Based on the current LLM Wiki, summarize DeepSeek's research strategy, problem-framing style, key decision basis, and likely technical evolution direction.
Requirements:
1. Every firm conclusion must cite source / claim / concept evidence from the LLM Wiki.
2. Distinguish evidence, inference, hypothesis, and forecast.
3. Do not present forecasts as facts.
4. Generate a query writeback proposal; do not silently write into the wiki.
5. The proposal must describe target pages, writeback content, evidence links, risks, and parts that require human confirmation.`;

type QueryWritebackComposerProps = {
  className?: string;
  language?: UiLanguage;
  vaultPath: string;
  busy: string | null;
  queryText: string;
  queryTarget: string;
  queryDraft: QueryWritebackDraft | null;
  writebackTarget: string;
  writebackTitle: string;
  writebackContent: string;
  writebacks: WritebackProposal[];
  applyStatus: WritebackApplyStatus | null;
  onQueryTextChange: (value: string) => void;
  onQueryTargetChange: (value: string) => void;
  onWritebackTargetChange: (value: string) => void;
  onWritebackTitleChange: (value: string) => void;
  onWritebackContentChange: (value: string) => void;
  onCreateQueryWriteback: () => void;
  onCreateWriteback: () => void;
  onSetWritebackStatus: (proposalId: string, status: "proposed" | "approved" | "rejected") => void;
  onApplyWriteback: (proposalId: string) => void;
  onSelectProposal?: (proposal: WritebackProposal) => void;
  onOpenPath: (path: string) => void;
  resolveVaultPath: (path?: string | null) => string;
};

const writebackCopy = {
  zh: {
    title: "问答 / 洞察 / 写回 Composer",
    placeholder: "基于当前 vault 提问；输出必须区分 evidence / inference / hypothesis / forecast。",
    generate: "生成 evidence-backed proposal",
    noEvidence: "当前 draft 没有可引用 evidence。",
    manualTitle: "Manual Writeback 安全流程",
    manualTarget: "reviews/query-writeback/example.md 或 concepts/example.md",
    manualContent: "proposal 内容；默认写入 reviews/query-writeback/，不静默修改 source/concept。",
    reviewProposal: "生成 review proposal",
    proposalsTitle: "Writeback proposals",
    empty: "暂无 writeback proposal。",
    approvalNote: "尚未应用。只有 proposal 被明确批准后才能 apply。",
    details: "详情",
    target: "目标",
    approve: "审批",
    reject: "拒绝",
    apply: "应用",
    log: "日志",
  },
  en: {
    title: "Query / Insight / Writeback Composer",
    placeholder: "Ask from the current vault; output must distinguish evidence / inference / hypothesis / forecast.",
    generate: "Generate evidence-backed proposal",
    noEvidence: "This draft has no citable evidence yet.",
    manualTitle: "Manual Writeback Safety Flow",
    manualTarget: "reviews/query-writeback/example.md or concepts/example.md",
    manualContent: "Proposal content; writes default to reviews/query-writeback/ and never silently modify source/concept pages.",
    reviewProposal: "Generate review proposal",
    proposalsTitle: "Writeback proposals",
    empty: "No writeback proposals yet.",
    approvalNote: "Not applied. Apply is disabled until this proposal is explicitly approved.",
    details: "details",
    target: "target",
    approve: "approve",
    reject: "reject",
    apply: "apply",
    log: "log",
  },
} as const;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function lintSummary(status: WritebackApplyStatus) {
  if (!status.lint.ran) return "Auto lint skipped";
  if (status.lint.error) return `Auto lint failed: ${status.lint.error}`;
  return `Auto lint completed: ${status.lint.findingCount ?? 0} findings, ${status.lint.blockingCount ?? 0} P0/P1`;
}

export function QueryWritebackComposer({
  className,
  language = "zh",
  vaultPath,
  busy,
  queryText,
  queryTarget,
  queryDraft,
  writebackTarget,
  writebackTitle,
  writebackContent,
  writebacks,
  applyStatus,
  onQueryTextChange,
  onQueryTargetChange,
  onWritebackTargetChange,
  onWritebackTitleChange,
  onWritebackContentChange,
  onCreateQueryWriteback,
  onCreateWriteback,
  onSetWritebackStatus,
  onApplyWriteback,
  onSelectProposal,
  onOpenPath,
  resolveVaultPath,
}: QueryWritebackComposerProps) {
  const text = writebackCopy[language];
  return (
    <div className={classNames("main-grid", className)}>
      <section className="panel large">
        <div className="section-head">
          <h2>{text.title}</h2>
          <span>proposal-first</span>
        </div>
        <div className="writeback-form">
          <textarea
            value={queryText}
            onChange={(event) => onQueryTextChange(event.target.value)}
            placeholder={text.placeholder}
          />
          <input
            value={queryTarget}
            onChange={(event) => onQueryTargetChange(event.target.value)}
            placeholder="reviews/query-writeback/deepseek-research-insights.md"
          />
          <button onClick={onCreateQueryWriteback} disabled={!vaultPath || busy === "query_writeback"}>
            <GitCompare size={16} />{text.generate}
          </button>
          {queryDraft && (
            <div className="composer-result">
              <strong>Answer</strong>
              <pre className="diff-box">{queryDraft.answer}</pre>

              <strong>Evidence map</strong>
              <div className="impact-list compact">
                {queryDraft.evidenceMap.length === 0 && <p className="empty">{text.noEvidence}</p>}
                {queryDraft.evidenceMap.map((item, index) => (
                  <button
                    key={`${item.claimId}-${index}`}
                    onClick={() => onOpenPath(resolveVaultPath(item.sourcePath || item.claimPath))}
                  >
                    <span className="status-chip proposed">{item.conclusionType}</span>
                    <strong>{item.claimText || item.claimId}</strong>
                    <em>{item.sourceId || item.sourcePath || "source unknown"} · {item.verdict}/{item.status} · {item.confidence}</em>
                    <code>{item.quote || item.evidenceHash || "claim text without direct quote"}{item.concepts.length ? ` · ${item.concepts.join(", ")}` : ""}</code>
                  </button>
                ))}
              </div>

              <strong>Insight candidates</strong>
              <div className="action-list">
                {queryDraft.insightCandidates.map((item) => (
                  <div className="work-item" key={item}>
                    <code>{item}</code>
                  </div>
                ))}
              </div>

              <strong>Uncertainty / conflicts</strong>
              <div className="action-list">
                {queryDraft.uncertaintyConflicts.map((item) => (
                  <div className="work-item" key={item}>
                    <code>{item}</code>
                  </div>
                ))}
              </div>

              <strong>Writeback proposal</strong>
              <pre className="diff-box">{queryDraft.writebackProposal}</pre>

              <strong>Diff preview</strong>
              <pre className="diff-box">{queryDraft.diffPreview}</pre>

              <strong>Approval status</strong>
              <div className="work-item">
                <span className={classNames("status-chip", queryDraft.approvalStatus)}>{queryDraft.approvalStatus}</span>
                <code>{text.approvalNote}</code>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel large">
        <div className="section-head">
          <h2>{text.manualTitle}</h2>
          <GitCompare size={18} />
        </div>
        <div className="writeback-form">
          <input
            value={writebackTarget}
            onChange={(event) => onWritebackTargetChange(event.target.value)}
            placeholder={text.manualTarget}
          />
          <input
            value={writebackTitle}
            onChange={(event) => onWritebackTitleChange(event.target.value)}
            placeholder="proposal title"
          />
          <textarea
            value={writebackContent}
            onChange={(event) => onWritebackContentChange(event.target.value)}
            placeholder={text.manualContent}
          />
          <button onClick={onCreateWriteback} disabled={!vaultPath || busy === "writeback_proposal"}>
            <GitCompare size={16} />{text.reviewProposal}
          </button>
        </div>
      </section>

      <section className="panel large">
        <div className="section-head">
          <h2>{text.proposalsTitle}</h2>
          <span>{writebacks.length} proposals</span>
        </div>
        {applyStatus && (
          <div className="work-item">
            <span className={classNames("status-chip", applyStatus.dashboardRefreshed ? "applied" : "p1")}>
              {applyStatus.dashboardRefreshed ? "dashboard refreshed" : "dashboard refresh issue"}
            </span>
            <strong>{applyStatus.targetPath}</strong>
            <em>{applyStatus.appliedAt || "applied"}</em>
            <code>
              {applyStatus.dashboardError ? `Dashboard refresh failed: ${applyStatus.dashboardError}` : "Dashboard refreshed after apply."}
              {" "}
              {lintSummary(applyStatus)}
            </code>
          </div>
        )}
        <div className="impact-list">
          {writebacks.length === 0 && <p className="empty">{text.empty}</p>}
          {writebacks.map((proposal) => (
            <div className="work-item" key={proposal.proposalId}>
              <span className={classNames("status-chip", proposal.status)}>{proposal.status}</span>
              <strong>{proposal.title}</strong>
              <em>{proposal.targetPath} · {proposal.updatedAt}</em>
              <code>{proposal.diff.split("\n").slice(0, 2).join(" | ")}</code>
              <div className="inline-actions">
                {onSelectProposal && (
                  <button onClick={() => onSelectProposal(proposal)}>
                    <PanelRightOpen size={14} />{text.details}
                  </button>
                )}
                <button onClick={() => onOpenPath(resolveVaultPath(proposal.targetPath))}><FolderOpen size={14} />{text.target}</button>
                <button onClick={() => onSetWritebackStatus(proposal.proposalId, "approved")} disabled={proposal.status !== "proposed"}><Check size={14} />{text.approve}</button>
                <button onClick={() => onSetWritebackStatus(proposal.proposalId, "rejected")} disabled={proposal.status === "applied"}><XCircle size={14} />{text.reject}</button>
                <button onClick={() => onApplyWriteback(proposal.proposalId)} disabled={proposal.status !== "approved"}><Play size={14} />{text.apply}</button>
                <button onClick={() => proposal.logPath && onOpenPath(resolveVaultPath(proposal.logPath))} disabled={!proposal.logPath}><TerminalSquare size={14} />{text.log}</button>
              </div>
              <pre className="diff-box">{proposal.diff}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
