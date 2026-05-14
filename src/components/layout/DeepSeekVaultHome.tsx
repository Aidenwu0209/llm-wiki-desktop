import { AlertTriangle, ClipboardList, Database, FileInput, GitCompare, ShieldCheck } from "lucide-react";
import type { VaultCounts } from "../../types";

type DeepSeekVaultHomeProps = {
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

export function DeepSeekVaultHome({
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
  return (
    <section className="deepseek-home">
      <div className="deepseek-home-copy">
        <span>DeepSeek vault home</span>
        <h3>{vaultName || "Generated vault"}</h3>
        <p>Corpus readiness, source coverage, review pressure, traceability, and insight writeback are surfaced together before users dive into detailed tables.</p>
      </div>
      <div className="deepseek-home-grid">
        <button onClick={onOpenSources} type="button">
          <FileInput size={18} />
          <span>Sources</span>
          <strong>{counts?.sources ?? 0}</strong>
          <em>{counts?.inbox ?? 0} raw inbox</em>
        </button>
        <button onClick={onOpenConcepts} type="button">
          <Database size={18} />
          <span>Concepts</span>
          <strong>{counts?.concepts ?? 0}</strong>
          <em>{counts?.reports ?? 0} reports</em>
        </button>
        <button onClick={onOpenReviews} type="button">
          <ClipboardList size={18} />
          <span>Review queue</span>
          <strong>{reviewOpenCount}</strong>
          <em>{counts?.claimsNeedingReview ?? 0} claim reviews</em>
        </button>
        <button onClick={onOpenTraceability} type="button">
          <ShieldCheck size={18} />
          <span>Traceability</span>
          <strong>{traceabilityWarningCount}</strong>
          <em>{counts?.contradictedClaims ?? 0} contradictions</em>
        </button>
        <button className="deepseek-home-primary" onClick={onOpenWriteback} type="button">
          <GitCompare size={18} />
          <span>Query writeback</span>
          <strong>{proposalCount}</strong>
          <em>proposal-first insights</em>
        </button>
        <div className="deepseek-home-note">
          <AlertTriangle size={18} />
          <span>Forecasts remain hypotheses until backed by source / claim / concept evidence and approved through writeback.</span>
        </div>
      </div>
    </section>
  );
}
