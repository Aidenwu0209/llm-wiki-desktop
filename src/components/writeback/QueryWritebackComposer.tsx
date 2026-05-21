import { Check, FolderOpen, GitCompare, PanelRightOpen, Play, TerminalSquare, XCircle } from "lucide-react";
import type { QueryWritebackDraft, WritebackApplyStatus, WritebackProposal } from "../../types";
import type { UiLanguage } from "../../i18n";

export const DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY = `基于当前 LLM Wiki，请整理 DeepSeek 的研发思路、思考问题的方式、关键决策依据，并预测可能的技术演进方向。
要求：
1. 所有确定性结论必须引用 LLM Wiki 中的资料 / 论断 / 概念证据。
2. 区分证据、推断、假设和预测。
3. 不要把预测写成事实。
4. 生成问答写回提案，不要静默写入。
5. 提案中必须说明目标页面、写入内容、证据链接、风险和需要人工确认的部分。`;

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
    title: "1. 提问并生成证据提案",
    guideTitle: "怎么使用",
    guideBody: "这页不会直接把内容写进知识库。先基于当前知识库生成回答草稿和证据图，再生成可审核提案；只有提案被批准后，才可以应用写回。",
    workflowSteps: [
      ["提问", "使用默认 DeepSeek 问题，或改成自己的问题。"],
      ["生成提案", "点击左侧按钮，系统会生成回答草稿、证据图和差异预览。"],
      ["审核", "在右侧查看提案详情和 diff，确认风险与证据。"],
      ["批准并应用", "先点批准，再点应用；未批准前不会写入。"],
    ],
    queryLabel: "问题",
    queryHelp: "这是你要问当前知识库的问题，不是要直接写入的正文。",
    targetLabel: "提案保存位置",
    targetHelp: "建议保存在 reviews/query-writeback/，先进入审核区。",
    generateHelp: "生成后只创建审核提案，不会静默修改资料页、概念页或原始证据。",
    placeholder: "基于当前知识库提问；输出必须区分证据 / 推断 / 假设 / 预测。",
    generate: "生成证据支撑提案",
    noEvidence: "当前草稿没有可引用证据。",
    manualTitle: "高级：手动创建提案",
    manualIntro: "只有在你已经写好正文时才使用这里。它同样只生成审核提案，不会绕过批准流程。",
    manualTarget: "reviews/query-writeback/example.md 或 concepts/example.md",
    manualContent: "提案内容；默认写入 reviews/query-writeback/，不静默修改资料页或概念页。",
    reviewProposal: "生成审核提案",
    proposalsTitle: "2. 审核提案并应用",
    proposalsHint: "先查看详情或差异预览，再决定批准或拒绝。只有状态为已批准的提案才能应用。",
    empty: "暂无写回提案。",
    approvalNote: "尚未应用。只有提案被明确批准后才能应用。",
    details: "详情",
    target: "目标",
    approve: "审批",
    reject: "拒绝",
    apply: "应用",
    log: "日志",
    boundary: "先提案后写回",
    answer: "回答草稿",
    evidenceMap: "证据图",
    insightCandidates: "洞察候选",
    uncertaintyConflicts: "不确定性 / 冲突",
    writebackProposal: "写回提案",
    diffPreview: "差异预览",
    approvalStatus: "审批状态",
    proposalTitle: "提案标题",
    proposalCount: "个提案",
    dashboardRefreshed: "仪表盘已刷新",
    dashboardRefreshIssue: "仪表盘刷新异常",
    dashboardRefreshFailed: "仪表盘刷新失败",
    dashboardRefreshedAfterApply: "应用后已刷新仪表盘。",
    sourceUnknown: "资料未知",
    quoteMissing: "暂无直接引文",
  },
  en: {
    title: "1. Ask and Generate Evidence Proposal",
    guideTitle: "How to use this",
    guideBody: "This page does not write directly into the wiki. Generate an answer draft and evidence map first, then review the proposal; only approved proposals can be applied.",
    workflowSteps: [
      ["Ask", "Use the default DeepSeek question or enter your own."],
      ["Generate", "Create an answer draft, evidence map, and diff preview."],
      ["Review", "Check proposal details, evidence, risk, and diff."],
      ["Approve and apply", "Approve first, then apply. Nothing is written before approval."],
    ],
    queryLabel: "Question",
    queryHelp: "This is the question for the current vault, not the text to write directly.",
    targetLabel: "Proposal path",
    targetHelp: "Keep proposals under reviews/query-writeback/ for review first.",
    generateHelp: "Generation only creates a review proposal; it will not silently modify sources, concepts, or raw evidence.",
    placeholder: "Ask from the current vault; output must distinguish evidence / inference / hypothesis / forecast.",
    generate: "Generate evidence-backed proposal",
    noEvidence: "This draft has no citable evidence yet.",
    manualTitle: "Advanced: create a manual proposal",
    manualIntro: "Use this only when you already have the writeback text. It still creates a review proposal and does not bypass approval.",
    manualTarget: "reviews/query-writeback/example.md or concepts/example.md",
    manualContent: "Proposal content; writes default to reviews/query-writeback/ and never silently modify source/concept pages.",
    reviewProposal: "Generate review proposal",
    proposalsTitle: "2. Review Proposals and Apply",
    proposalsHint: "Open details or review the diff before approving or rejecting. Only approved proposals can be applied.",
    empty: "No writeback proposals yet.",
    approvalNote: "Not applied. Apply is disabled until this proposal is explicitly approved.",
    details: "details",
    target: "target",
    approve: "approve",
    reject: "reject",
    apply: "apply",
    log: "log",
    boundary: "proposal-first",
    answer: "Answer",
    evidenceMap: "Evidence map",
    insightCandidates: "Insight candidates",
    uncertaintyConflicts: "Uncertainty / conflicts",
    writebackProposal: "Writeback proposal",
    diffPreview: "Diff preview",
    approvalStatus: "Approval status",
    proposalTitle: "proposal title",
    proposalCount: "proposals",
    dashboardRefreshed: "dashboard refreshed",
    dashboardRefreshIssue: "dashboard refresh issue",
    dashboardRefreshFailed: "Dashboard refresh failed",
    dashboardRefreshedAfterApply: "Dashboard refreshed after apply.",
    sourceUnknown: "source unknown",
    quoteMissing: "claim text without direct quote",
  },
} as const;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function lintSummary(status: WritebackApplyStatus, language: UiLanguage) {
  if (!status.lint.ran) return language === "zh" ? "自动合约检查已跳过" : "Auto lint skipped";
  if (status.lint.error) return language === "zh" ? `自动合约检查失败：${status.lint.error}` : `Auto lint failed: ${status.lint.error}`;
  return language === "zh"
    ? `自动合约检查完成：${status.lint.findingCount ?? 0} 个发现，${status.lint.blockingCount ?? 0} 个 P0/P1`
    : `Auto lint completed: ${status.lint.findingCount ?? 0} findings, ${status.lint.blockingCount ?? 0} P0/P1`;
}

