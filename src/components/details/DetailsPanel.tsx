import { isValidElement, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
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
import { readVaultImageFile, readVaultTextFile } from "../../tauri";
import type { ClaimLedgerItem, EvidencePathItem, TraceabilityWarning, VaultFile, VaultTextFilePreview, WritebackProposal } from "../../types";

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
    preview: "只读预览",
    loadingPreview: "正在读取预览...",
    previewUnavailable: "无法读取预览",
    truncatedPreview: "内容较长，当前只显示前 64 KB。",
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
    preview: "Read-only preview",
    loadingPreview: "Loading preview...",
    previewUnavailable: "Preview unavailable",
    truncatedPreview: "Long file: showing the first 64 KB only.",
  },
} as const;

type DetailsText = (typeof detailsCopy)[UiLanguage];

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function proposalStatusLabel(status: WritebackProposal["status"], language: UiLanguage) {
  if (language !== "zh" && status === "review_only") return "review artifact";
  if (language !== "zh") return status;
  const labels: Record<string, string> = {
    proposed: "待审核",
    approved: "已批准",
    rejected: "已拒绝",
    applied: "已应用",
    review_only: "仅审核产物",
  };
  return labels[status] ?? status;
}

function proposalTitleLabel(title: string, language: UiLanguage) {
  if (language === "zh" && title === "DeepSeek research insight query") return "DeepSeek 研究洞察提案";
  return title;
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: VaultTextFilePreview }
  | { status: "error"; error: string };

type ImagePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; path: string; sizeBytes: number }
  | { status: "error"; error: string };

type MermaidPreviewState =
  | { status: "rendering" }
  | { status: "ready"; svg: string }
  | { status: "error"; error: string };

const WIKILINK_HREF_PREFIX = "#__llmwiki__=";
const VAULT_ROOT_RELATIVE_PREFIXES = new Set([
  ".graph",
  "assets",
  "claims",
  "concepts",
  "drafts",
  "media",
  "qa-reports",
  "raw",
  "reports",
  "reviews",
  "sources",
  "templates",
]);

function canPreviewVaultText(path?: string | null) {
  return Boolean(path && /\.(md|markdown|txt|json|jsonl|csv|tsv)$/i.test(path));
}

function transformWikilinks(markdown: string) {
  if (!markdown.includes("[[")) return markdown;
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) => (index % 2 === 1 ? part : transformWikilinksOutsideCode(part)))
    .join("");
}

