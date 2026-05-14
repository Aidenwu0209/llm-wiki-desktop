import { useMemo, useState } from "react";
import {
  ClipboardCopy,
  FileSearch,
  FolderOpen,
  GitCompare,
  History,
  Lightbulb,
  Search,
  SquareStack,
} from "lucide-react";
import type {
  ClaimLedgerItem,
  EvidencePathItem,
  ReviewQueueItem,
  TraceabilityWarning,
  VaultFile,
  VaultStatus,
  WritebackProposal,
} from "../../types";

const DEFAULT_DEEPSEEK_QUESTIONS = [
  "DeepSeek 的研发思路是什么？",
  "DeepSeek 如何做技术取舍？",
  "DeepSeek 可能如何演进？",
  "哪些洞察值得写回 wiki？",
];

const HISTORY_KEY = "llm-wiki-desktop.chat-search.history";
const CLAIM_LEDGER_PATH = "claims/claims.jsonl";
const REVIEW_QUEUE_PATH = "reviews/science-review-queue.md";
const WRITEBACK_QUEUE_PATH = "reviews/query-writeback/";

type SearchKind = VaultFile["kind"] | "claim" | "evidence" | "review" | "writeback" | "traceability";
type SearchFilter = SearchKind | "all";

type SearchResult = {
  id: string;
  type: SearchKind;
  title: string;
  path: string;
  snippet: string;
  evidence?: string | null;
  status?: string | null;
  severity?: string | null;
  relations: string[];
  searchText: string;
  priority: number;
};

