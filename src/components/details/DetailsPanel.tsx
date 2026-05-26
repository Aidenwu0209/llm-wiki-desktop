import {
  ClipboardList,
  Copy,
  FileInput,
  FolderOpen,
  GitCompare,
  PanelRightOpen,
  Search,
  ShieldCheck,
  SquareStack,
} from "lucide-react";
import type { UiLanguage } from "../../i18n";
import type { ClaimLedgerItem, EvidencePathItem, TraceabilityWarning, VaultFile, WritebackProposal } from "../../types";

export type DetailSelection =
  | { kind: "empty" }
  | { kind: "source"; file: VaultFile }
  | { kind: "claim"; claim: ClaimLedgerItem; evidence?: EvidencePathItem | null }
  | { kind: "warning"; warning: TraceabilityWarning }
  | { kind: "proposal"; proposal: WritebackProposal };

type DetailsPanelProps = {
  language?: UiLanguage;
  selection: DetailSelection;
  vaultPath: string;
  obsidianUri?: string | null;
  resolveVaultPath: (path?: string | null) => string;
  onOpenPath: (path: string) => void;
  onRevealPath: (path: string) => void;
  onOpenVaultPath: (path?: string | null) => void;
  onCopy: (label: string, text?: string | null) => void;
  onOpenObsidian: () => void;
};

const detailsCopy = {
  zh: {
    title: "详情",
    emptyTitle: "选择证据查看详情",
    emptyBody: "选择资料、论断、警告或写回提案后，这里会固定显示路径、证据和可执行动作。",
    noVault: "未选择知识库",
    open: "打开",
    reveal: "显示",
    copyPath: "复制路径",
    source: "资料",
    status: "状态",
    concepts: "概念",
    evidence: "证据",
    unknown: "未知",
    none: "无",
    notLinked: "未关联",
    noQuote: "没有记录原文引文。",
    copyClaim: "复制论断文本",
    claim: "论断",
    missing: "缺失",
    artifact: "解析产物",
    copyId: "复制 ID",
    log: "日志",
    copyDiff: "复制差异",
    notUpdated: "未更新",
    outboundLinks: "出站链接",
    inboundLinks: "反向链接",
    noLinks: "没有页面级 wikilink。",
  },
  en: {
    title: "Details",
    emptyTitle: "Select evidence to inspect",
    emptyBody: "Choose a source, claim, warning, or writeback proposal to keep its path, evidence, and actions pinned here.",
    noVault: "No vault selected",
    open: "open",
    reveal: "reveal",
    copyPath: "copy path",
    source: "Source",
    status: "Status",
    concepts: "Concepts",
    evidence: "Evidence",
    unknown: "unknown",
    none: "none",
    notLinked: "not linked",
    noQuote: "No direct quote recorded.",
    copyClaim: "copy claim text",
    claim: "claim",
    missing: "Missing",
    artifact: "artifact",
    copyId: "copy id",
    log: "log",
    copyDiff: "copy diff",
    notUpdated: "not updated",
    outboundLinks: "Outbound links",
    inboundLinks: "Backlinks",
    noLinks: "No page-level wikilinks.",
  },
} as const;