function proposalStatusLabel(status: WritebackProposal["status"] | QueryWritebackDraft["approvalStatus"], language: UiLanguage) {
  if (language !== "zh") return status;
  const labels: Record<string, string> = {
    proposed: "待审核",
    approved: "已批准",
    rejected: "已拒绝",
    applied: "已应用",
  };
  return labels[status] ?? status;
}

function proposalTitleLabel(title: string, language: UiLanguage) {
  if (language === "zh" && title === "DeepSeek research insight query") return "DeepSeek 研究洞察提案";
  return title;
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
    <div className={classNames("main-grid writeback-workspace", className)}>
      <section className="panel writeback-guide">
        <div>
          <h2>{text.guideTitle}</h2>
          <p>{text.guideBody}</p>
        </div>
        <ol className="writeback-steps">
          {text.workflowSteps.map(([title, body], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <strong>{title}</strong>
              <em>{body}</em>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel large">
        <div className="section-head">
          <h2>{text.title}</h2>
          <span>{text.boundary}</span>
        </div>
        <div className="writeback-form">
          <label className="field-group">
            <span>{text.queryLabel}</span>
            <small>{text.queryHelp}</small>
            <textarea
              className="query-question-box"
              value={queryText}
              onChange={(event) => onQueryTextChange(event.target.value)}
              placeholder={text.placeholder}
            />
          </label>
          <label className="field-group">
            <span>{text.targetLabel}</span>
            <small>{text.targetHelp}</small>
            <input
              value={queryTarget}
              onChange={(event) => onQueryTargetChange(event.target.value)}
              placeholder="reviews/query-writeback/deepseek-research-insights.md"
            />
          </label>
          <div className="writeback-safety-note">
            <GitCompare size={16} />
            <span>{text.generateHelp}</span>
          </div>
          <button onClick={onCreateQueryWriteback} disabled={!vaultPath || busy === "query_writeback"}>
            <GitCompare size={16} />{text.generate}
          </button>
          {queryDraft && (
            <div className="composer-result">
              <strong>{text.answer}</strong>
              <pre className="diff-box">{queryDraft.answer}</pre>

              <strong>{text.evidenceMap}</strong>
              <div className="impact-list compact">
                {queryDraft.evidenceMap.length === 0 && <p className="empty">{text.noEvidence}</p>}
                {queryDraft.evidenceMap.map((item, index) => (
                  <button
                    key={`${item.claimId}-${index}`}
                    onClick={() => onOpenPath(resolveVaultPath(item.sourcePath || item.claimPath))}
                  >
                    <span className={classNames("status-chip", item.freshnessStatus === "blocked" ? "rejected" : "proposed")}>{item.conclusionType}</span>
                    <strong>{item.claimText || item.claimId}</strong>
                    <em>{item.sourceId || item.sourcePath || text.sourceUnknown} · {item.verdict}/{item.status} · {item.confidence}</em>
                    <code>{item.blockedReason || item.quote || item.evidenceHash || text.quoteMissing}{item.concepts.length ? ` · ${item.concepts.join(", ")}` : ""}</code>
                  </button>
                ))}
              </div>

              <strong>{text.insightCandidates}</strong>
              <div className="action-list">
                {queryDraft.insightCandidates.map((item) => (
                  <div className="work-item" key={item}>
                    <code>{item}</code>
                  </div>
                ))}
              </div>

              <strong>{text.uncertaintyConflicts}</strong>
              <div className="action-list">
                {queryDraft.uncertaintyConflicts.map((item) => (
                  <div className="work-item" key={item}>
                    <code>{item}</code>
                  </div>
                ))}
              </div>

              <strong>{text.writebackProposal}</strong>
              <pre className="diff-box">{queryDraft.writebackProposal}</pre>

              <strong>{text.diffPreview}</strong>
              <pre className="diff-box">{queryDraft.diffPreview}</pre>

              <strong>{text.approvalStatus}</strong>
              <div className="work-item">
                <span className={classNames("status-chip", queryDraft.approvalStatus)}>{proposalStatusLabel(queryDraft.approvalStatus, language)}</span>
                <code>{text.approvalNote}</code>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel large">
        <div className="section-head">
          <h2>{text.proposalsTitle}</h2>
          <span>{writebacks.length} {text.proposalCount}</span>
        </div>
        <p className="workflow-hint">{text.proposalsHint}</p>
        {applyStatus && (
          <div className="work-item">
            <span className={classNames("status-chip", applyStatus.dashboardRefreshed ? "applied" : "p1")}>
              {applyStatus.dashboardRefreshed ? text.dashboardRefreshed : text.dashboardRefreshIssue}
            </span>
            <strong>{applyStatus.targetPath}</strong>
            <em>{applyStatus.appliedAt || "applied"}</em>
            <code>
              {applyStatus.dashboardError ? `${text.dashboardRefreshFailed}: ${applyStatus.dashboardError}` : text.dashboardRefreshedAfterApply}
              {" "}
              {lintSummary(applyStatus, language)}
            </code>
          </div>
        )}
        <div className="impact-list">
          {writebacks.length === 0 && <p className="empty">{text.empty}</p>}
          {writebacks.map((proposal) => (
            <div className="work-item" key={proposal.proposalId}>
              <span className={classNames("status-chip", proposal.status)}>{proposalStatusLabel(proposal.status, language)}</span>
              <strong>{proposalTitleLabel(proposal.title, language)}</strong>
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

      <section className="panel writeback-advanced-panel">
        <details>
          <summary>
            <GitCompare size={16} />
            <span>{text.manualTitle}</span>
          </summary>
          <p className="workflow-hint">{text.manualIntro}</p>
          <div className="writeback-form">
            <input
              value={writebackTarget}
              onChange={(event) => onWritebackTargetChange(event.target.value)}
              placeholder={text.manualTarget}
            />
            <input
              value={writebackTitle}
              onChange={(event) => onWritebackTitleChange(event.target.value)}
              placeholder={text.proposalTitle}
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
        </details>
      </section>
    </div>
  );
}
