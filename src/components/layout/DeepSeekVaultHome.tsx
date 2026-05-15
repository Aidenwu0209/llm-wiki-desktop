import { AlertTriangle, ClipboardList, Database, FileInput, GitCompare, ShieldCheck } from "lucide-react";
import type { UiLanguage } from "../../i18n";
import type { VaultCounts } from "../../types";

type DeepSeekVaultHomeProps = {
  language?: UiLanguage;
  vaultName: string;
  counts?: VaultCounts;
  reviewOpenCount: number;
  traceabilityWarningCount: number;
  proposalCount: number;
  onOpenSources: () => void;
  onOpenConcepts: () => void;
  onOpenReviews: () => void;
  onOpenTraceability: () => void;
  onOpenWriteback: () => void;
};

const deepSeekHomeCopy = {
  zh: {
    eyebrow: "DeepSeek 知识库首页",
    fallbackName: "生成的知识库",
    summary: "把语料准备度、资料覆盖、审核压力、证据可追踪性和洞察写回放在同一屏，用户进入明细表前就能知道状态。",
    sources: "资料",
    rawInbox: "原始收件箱",
    concepts: "概念",
    reports: "报告",
    reviewQueue: "审核队列",
    claimReviews: "论断审核",
    traceability: "可追踪性",
    contradictions: "冲突",
    writeback: "问答写回",
    proposalFirst: "先提案后写回的洞察",
    forecastNote: "预测在获得资料 / 论断 / 概念证据支撑并通过写回批准前，仍然只是待验证假设。",
  },
  en: {
    eyebrow: "DeepSeek vault home",
    fallbackName: "Generated vault",
    summary: "Corpus readiness, source coverage, review pressure, traceability, and insight writeback are surfaced together before users dive into detailed tables.",
    sources: "Sources",
    rawInbox: "raw inbox",
    concepts: "Concepts",
    reports: "reports",
    reviewQueue: "Review queue",
    claimReviews: "claim reviews",
    traceability: "Traceability",
    contradictions: "contradictions",
    writeback: "Query writeback",
    proposalFirst: "proposal-first insights",
    forecastNote: "Forecasts remain hypotheses until backed by source / claim / concept evidence and approved through writeback.",
  },
} as const;

export function DeepSeekVaultHome({
  language = "zh",
  vaultName,
  counts,
  reviewOpenCount,
  traceabilityWarningCount,
  proposalCount,
  onOpenSources,
  onOpenConcepts,
  onOpenReviews,
  onOpenTraceability,
  onOpenWriteback,
}: DeepSeekVaultHomeProps) {
  const text = deepSeekHomeCopy[language];
  return (
    <section className="deepseek-home">
      <div className="deepseek-home-copy">
        <span>{text.eyebrow}</span>
        <h3>{vaultName || text.fallbackName}</h3>
        <p>{text.summary}</p>
      </div>
      <div className="deepseek-home-grid">
        <button onClick={onOpenSources} type="button">
          <FileInput size={18} />
          <span>{text.sources}</span>
          <strong>{counts?.sources ?? 0}</strong>
          <em>{counts?.inbox ?? 0} {text.rawInbox}</em>
        </button>
        <button onClick={onOpenConcepts} type="button">
          <Database size={18} />
          <span>{text.concepts}</span>
          <strong>{counts?.concepts ?? 0}</strong>
          <em>{counts?.reports ?? 0} {text.reports}</em>
        </button>
        <button onClick={onOpenReviews} type="button">
          <ClipboardList size={18} />
          <span>{text.reviewQueue}</span>
          <strong>{reviewOpenCount}</strong>
          <em>{counts?.claimsNeedingReview ?? 0} {text.claimReviews}</em>
        </button>
        <button onClick={onOpenTraceability} type="button">
          <ShieldCheck size={18} />
          <span>{text.traceability}</span>
          <strong>{traceabilityWarningCount}</strong>
          <em>{counts?.contradictedClaims ?? 0} {text.contradictions}</em>
        </button>
        <button className="deepseek-home-primary" onClick={onOpenWriteback} type="button">
          <GitCompare size={18} />
          <span>{text.writeback}</span>
          <strong>{proposalCount}</strong>
          <em>{text.proposalFirst}</em>
        </button>
        <div className="deepseek-home-note">
          <AlertTriangle size={18} />
          <span>{text.forecastNote}</span>
        </div>
      </div>
    </section>
  );
}