type DetailsText = (typeof detailsCopy)[UiLanguage];

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function proposalStatusLabel(status: WritebackProposal["status"], language: UiLanguage) {
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

function DetailActions({
  text,
  path,
  vaultPath,
  obsidianUri,
  resolveVaultPath,
  onOpenPath,
  onRevealPath,
  onCopy,
  onOpenObsidian,
}: {
  text: DetailsText;
  path?: string | null;
  vaultPath: string;
  obsidianUri?: string | null;
  resolveVaultPath: (path?: string | null) => string;
  onOpenPath: (path: string) => void;
  onRevealPath: (path: string) => void;
  onCopy: (label: string, text?: string | null) => void;
  onOpenObsidian: () => void;
}) {
  const absolutePath = resolveVaultPath(path);
  return (
    <div className="details-actions">
      <button disabled={!path} onClick={() => absolutePath && onOpenPath(absolutePath)} type="button">
        <FolderOpen size={14} />{text.open}
      </button>
      <button disabled={!path} onClick={() => absolutePath && onRevealPath(absolutePath)} type="button">
        <Search size={14} />{text.reveal}
      </button>
      <button disabled={!path} onClick={() => onCopy("detail path", absolutePath || path)} type="button">
        <Copy size={14} />{text.copyPath}
      </button>
      <button disabled={!vaultPath && !obsidianUri} onClick={onOpenObsidian} type="button">
        <SquareStack size={14} />Obsidian
      </button>
    </div>
  );
}

function LinkList({
  title,
  links,
  empty,
  onOpenVaultPath,
}: {
  title: string;
  links?: string[];
  empty: string;
  onOpenVaultPath: (path?: string | null) => void;
}) {
  return (
    <div className="details-link-section">
      <strong>{title}</strong>
      {(!links || links.length === 0) && <p>{empty}</p>}
      {links?.slice(0, 8).map((link) => (
        <button key={link} type="button" onClick={() => onOpenVaultPath(link)}>
          <span>{link}</span>
        </button>
      ))}
    </div>
  );
}

export function DetailsPanel({
  language = "zh",
  selection,
  vaultPath,
  obsidianUri,
  resolveVaultPath,
  onOpenPath,
  onRevealPath,
  onOpenVaultPath,
  onCopy,
  onOpenObsidian,
}: DetailsPanelProps) {
  const text = detailsCopy[language];
  return (
    <section className="panel details-panel">
      <div className="section-head">
        <h2>{text.title}</h2>
        <PanelRightOpen size={16} />
      </div>

      {selection.kind === "empty" && (
        <div className="details-empty">
          <strong>{text.emptyTitle}</strong>
          <p>{text.emptyBody}</p>
          <code>{vaultPath || text.noVault}</code>
        </div>
      )}

      {selection.kind === "source" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.file.status || "unknown")}>{selection.file.status || selection.file.kind}</span>
          <h3>{selection.file.title || selection.file.name}</h3>
          <p>{selection.file.kind} · QA {selection.file.qaVerdict || text.unknown} · {selection.file.updated || text.notUpdated}</p>
          <code>{selection.file.path}</code>
          <DetailActions
            text={text}
            path={selection.file.path}
            vaultPath={vaultPath}
            obsidianUri={obsidianUri}
            resolveVaultPath={resolveVaultPath}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
            onCopy={onCopy}
            onOpenObsidian={onOpenObsidian}
          />
          <div className="details-link-grid">
            <LinkList
              title={text.outboundLinks}
              links={selection.file.outboundLinks}
              empty={text.noLinks}
              onOpenVaultPath={onOpenVaultPath}
            />
            <LinkList
              title={text.inboundLinks}
              links={selection.file.inboundLinks}
              empty={text.noLinks}
              onOpenVaultPath={onOpenVaultPath}
            />
          </div>
        </div>
      )}

      {selection.kind === "claim" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.claim.verdict)}>{selection.claim.verdict}</span>
          <h3>{selection.claim.claimId}</h3>
          <p>{selection.claim.claimText}</p>
          <dl className="details-facts">
            <div><dt>{text.source}</dt><dd>{selection.claim.sourceId || selection.claim.sourceUuid || text.unknown}</dd></div>
            <div><dt>{text.status}</dt><dd>{selection.claim.status}</dd></div>
            <div><dt>{text.concepts}</dt><dd>{selection.claim.concepts.join(", ") || text.none}</dd></div>
            <div><dt>{text.evidence}</dt><dd>{selection.claim.evidenceHash || selection.evidence?.evidenceAnchor || text.notLinked}</dd></div>
          </dl>
          <blockquote>{selection.claim.evidenceQuote || selection.evidence?.evidenceQuote || text.noQuote}</blockquote>
          <DetailActions
            text={text}
            path={selection.evidence?.sourcePage || selection.claim.sourcePath || "claims/claims.jsonl"}
            vaultPath={vaultPath}
            obsidianUri={obsidianUri}
            resolveVaultPath={resolveVaultPath}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
            onCopy={onCopy}
            onOpenObsidian={onOpenObsidian}
          />
          <button className="wide" onClick={() => onCopy("claim text", selection.claim.claimText)} type="button">
            <Copy size={14} />{text.copyClaim}
          </button>
        </div>
      )}

      {selection.kind === "warning" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.warning.severity)}>{selection.warning.severity}</span>
          <h3>{selection.warning.summary || selection.warning.claimId}</h3>
          <p>{selection.warning.nextAction || selection.warning.suggestedAction}</p>
          <dl className="details-facts">
            <div><dt>{text.claim}</dt><dd>{selection.warning.claimId}</dd></div>
            <div><dt>{text.source}</dt><dd>{selection.warning.sourceId || text.unknown}</dd></div>
            <div><dt>{text.missing}</dt><dd>{selection.warning.missingAnchor || selection.warning.missingHeading}</dd></div>
          </dl>
          <DetailActions
            text={text}
            path={selection.warning.sourcePath || selection.warning.claimPath}
            vaultPath={vaultPath}
            obsidianUri={obsidianUri}
            resolveVaultPath={resolveVaultPath}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
            onCopy={onCopy}
            onOpenObsidian={onOpenObsidian}
          />
          <div className="details-actions">
            <button onClick={() => onOpenVaultPath(selection.warning.claimPath)} type="button">
              <ClipboardList size={14} />{text.claim}
            </button>
            <button disabled={!selection.warning.artifactPath} onClick={() => onOpenVaultPath(selection.warning.artifactPath)} type="button">
              <FileInput size={14} />{text.artifact}
            </button>
            <button onClick={() => onCopy("warning id", selection.warning.warningId)} type="button">
              <Copy size={14} />{text.copyId}
            </button>
          </div>
        </div>
      )}

      {selection.kind === "proposal" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.proposal.status)}>{proposalStatusLabel(selection.proposal.status, language)}</span>
          <h3>{proposalTitleLabel(selection.proposal.title, language)}</h3>
          <p>{selection.proposal.targetPath}</p>
          <pre className="details-diff">{selection.proposal.diff}</pre>
          <DetailActions
            text={text}
            path={selection.proposal.targetPath}
            vaultPath={vaultPath}
            obsidianUri={obsidianUri}
            resolveVaultPath={resolveVaultPath}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
            onCopy={onCopy}
            onOpenObsidian={onOpenObsidian}
          />
          <div className="details-actions">
            <button disabled={!selection.proposal.logPath} onClick={() => selection.proposal.logPath && onOpenPath(resolveVaultPath(selection.proposal.logPath))} type="button">
              <GitCompare size={14} />{text.log}
            </button>
            <button onClick={() => onCopy("proposal diff", selection.proposal.diff)} type="button">
              <Copy size={14} />{text.copyDiff}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
