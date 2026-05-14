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
import type { ClaimLedgerItem, EvidencePathItem, TraceabilityWarning, VaultFile, WritebackProposal } from "../../types";

export type DetailSelection =
  | { kind: "empty" }
  | { kind: "source"; file: VaultFile }
  | { kind: "claim"; claim: ClaimLedgerItem; evidence?: EvidencePathItem | null }
  | { kind: "warning"; warning: TraceabilityWarning }
  | { kind: "proposal"; proposal: WritebackProposal };

type DetailsPanelProps = {
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

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function DetailActions({
  path,
  vaultPath,
  obsidianUri,
  resolveVaultPath,
  onOpenPath,
  onRevealPath,
  onCopy,
  onOpenObsidian,
}: {
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
        <FolderOpen size={14} />open
      </button>
      <button disabled={!path} onClick={() => absolutePath && onRevealPath(absolutePath)} type="button">
        <Search size={14} />reveal
      </button>
      <button disabled={!path} onClick={() => onCopy("detail path", absolutePath || path)} type="button">
        <Copy size={14} />copy path
      </button>
      <button disabled={!vaultPath && !obsidianUri} onClick={onOpenObsidian} type="button">
        <SquareStack size={14} />Obsidian
      </button>
    </div>
  );
}

export function DetailsPanel({
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
  return (
    <section className="panel details-panel">
      <div className="section-head">
        <h2>Details</h2>
        <PanelRightOpen size={16} />
      </div>

      {selection.kind === "empty" && (
        <div className="details-empty">
          <strong>Select evidence to inspect</strong>
          <p>Choose a source, claim, warning, or writeback proposal to keep its path, evidence, and actions pinned here.</p>
          <code>{vaultPath || "No vault selected"}</code>
        </div>
      )}

      {selection.kind === "source" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.file.status || "unknown")}>{selection.file.status || selection.file.kind}</span>
          <h3>{selection.file.title || selection.file.name}</h3>
          <p>{selection.file.kind} · QA {selection.file.qaVerdict || "unknown"} · {selection.file.updated || "not updated"}</p>
          <code>{selection.file.path}</code>
          <DetailActions
            path={selection.file.path}
            vaultPath={vaultPath}
            obsidianUri={obsidianUri}
            resolveVaultPath={resolveVaultPath}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
            onCopy={onCopy}
            onOpenObsidian={onOpenObsidian}
          />
        </div>
      )}

      {selection.kind === "claim" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.claim.verdict)}>{selection.claim.verdict}</span>
          <h3>{selection.claim.claimId}</h3>
          <p>{selection.claim.claimText}</p>
          <dl className="details-facts">
            <div><dt>Source</dt><dd>{selection.claim.sourceId || selection.claim.sourceUuid || "unknown"}</dd></div>
            <div><dt>Status</dt><dd>{selection.claim.status}</dd></div>
            <div><dt>Concepts</dt><dd>{selection.claim.concepts.join(", ") || "none"}</dd></div>
            <div><dt>Evidence</dt><dd>{selection.claim.evidenceHash || selection.evidence?.evidenceAnchor || "not linked"}</dd></div>
          </dl>
          <blockquote>{selection.claim.evidenceQuote || selection.evidence?.evidenceQuote || "No direct quote recorded."}</blockquote>
          <DetailActions
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
            <Copy size={14} />copy claim text
          </button>
        </div>
      )}

      {selection.kind === "warning" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.warning.severity)}>{selection.warning.severity}</span>
          <h3>{selection.warning.summary || selection.warning.claimId}</h3>
          <p>{selection.warning.nextAction || selection.warning.suggestedAction}</p>
          <dl className="details-facts">
            <div><dt>Claim</dt><dd>{selection.warning.claimId}</dd></div>
            <div><dt>Source</dt><dd>{selection.warning.sourceId || "unknown"}</dd></div>
            <div><dt>Missing</dt><dd>{selection.warning.missingAnchor || selection.warning.missingHeading}</dd></div>
          </dl>
          <DetailActions
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
              <ClipboardList size={14} />claim
            </button>
            <button disabled={!selection.warning.artifactPath} onClick={() => onOpenVaultPath(selection.warning.artifactPath)} type="button">
              <FileInput size={14} />artifact
            </button>
            <button onClick={() => onCopy("warning id", selection.warning.warningId)} type="button">
              <Copy size={14} />copy id
            </button>
          </div>
        </div>
      )}

      {selection.kind === "proposal" && (
        <div className="details-body">
          <span className={classNames("status-chip inline", selection.proposal.status)}>{selection.proposal.status}</span>
          <h3>{selection.proposal.title}</h3>
          <p>{selection.proposal.targetPath}</p>
          <pre className="details-diff">{selection.proposal.diff}</pre>
          <DetailActions
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
              <GitCompare size={14} />log
            </button>
            <button onClick={() => onCopy("proposal diff", selection.proposal.diff)} type="button">
              <Copy size={14} />copy diff
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