type ChatSearchPageProps = {
  className?: string;
  vaultPath: string;
  status: VaultStatus | null;
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  reviewItems: ReviewQueueItem[];
  writebacks: WritebackProposal[];
  traceabilityWarnings: TraceabilityWarning[];
  busy: string | null;
  onCreateProposal: (question: string, targetPath: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  resolveVaultPath: (path?: string | null) => string;
  onOpenVaultItem?: (path?: string | null) => void | Promise<void>;
  onRevealPath?: (path: string) => void | Promise<void>;
  onCopyText?: (label: string, text?: string | null) => void | Promise<void>;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function compactText(value?: string | null, maxLength = 220) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function relation(label: string, value?: string | number | boolean | null) {
  if (value === undefined || value === null || value === "" || value === false) return null;
  return `${label}: ${String(value)}`;
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  } catch {
    // History is convenience state only; ignore private mode or storage quota failures.
  }
}

function tokenize(query: string) {
  const lower = query.toLocaleLowerCase();
  const asciiTerms = lower
    .split(/[\s,.;:!?，。；：！？、()[\]{}"'`]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const cjkTerms = lower.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  return Array.from(new Set([...asciiTerms, ...cjkTerms]));
}

function scoreResult(result: SearchResult, query: string) {
  const trimmed = query.trim().toLocaleLowerCase();
  if (!trimmed) return result.priority;
  const haystack = result.searchText.toLocaleLowerCase();
  const terms = tokenize(trimmed);
  let score = 0;
  if (haystack.includes(trimmed)) score += 12;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 8 ? 5 : 3;
  }
  if (result.type === "claim" || result.type === "evidence") score += 2;
  if (result.status === "needs_review" || result.status === "proposed") score += 1;
  return score;
}

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

function unique(items: Array<string | null>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function buildEvidenceIndex(evidencePaths: EvidencePathItem[]) {
  const byClaim = new Map<string, EvidencePathItem[]>();
  for (const item of evidencePaths) {
    const current = byClaim.get(item.claimId) ?? [];
    current.push(item);
    byClaim.set(item.claimId, current);
  }
  return byClaim;
}

function buildSearchIndex({
  status,
  claims,
  evidencePaths,
  reviewItems,
  writebacks,
  traceabilityWarnings,
}: Pick<ChatSearchPageProps, "status" | "claims" | "evidencePaths" | "reviewItems" | "writebacks" | "traceabilityWarnings">) {
  const evidenceByClaim = buildEvidenceIndex(evidencePaths);
  const results: SearchResult[] = [];
  const files = status?.files ?? [];

  for (const file of files) {
    const title = file.title || file.name || file.path;
    const status = file.status || file.qaVerdict || (file.needsReview ? "needs_review" : null);
    const relations = unique([
      relation("kind", file.kind),
      relation("status", file.status),
      relation("QA", file.qaVerdict),
      relation("needs review", file.needsReview ? file.needsReview : null),
      relation("updated", file.updated),
    ]);
    const snippet = compactText([status, file.updated, file.path].filter(Boolean).join(" · "));
    results.push({
      id: `file:${file.path}`,
      type: file.kind,
      title,
      path: file.path,
      snippet: snippet || file.path,
      status,
      evidence: file.qaVerdict,
      relations,
      searchText: [title, file.name, file.path, file.kind, file.status, file.qaVerdict, file.updated].join(" "),
      priority: file.kind === "concept" ? 6 : file.kind === "source" ? 5 : 3,
    });
  }

  for (const claim of claims) {
    const evidenceItems = evidenceByClaim.get(claim.claimId) ?? [];
    const evidence = evidenceItems[0];
    const sourcePath = claim.sourcePath || evidence?.sourcePage || evidence?.rawPath || "";
    const relations = unique([
      relation("claim", claim.claimId),
      relation("source", claim.sourceId || claim.sourceUuid || evidence?.sourceId),
      relation("source path", sourcePath),
      relation("verdict", claim.verdict),
      relation("status", claim.status),
      relation("concepts", claim.concepts.join(", ")),
      relation("line", claim.line),
    ]);
    results.push({
      id: `claim:${claim.claimId}:${claim.line}`,
      type: "claim",
      title: claim.claimId,
      path: CLAIM_LEDGER_PATH,
      snippet: compactText(claim.claimText),
      status: claim.needsReview ? "needs_review" : claim.verdict || claim.status,
      evidence: compactText(claim.evidenceQuote || evidence?.evidenceQuote || claim.evidenceHash || evidence?.evidenceAnchor),
      relations,
      searchText: [
        claim.claimId,
        claim.claimText,
        claim.sourceId,
        claim.sourceUuid,
        claim.sourcePath,
        claim.verdict,
        claim.status,
        claim.evidenceQuote,
        claim.evidenceHash,
        claim.concepts.join(" "),
      ].join(" "),
      priority: claim.needsReview ? 9 : 7,
    });
  }

  for (const item of evidencePaths) {
    const path = item.sourcePage || item.artifactPath || item.qaReportPath || item.rawPath || CLAIM_LEDGER_PATH;
    const relations = unique([
      relation("claim", item.claimId),
      relation("source", item.sourceId || item.sourceUuid),
      relation("concept", item.concept),
      relation("semantic", item.semanticStatus),
      relation("science review", item.scienceReviewStatus),
      relation("missing", item.missing.join(", ")),
    ]);
    results.push({
      id: `evidence:${item.claimId}:${path}`,
      type: "evidence",
      title: item.claimId,
      path,
      snippet: compactText(item.claimText),
      status: item.chainStatus,
      evidence: compactText(item.evidenceQuote || item.evidenceAnchor || item.chunksPath || item.artifactPath),
      relations,
      searchText: [
        item.claimId,
        item.claimText,
        item.chainStatus,
        item.sourceId,
        item.sourceUuid,
        item.sourcePage,
        item.evidenceAnchor,
        item.evidenceQuote,
        item.rawPath,
        item.artifactPath,
        item.qaReportPath,
        item.concept,
        item.missing.join(" "),
      ].join(" "),
      priority: item.chainStatus === "ok" ? 6 : 10,
    });
  }

  for (const item of reviewItems) {
    const path = item.targetPath || item.evidencePath || REVIEW_QUEUE_PATH;
    const relations = unique([
      relation("review", item.itemId),
      relation("kind", item.kind),
      relation("claim", item.claimId),
      relation("source", item.sourceId),
      relation("status", item.status),
      relation("action", item.recommendedAction),
    ]);
    results.push({
      id: `review:${item.itemId}`,
      type: "review",
      title: item.title,
      path,
      snippet: compactText(item.body),
      status: item.status,
      severity: item.severity,
      evidence: compactText(item.evidencePath || item.recommendedAction),
      relations,
      searchText: [
        item.itemId,
        item.kind,
        item.severity,
        item.title,
        item.body,
        item.status,
        item.targetPath,
        item.sourceId,
        item.claimId,
        item.evidencePath,
        item.recommendedAction,
      ].join(" "),
      priority: item.status === "open" || item.status === "needs_review" ? 9 : 5,
    });
  }

  for (const proposal of writebacks) {
    const path = proposal.targetPath || WRITEBACK_QUEUE_PATH;
    const relations = unique([
      relation("proposal", proposal.proposalId),
      relation("status", proposal.status),
      relation("target", proposal.targetPath),
      relation("updated", proposal.updatedAt),
      relation("applied", proposal.appliedAt),
    ]);
    results.push({
      id: `writeback:${proposal.proposalId}`,
      type: "writeback",
      title: proposal.title || proposal.proposalId,
      path,
      snippet: compactText(proposal.content || proposal.diff),
      status: proposal.status,
      evidence: compactText(proposal.diff),
      relations,
      searchText: [
        proposal.proposalId,
        proposal.targetPath,
        proposal.title,
        proposal.status,
        proposal.diff,
        proposal.content,
        proposal.updatedAt,
      ].join(" "),
      priority: proposal.status === "proposed" ? 8 : 4,
    });
  }

  for (const warning of traceabilityWarnings) {
    const path = warning.sourcePath || warning.artifactPath || warning.claimPath || CLAIM_LEDGER_PATH;
    const relations = unique([
      relation("claim", warning.claimId),
      relation("source", warning.sourceId),
      relation("source path", warning.sourcePath),
      relation("artifact", warning.artifactPath),
      relation("missing anchor", warning.missingAnchor),
      relation("action", warning.nextAction || warning.suggestedAction),
    ]);
    results.push({
      id: `traceability:${warning.warningId}`,
      type: "traceability",
      title: warning.summary || warning.warningId,
      path,
      snippet: compactText(warning.claimText || warning.summary),
      status: warning.severity,
      severity: warning.severity,
      evidence: compactText(warning.missingAnchor || warning.missingHeading || warning.suggestedAction),
      relations,
      searchText: [
        warning.warningId,
        warning.claimId,
        warning.claimText,
        warning.claimPath,
        warning.sourceId,
        warning.sourcePath,
        warning.artifactPath,
        warning.missingHeading,
        warning.missingAnchor,
        warning.severity,
        warning.summary,
        warning.suggestedAction,
        warning.nextAction,
      ].join(" "),
      priority: warning.severity === "p0" || warning.severity === "p1" ? 11 : 8,
    });
  }

  return results;
}

function answerTheme(question: string) {
  if (question.includes("取舍")) return "technical tradeoff";
  if (question.includes("演进")) return "evolution forecast";
  if (question.includes("写回")) return "writeback candidate";
  return "research strategy";
}

function buildAnswerDraft(question: string, targetPath: string, evidence: SearchResult[]) {
  const theme = answerTheme(question);
  const evidenceBullets = evidence.length
    ? evidence.map((item, index) => (
      `- E${index + 1} [${item.type}] ${item.title} (${item.path}): ${item.snippet}${item.evidence ? ` Evidence: ${item.evidence}` : ""}`
    )).join("\n")
    : "- No loaded vault evidence matched yet. Refresh the vault or run ingest before turning this into a proposal.";

  const claimRefs = unique(evidence.map((item) => item.relations.find((entry) => entry.startsWith("claim:")) ?? null)).slice(0, 5);
  const sourceRefs = unique(evidence.map((item) => item.relations.find((entry) => entry.startsWith("source")) ?? null)).slice(0, 5);

  return [
    `Question: ${question || "No question entered"}`,
    "",
    "## Evidence",
    evidenceBullets,
    "",
    "## Inference",
    `- Theme: ${theme}. The current answer should be constrained to the retrieved vault objects above, especially claims, source pages, concepts, review items, and writeback proposals.`,
    `- Claim references in scope: ${claimRefs.length ? claimRefs.join("; ") : "none in loaded evidence"}.`,
    `- Source references in scope: ${sourceRefs.length ? sourceRefs.join("; ") : "none in loaded evidence"}.`,
    "",
    "## Hypothesis",
    "- A stronger answer may emerge after unresolved review items and broken evidence anchors are resolved; do not treat this section as approved wiki knowledge.",
    "",
    "## Forecast",
    "- Forecasts should be written as possible evolution paths only when the supporting source or claim chain is visible in the evidence map.",
    "",
    "## Proposal-first writeback",
    `- Target proposal path: ${targetPath || "reviews/query-writeback/deepseek-research-insights.md"}.`,
    "- Next action: create a query writeback proposal for review. This page does not apply writes or approve proposals.",
  ].join("\n");
}

export function ChatSearchPage({
  className,
  vaultPath,
  status,
  claims,
  evidencePaths,
  reviewItems,
  writebacks,
  traceabilityWarnings,
  busy,
  onCreateProposal,
  onOpenPath,
  resolveVaultPath,
  onOpenVaultItem,
  onRevealPath,
  onCopyText,
}: ChatSearchPageProps) {
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchFilter>("all");
  const [question, setQuestion] = useState(DEFAULT_DEEPSEEK_QUESTIONS[0]);
  const [targetPath, setTargetPath] = useState("reviews/query-writeback/deepseek-research-insights.md");
  const [answerDraft, setAnswerDraft] = useState("");
  const [history, setHistory] = useState<string[]>(loadHistory);
  const index = useMemo(
    () => buildSearchIndex({ status, claims, evidencePaths, reviewItems, writebacks, traceabilityWarnings }),
    [claims, evidencePaths, reviewItems, status, traceabilityWarnings, writebacks],
  );

  const filteredResults = useMemo(() => {
    const typed = typeFilter === "all" ? index : index.filter((item) => item.type === typeFilter);
    const ranked = typed
      .map((item) => ({ item, score: scoreResult(item, searchText) }))
      .filter(({ score }) => !searchText.trim() || score > 0)
      .sort((a, b) => b.score - a.score || b.item.priority - a.item.priority)
      .map(({ item }) => item);

    if (ranked.length || !searchText.trim()) return ranked.slice(0, 40);
    return typed.sort((a, b) => b.priority - a.priority).slice(0, 16);
  }, [index, searchText, typeFilter]);

  const answerEvidence = filteredResults
    .filter((item) => ["claim", "evidence", "source", "concept", "review", "writeback", "traceability"].includes(item.type))
    .slice(0, 8);
  const hasVaultEvidence = index.length > 0;

  const rememberQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, 8);
    setHistory(next);
    saveHistory(next);
  };

  const chooseQuestion = (question: string) => {
    setQuestion(question);
    setSearchText(question);
    rememberQuery(question);
  };

  const generateDraft = () => {
    rememberQuery(question);
    if (!searchText.trim()) setSearchText(question);
    setAnswerDraft(buildAnswerDraft(question, targetPath, answerEvidence));
  };

  const createProposal = () => {
    rememberQuery(question);
    onCreateProposal(question, targetPath);
  };

  const openResult = (result: SearchResult) => {
    onOpenPath(resolveVaultPath(result.path));
  };

  const copyResult = (result: SearchResult) => {
    onCopyText?.(
      "search result",
      [
        `${result.type}: ${result.title}`,
        `path: ${result.path}`,
        `snippet: ${result.snippet}`,
        result.evidence ? `evidence: ${result.evidence}` : "",
        result.relations.length ? `relations: ${result.relations.join(" | ")}` : "",
      ].filter(Boolean).join("\n"),
    );
  };

  return (
    <div className={classNames("chat-search-page chat-search-workbench", className)}>
      <section className="panel large search-panel">
        <div className="section-head">
          <h2>Vault Search</h2>
          <span>{filteredResults.length}/{index.length} loaded objects</span>
        </div>
        <div className="search-toolbar">
          <label>
            <Search size={15} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search source pages, claims, concepts, reviews, and writeback proposals"
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as SearchFilter)}>
            <option value="all">all types</option>
            <option value="source">sources</option>
            <option value="claim">claims</option>
            <option value="concept">concepts</option>
            <option value="review">reviews</option>
            <option value="writeback">writebacks</option>
            <option value="evidence">evidence paths</option>
            <option value="traceability">traceability</option>
            <option value="report">reports</option>
            <option value="inbox">inbox</option>
          </select>
        </div>
        <div className="question-chips">
          {DEFAULT_DEEPSEEK_QUESTIONS.map((question) => (
            <button key={question} type="button" onClick={() => chooseQuestion(question)}>
              {question}
            </button>
          ))}
        </div>
        <div className="search-results">
          {!hasVaultEvidence && <p className="empty">Open or refresh a generated vault to search loaded wiki objects.</p>}
          {hasVaultEvidence && filteredResults.length === 0 && <p className="empty">No matching vault objects.</p>}
          {filteredResults.map((result) => (
            <article className="search-result-card" key={result.id}>
              <span className={classNames("status-chip", result.severity || result.status || result.type)}>
                {result.severity || result.status || result.type}
              </span>
              <div className="search-result-body">
                <strong>{result.title}</strong>
                <em>{result.type} · {result.path}</em>
                <p>{result.snippet || "No snippet available."}</p>
                {result.evidence && <code>{result.evidence}</code>}
                <div className="relation-list">
                  {result.relations.slice(0, 8).map((item) => (
                    <span key={`${result.id}-${item}`}>{item}</span>
                  ))}
                </div>
                <div className="inline-actions">
                  <button type="button" onClick={() => openResult(result)}><FolderOpen size={14} />open</button>
                  <button type="button" onClick={() => onOpenVaultItem?.(result.path)} disabled={!onOpenVaultItem || !isMarkdownPath(result.path)}>
                    <SquareStack size={14} />Obsidian
                  </button>
                  <button type="button" onClick={() => onRevealPath?.(resolveVaultPath(result.path))} disabled={!onRevealPath}><FileSearch size={14} />reveal</button>
                  <button type="button" onClick={() => onCopyText?.("path", result.path)} disabled={!onCopyText}><ClipboardCopy size={14} />path</button>
                  <button type="button" onClick={() => copyResult(result)} disabled={!onCopyText}><ClipboardCopy size={14} />evidence</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel large research-chat-panel">
        <div className="section-head">
          <h2>Research Chat</h2>
          <span>evidence-first draft</span>
        </div>
        <div className="writeback-form">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a DeepSeek research question. The draft below separates evidence, inference, hypothesis, and forecast."
          />
          <input
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
            placeholder="reviews/query-writeback/deepseek-research-insights.md"
          />
          <div className="inline-actions">
            <button type="button" onClick={generateDraft} disabled={!vaultPath || !question.trim()}>
              <Lightbulb size={14} />draft answer
            </button>
            <button type="button" onClick={createProposal} disabled={!vaultPath || !question.trim() || busy === "query_writeback"}>
              <GitCompare size={14} />create proposal
            </button>
            <button type="button" onClick={() => onCopyText?.("answer draft", answerDraft)} disabled={!answerDraft || !onCopyText}>
              <ClipboardCopy size={14} />copy draft
            </button>
          </div>
        </div>

        <div className="proposal-boundary">
          <strong>Proposal-first boundary</strong>
          <span>No source or concept page is written from this chat page. The proposal button uses the existing query writeback flow and still requires explicit approval before apply.</span>
        </div>

        <div className="answer-evidence-map">
          <div className="section-head compact">
            <h3>Evidence map</h3>
            <span>{answerEvidence.length} selected</span>
          </div>
          <div className="evidence-pill-grid">
            {answerEvidence.length === 0 && <p className="empty">Search results will populate the evidence map.</p>}
            {answerEvidence.map((item, index) => (
              <button key={`evidence-map-${item.id}`} type="button" onClick={() => openResult(item)}>
                <span>E{index + 1}</span>
                <strong>{item.title}</strong>
                <em>{item.type} · {item.status || "loaded"}</em>
              </button>
            ))}
          </div>
        </div>

        <pre className="chat-answer-draft">
          {answerDraft || "Draft an answer after choosing a question or running a search. The output will remain a local draft until converted into a writeback proposal."}
        </pre>

        <div className="recent-query-panel">
          <div className="section-head compact">
            <h3><History size={15} /> Recent queries</h3>
            <span>{history.length}</span>
          </div>
          <div className="question-chips compact">
            {history.length === 0 && <p className="empty">No recent research queries yet.</p>}
            {history.map((question) => (
              <button key={question} type="button" onClick={() => chooseQuestion(question)}>
                {question}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
