import { ClipboardList, FileInput, FolderOpen } from "lucide-react";
import type { TraceabilityWarning } from "../../types";

type TraceabilityActionCardsProps = {
  warnings: TraceabilityWarning[];
  onOpenClaim: (warning: TraceabilityWarning) => void;
  onOpenSource: (warning: TraceabilityWarning) => void;
  onOpenArtifact: (warning: TraceabilityWarning) => void;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function TraceabilityActionCards({
  warnings,
  onOpenClaim,
  onOpenSource,
  onOpenArtifact,
}: TraceabilityActionCardsProps) {
  if (warnings.length === 0) {
    return <p className="empty">暂无 evidence-anchor warning。</p>;
  }

  return (
    <>
      {warnings.map((warning) => (
        <div className="work-item" key={warning.warningId}>
          <span className={classNames("status-chip", warning.severity)}>{warning.severity}</span>
          <strong>{warning.summary || warning.claimText || warning.claimId}</strong>
          <em>
            claim {warning.claimId} · {warning.sourceId || "source id pending"} ·{" "}
            {warning.sourcePath || "source path unknown"}
          </em>
          <code>missing anchor: {warning.missingAnchor || warning.missingHeading}</code>
          <p className="note">{warning.nextAction || warning.suggestedAction}</p>
          <div className="inline-actions">
            <button title="Open claim ledger row context" onClick={() => onOpenClaim(warning)}>
              <ClipboardList size={14} />claim
            </button>
            <button
              title="Open generated source page"
              onClick={() => onOpenSource(warning)}
              disabled={!warning.sourcePath}
            >
              <FolderOpen size={14} />source
            </button>
            <button
              title="Open parsed artifact or raw evidence"
              onClick={() => onOpenArtifact(warning)}
              disabled={!warning.artifactPath}
            >
              <FileInput size={14} />artifact
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