function transformWikilinksOutsideCode(markdown: string) {
  if (!markdown.includes("[[")) return markdown;
  return markdown
    .split(/(`[^`\n]+`)/g)
    .map((part, index) => (index % 2 === 1 ? part : replaceWikilinks(part)))
    .join("");
}

function replaceWikilinks(markdown: string) {
  return markdown.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g, (_match, rawTarget: string, rawAlias?: string) => {
    const target = rawTarget.trim();
    const alias = rawAlias?.trim() || target;
    if (!target) return alias;
    return `[${alias.replace(/\[/g, "\\[").replace(/\]/g, "\\]")}](${WIKILINK_HREF_PREFIX}${encodeURIComponent(target)})`;
  });
}

function normalizeWikilinkTarget(value?: string | null) {
  return (value || "")
    .split("|")[0]
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(md|markdown)$/i, "")
    .trim()
    .toLowerCase();
}

function wikilinkCandidateKeys(path?: string | null) {
  const normalized = normalizeWikilinkTarget(path);
  const basename = normalized.split("/").filter(Boolean).pop() || normalized;
  return [normalized, basename].filter(Boolean);
}

function resolveWikilinkTarget(target: string, outboundLinks?: string[]) {
  const targetKey = normalizeWikilinkTarget(target);
  if (!targetKey) return "";
  for (const link of outboundLinks || []) {
    if (wikilinkCandidateKeys(link).includes(targetKey)) return link;
  }
  const fallbackPath = target
    .split("#")[0]
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  if (fallbackPath.includes("/")) return /\.(md|markdown)$/i.test(fallbackPath) ? fallbackPath : `${fallbackPath}.md`;
  return fallbackPath;
}

function isExternalMarkdownHref(href: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

function decodeMarkdownHrefPath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalizeVaultRelativePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return "";
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function resolveMarkdownVaultLinkTarget(href: string, currentPath?: string | null) {
  const target = href.trim();
  if (!target || target.startsWith("#") || isExternalMarkdownHref(target)) return "";
  const pathOnly = decodeMarkdownHrefPath(target.split("#")[0].split("?")[0]).replace(/^\/+/, "");
  if (!pathOnly) return "";
  const currentParts = (currentPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  currentParts.pop();
  return normalizeVaultRelativePath([...currentParts, pathOnly].join("/"));
}

function isDirectRenderableImageSrc(src: string) {
  return /^(data:|blob:|asset:|https:\/\/asset\.localhost)/i.test(src);
}

function resolveMarkdownVaultAssetTarget(src: string, currentPath?: string | null) {
  const target = src.trim();
  if (!target || target.startsWith("#") || isExternalMarkdownHref(target)) return "";
  const pathOnly = decodeMarkdownHrefPath(target.split("#")[0].split("?")[0]);
  const rootRelative = pathOnly.startsWith("/");
  const cleaned = pathOnly.replace(/^\/+/, "");
  if (!cleaned) return "";
  const firstSegment = cleaned.replace(/\\/g, "/").split("/").filter(Boolean)[0] || "";
  if (rootRelative || VAULT_ROOT_RELATIVE_PREFIXES.has(firstSegment)) {
    return normalizeVaultRelativePath(cleaned);
  }
  const currentParts = (currentPath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  currentParts.pop();
  return normalizeVaultRelativePath([...currentParts, cleaned].join("/"));
}

function imagePlaceholderText(alt?: string | null, src?: string | null) {
  return alt || src ? `Image: ${alt || src}` : "Image omitted";
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

function MermaidDiagram({ code }: { code: string }) {
  const [state, setState] = useState<MermaidPreviewState>({ status: "rendering" });
  const [diagramId] = useState(() => `details-mermaid-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "rendering" });
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#eef6f0",
            primaryTextColor: "#17201d",
            primaryBorderColor: "#9eb2a8",
            lineColor: "#52625b",
            secondaryColor: "#eef6ff",
            tertiaryColor: "#f7f8f5",
          },
        });
        return mermaid.render(diagramId, code);
      })
      .then(({ svg }) => {
        if (!cancelled) setState({ status: "ready", svg });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  if (state.status === "ready") {
    return <div className="details-mermaid-frame" dangerouslySetInnerHTML={{ __html: state.svg }} />;
  }
  if (state.status === "error") {
    return (
      <div className="details-mermaid-error">
        <strong>Mermaid render failed</strong>
        <code>{state.error}</code>
      </div>
    );
  }
  return <div className="details-mermaid-loading">Rendering diagram...</div>;
}

function unwrapMermaidPre(children: ReactNode) {
  if (isValidElement(children) && children.type === MermaidDiagram) return children;
  if (
    Array.isArray(children) &&
    children.length === 1 &&
    isValidElement(children[0]) &&
    children[0].type === MermaidDiagram
  ) {
    return children[0];
  }
  return null;
}

function MarkdownPreview({
  content,
  currentPath,
  vaultPath,
  outboundLinks,
  onOpenVaultPath,
}: {
  content: string;
  currentPath?: string | null;
  vaultPath: string;
  outboundLinks?: string[];
  onOpenVaultPath: (path?: string | null) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ children, href }) => {
          const target = typeof href === "string" ? href : "";
          const isWikilink = target.startsWith(WIKILINK_HREF_PREFIX);
          const markdownVaultTarget = isWikilink ? "" : resolveMarkdownVaultLinkTarget(target, currentPath);
          const isVaultLink = Boolean(markdownVaultTarget);
          return (
            <a
              href={target || undefined}
              rel={isWikilink || isVaultLink ? undefined : "noreferrer"}
              target={isWikilink || isVaultLink ? undefined : "_blank"}
              className={classNames(isWikilink && "details-wikilink", isVaultLink && "details-vault-link")}
              onClick={(event) => {
                if (!isWikilink && !isVaultLink) return;
                event.preventDefault();
                if (isVaultLink) {
                  onOpenVaultPath(markdownVaultTarget);
                  return;
                }
                const raw = target.slice(WIKILINK_HREF_PREFIX.length);
                const decoded = (() => {
                  try {
                    return decodeURIComponent(raw);
                  } catch {
                    return raw;
                  }
                })();
                onOpenVaultPath(resolveWikilinkTarget(decoded, outboundLinks));
              }}
            >
              {children}
            </a>
          );
        },
        img: ({ alt, src }) => (
          <MarkdownImage
            alt={alt}
            currentPath={currentPath}
            src={typeof src === "string" ? src : ""}
            vaultPath={vaultPath}
          />
        ),
        pre: ({ children, ...props }) => {
          const mermaid = unwrapMermaidPre(children);
          if (mermaid) return <>{mermaid}</>;
          return <pre {...props}>{children}</pre>;
        },
        code: ({ className, children, ...props }) => {
          const language = className?.replace("language-", "").trim().toLowerCase();
          const codeText = String(children).replace(/\n$/, "");
          if (language === "mermaid") return <MermaidDiagram code={codeText} />;
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {transformWikilinks(content)}
    </ReactMarkdown>
  );
}

