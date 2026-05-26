import { ClipboardList, FileInput, FolderOpen, PanelRightOpen } from "lucide-react";
import { runtimeText, type UiLanguage } from "../../i18n";
import type { TraceabilityWarning } from "../../types";

type TraceabilityActionCardsProps = {
  warnings: TraceabilityWarning[];
  language: UiLanguage | string;
  onOpenClaim: (warning: TraceabilityWarning) => void;
  onOpenSource: (warning: TraceabilityWarning) => void;
  onOpenArtifact: (warning: TraceabilityWarning) => void;
  onSelectWarning?: (warning: TraceabilityWarning) => void;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function missingLabel(isZh: boolean) {
  return isZh ? "缺失" : "missing";
}

export function TraceabilityActionCards({
  warnings,
  language,
  onOpenClaim,
  onOpenSource,
  onOpenArtifact,
  onSelectWarning,
}: TraceabilityActionCardsProps) {
  const isZh = language === "zh";
  const missing = missingLabel(isZh);
  if (warnings.length === 0) {
    return <p className="empty">{isZh ? "暂无证据锚点警告。" : "No evidence-anchor warnings."}</p>;
  }

  return (
    <>
      {warnings.map((warning) => (
        <div className="work-item" key={warning.warningId}>
          <span className={classNames("status-chip", warning.severity)}>{warning.severity}</span>
          <strong>{runtimeText(warning.summary || warning.claimText || warning.claimId, language)}</strong>
          <em>
            {isZh ? "论断" : "claim"} {warning.claimId} · {warning.sourceId || (isZh ? "资料 ID 待定" : "source id pending")} ·{" "}
            {warning.sourcePath || (isZh ? "资料路径未知" : "source path unknown")}
          </em>
          <code>
            {isZh ? "警告" : "warning"}: {warning.warningId}
            {warning.findingId ? ` · ${isZh ? "发现" : "finding"} ${warning.findingId}` : ""}
          </code>
          <code>
            {isZh ? "证据链" : "evidence chain"}: {warning.claimPath || missing} {" -> "}
            {warning.sourcePath || missing} {" -> "}
            {warning.artifactPath || missing}
          </code>
          <code>{isZh ? "缺失锚点" : "missing anchor"}: {runtimeText(warning.missingAnchor || warning.missingHeading, language)}</code>
          <p className="note">{runtimeText(warning.nextAction || warning.suggestedAction, language)}</p>
          <div className="inline-actions">
            {onSelectWarning && (
              <button title={isZh ? "在右侧详情栏固定该警告" : "Pin warning in the right details panel"} onClick={() => onSelectWarning(warning)}>
                <PanelRightOpen size={14} />{isZh ? "详情" : "details"}
              </button>
            )}
            <button title={isZh ? "打开论断台账上下文" : "Open claim ledger row context"} onClick={() => onOpenClaim(warning)}>
              <ClipboardList size={14} />{isZh ? "论断" : "claim"}
            </button>
            <button
              title={isZh ? "打开生成的资料页面" : "Open generated source page"}
              onClick={() => onOpenSource(warning)}
              disabled={!warning.sourcePath}
            >
              <FolderOpen size={14} />{isZh ? "资料" : "source"}
            </button>
            <button
              title={isZh ? "打开解析产物或原始证据" : "Open parsed artifact or raw evidence"}
              onClick={() => onOpenArtifact(warning)}
              disabled={!warning.artifactPath}
            >
              <FileInput size={14} />{isZh ? "解析产物" : "artifact"}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