function MarkdownImage({
  alt,
  currentPath,
  src,
  vaultPath,
}: {
  alt?: string | null;
  currentPath?: string | null;
  src: string;
  vaultPath: string;
}) {
  const vaultTarget = resolveMarkdownVaultAssetTarget(src, currentPath);
  const [state, setState] = useState<ImagePreviewState>({ status: "idle" });

  useEffect(() => {
    if (!vaultPath || !vaultTarget) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    let objectUrl = "";
    setState({ status: "loading" });
    readVaultImageFile(vaultPath, vaultTarget)
      .then((preview) => {
        const bytes = new Uint8Array(preview.bytes);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: preview.mimeType }));
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setState({ status: "ready", url: objectUrl, path: preview.path, sizeBytes: preview.sizeBytes });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", error: String(err) });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [vaultPath, vaultTarget]);

  if (src && isDirectRenderableImageSrc(src)) {
    return <img alt={alt || ""} className="details-markdown-image" loading="lazy" src={src} />;
  }
  if (!vaultTarget) {
    return <span className="details-markdown-image-placeholder">{imagePlaceholderText(alt, src)}</span>;
  }
  if (state.status === "ready") {
    return (
      <figure className="details-markdown-image-frame">
        <img alt={alt || ""} className="details-markdown-image" loading="lazy" src={state.url} />
        <figcaption>{alt || state.path} · {state.sizeBytes} bytes</figcaption>
      </figure>
    );
  }
  if (state.status === "error") {
    return (
      <span className="details-markdown-image-placeholder" title={state.error}>
        {imagePlaceholderText(alt, src)} unavailable
      </span>
    );
  }
  return <span className="details-markdown-image-placeholder">{imagePlaceholderText(alt, src)} loading...</span>;
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
  const sourcePreviewPath = selection.kind === "source" ? selection.file.path : null;
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!vaultPath || !canPreviewVaultText(sourcePreviewPath)) {
      setPreviewState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setPreviewState({ status: "loading" });
    readVaultTextFile(vaultPath, sourcePreviewPath as string)
      .then((preview) => {
        if (!cancelled) setPreviewState({ status: "ready", preview });
      })
      .catch((err) => {
        if (!cancelled) setPreviewState({ status: "error", error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [sourcePreviewPath, vaultPath]);

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
          {canPreviewVaultText(selection.file.path) && (
            <div className="details-preview">
              <div className="section-head compact">
                <h3>{text.preview}</h3>
                {previewState.status === "ready" && <span>{previewState.preview.sizeBytes} bytes</span>}
              </div>
              {previewState.status === "loading" && <p>{text.loadingPreview}</p>}
              {previewState.status === "error" && (
                <p>{text.previewUnavailable}: {previewState.error}</p>
              )}
              {previewState.status === "ready" && (
                <>
                  <div className="details-markdown-preview">
                    <MarkdownPreview
                      content={previewState.preview.content}
                      currentPath={previewState.preview.path || selection.file.path}
                      vaultPath={vaultPath}
                      outboundLinks={selection.file.outboundLinks}
                      onOpenVaultPath={onOpenVaultPath}
                    />
                  </div>
                  {previewState.preview.truncated && <p>{text.truncatedPreview}</p>}
                </>
              )}
            </div>
          )}
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
