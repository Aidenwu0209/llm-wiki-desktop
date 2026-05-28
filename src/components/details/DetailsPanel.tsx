import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  BookOpen,
  ClipboardList,
  Copy,
  FileInput,
  FolderOpen,
  GitCompare,
  PanelRightOpen,
  Search,
  ShieldCheck,
  SquareStack,
  X,
} from "lucide-react";
import type { UiLanguage } from "../../i18n";
import { canPreviewVaultPath } from "../../lib/vaultPath";
import { isTauriAvailable, readVaultImageFile, readVaultTextFile } from "../../tauri";
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
    sourceRefs: "资料引用",
    noLinks: "没有页面级 wikilink。",
    noSourceRefs: "没有 frontmatter 资料引用。",
    moreLinks: (count: number) => `还有 ${count} 条未显示`,
    frontmatterRefs: "frontmatter",
    pageLinks: "页面链接",
    incomingLinks: "入链",
    preview: "只读预览",
    outline: "页面大纲",
    reader: "阅读",
    closeReader: "关闭阅读",
    loadingPreview: "正在读取预览...",
    previewUnavailable: "无法读取预览",
    truncatedPreview: "内容较长，当前只显示前 64 KB。",
    path: "路径",
    kind: "类型",
    updated: "更新",
    qa: "QA",
    reviewState: "审核状态",
    reviewFlags: "待核对",
    properties: "页面属性",
    frontmatter: "Frontmatter",
    pageStatus: "页面状态",
    sourceId: "资料 ID",
    noFrontmatter: "没有 frontmatter 属性。",
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
    sourceRefs: "Source refs",
    noLinks: "No page-level wikilinks.",
    noSourceRefs: "No frontmatter source references.",
    moreLinks: (count: number) => `${count} more not shown`,
    frontmatterRefs: "frontmatter",
    pageLinks: "page links",
    incomingLinks: "incoming",
    preview: "Read-only preview",
    outline: "Outline",
    reader: "Reader",
    closeReader: "Close reader",
    loadingPreview: "Loading preview...",
    previewUnavailable: "Preview unavailable",
    truncatedPreview: "Long file: showing the first 64 KB only.",
    path: "Path",
    kind: "Kind",
    updated: "Updated",
    qa: "QA",
    reviewState: "Review state",
    reviewFlags: "Review flags",
    properties: "Page properties",
    frontmatter: "Frontmatter",
    pageStatus: "Page status",
    sourceId: "Source ID",
    noFrontmatter: "No frontmatter properties.",
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

type PreviewHeading = {
  id: string;
  level: number;
  text: string;
};

type FrontmatterValue = string | string[];
type FrontmatterRecord = Record<string, FrontmatterValue>;

type ParsedPreviewDocument = {
  content: string;
  frontmatter: FrontmatterRecord;
};

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

function metadataOnlyPreview(file: VaultFile, language: UiLanguage): VaultTextFilePreview {
  const lines = [
    `# ${file.title || file.name}`,
    "",
    language === "zh"
      ? "浏览器预览只显示页面元数据。请在桌面端打开真实 vault 读取文件正文。"
      : "Browser preview shows page metadata only. Open the desktop app against a real vault to read file contents.",
    "",
    `- Path: ${file.path}`,
    `- Type: ${file.kind}`,
    `- Status: ${file.status || "unknown"}`,
    file.sourceId ? `- Source ID: ${file.sourceId}` : "",
    file.updated ? `- Updated: ${file.updated}` : "",
  ].filter(Boolean);
  return {
    path: file.path,
    sizeBytes: 0,
    content: `${lines.join("\n")}\n`,
    truncated: false,
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function firstHeadingText(markdown: string) {
  const heading = extractPreviewHeadings(markdown).find((item) => item.level === 1);
  return heading?.text || "";
}

function stripFrontmatterQuotes(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(markdown: string): ParsedPreviewDocument {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return { content: markdown, frontmatter: {} };
  }
  const lines = markdown.split(/\r?\n/);
  if (lines[0].trim() !== "---") return { content: markdown, frontmatter: {} };
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex <= 0) return { content: markdown, frontmatter: {} };

  const frontmatter: FrontmatterRecord = {};
  let activeKey = "";
  for (const rawLine of lines.slice(1, endIndex)) {
    const line = rawLine.replace(/\t/g, "  ");
    const entryMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (entryMatch) {
      activeKey = entryMatch[1];
      const value = stripFrontmatterQuotes(entryMatch[2].trim());
      frontmatter[activeKey] = value;
      continue;
    }
    const listMatch = /^\s*-\s+(.*)$/.exec(line);
    if (listMatch && activeKey) {
      const value = stripFrontmatterQuotes(listMatch[1].trim());
      const existing = frontmatter[activeKey];
      frontmatter[activeKey] = Array.isArray(existing)
        ? [...existing, value]
        : existing
          ? [existing, value]
          : [value];
      continue;
    }
    activeKey = "";
  }

  return {
    content: lines.slice(endIndex + 1).join("\n").replace(/^\n+/, ""),
    frontmatter,
  };
}

function frontmatterValues(record: FrontmatterRecord, ...keys: string[]) {
  return uniqueStrings(
    keys.flatMap((key) => {
      const value = record[key];
      return Array.isArray(value) ? value : value ? [value] : [];
    }),
  );
}

function frontmatterPropertyLabel(key: string, text: DetailsText) {
  const labels: Record<string, string> = {
    title: "title",
    status: text.pageStatus,
    source_id: text.sourceId,
    source_uuid: "source_uuid",
    source_path: "source_path",
    sources: text.sourceRefs,
  };
  return labels[key] || key.replace(/_/g, " ");
}

function frontmatterDisplayValue(value: FrontmatterValue) {
  return Array.isArray(value) ? value.join(", ") : value;
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

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function headingBaseId(text: string) {
  let id = "";
  let pendingDash = false;
  for (const char of text.trim().toLowerCase()) {
    if (/\s/.test(char) || char === "-" || char === "_") {
      pendingDash = id.length > 0;
      continue;
    }
    if (/^[a-z0-9]$/.test(char) || char.charCodeAt(0) > 127) {
      if (pendingDash) {
        id += "-";
        pendingDash = false;
      }
      id += char;
    }
  }
  return id.replace(/^-+|-+$/g, "") || "heading";
}

function uniqueHeadingId(text: string, counts: Map<string, number>) {
  const base = headingBaseId(text);
  const seen = counts.get(base) ?? 0;
  counts.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

function textFromReactNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  if (isValidElement(node)) return textFromReactNode((node.props as { children?: ReactNode }).children);
  return "";
}

function extractPreviewHeadings(markdown: string, headingIdPrefix = "") {
  const counts = new Map<string, number>();
  const headings: PreviewHeading[] = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (!match) continue;
    const text = stripInlineMarkdown(match[2]);
    if (!text) continue;
    headings.push({ id: `${headingIdPrefix}${uniqueHeadingId(text, counts)}`, level: match[1].length, text });
  }
  return headings;
}

function scrollToPreviewHeading(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function decodeFragment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolvePreviewHeadingId(rawFragment: string, headingIdPrefix = "") {
  const decoded = decodeFragment(rawFragment);
  const slug = headingBaseId(decoded);
  const candidates = [
    decoded,
    slug,
    headingIdPrefix ? `${headingIdPrefix}${decoded}` : "",
    headingIdPrefix ? `${headingIdPrefix}${slug}` : "",
  ].filter(Boolean);
  return candidates.find((candidate) => document.getElementById(candidate)) || candidates[candidates.length - 1] || decoded;
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
  headingIdPrefix = "",
}: {
  content: string;
  currentPath?: string | null;
  vaultPath: string;
  outboundLinks?: string[];
  onOpenVaultPath: (path?: string | null) => void;
  headingIdPrefix?: string;
}) {
  const headingCounts = new Map<string, number>();

  function renderHeading(level: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode) {
    const text = textFromReactNode(children);
    const id = `${headingIdPrefix}${uniqueHeadingId(text || `heading ${level}`, headingCounts)}`;
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;
    return (
      <Tag id={id} className="details-markdown-heading">
        <a
          aria-label={`Jump to ${text || id}`}
          className="details-heading-anchor"
          href={`#${encodeURIComponent(id)}`}
          onClick={(event) => {
            event.preventDefault();
            scrollToPreviewHeading(id);
          }}
        >
          #
        </a>
        {children}
      </Tag>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ children, href }) => {
          const target = typeof href === "string" ? href : "";
          const isWikilink = target.startsWith(WIKILINK_HREF_PREFIX);
          const isHeadingAnchor = target.startsWith("#") && target.length > 1;
          const markdownVaultTarget = isWikilink ? "" : resolveMarkdownVaultLinkTarget(target, currentPath);
          const isVaultLink = Boolean(markdownVaultTarget);
          return (
            <a
              href={target || undefined}
              rel={isWikilink || isVaultLink || isHeadingAnchor ? undefined : "noreferrer"}
              target={isWikilink || isVaultLink || isHeadingAnchor ? undefined : "_blank"}
              className={classNames(isWikilink && "details-wikilink", isVaultLink && "details-vault-link")}
              onClick={(event) => {
                if (!isWikilink && !isVaultLink && !isHeadingAnchor) return;
                event.preventDefault();
                if (isHeadingAnchor) {
                  scrollToPreviewHeading(resolvePreviewHeadingId(target.slice(1), headingIdPrefix));
                  return;
                }
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
        h1: ({ children }) => renderHeading(1, children),
        h2: ({ children }) => renderHeading(2, children),
        h3: ({ children }) => renderHeading(3, children),
        h4: ({ children }) => renderHeading(4, children),
        h5: ({ children }) => renderHeading(5, children),
        h6: ({ children }) => renderHeading(6, children),
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

function PreviewOutline({
  headings,
  title,
}: {
  headings: PreviewHeading[];
  title: string;
}) {
  if (headings.length === 0) return null;
  return (
    <nav className="details-preview-outline" aria-label={title}>
      <strong>{title}</strong>
      <div>
        {headings.slice(0, 24).map((heading) => (
          <button
            key={heading.id}
            className={`level-${Math.min(Math.max(heading.level, 1), 6)}`}
            type="button"
            onClick={() => scrollToPreviewHeading(heading.id)}
          >
            <span>{heading.text}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function LinkList({
  title,
  links,
  empty,
  moreLabel,
  onOpenVaultPath,
}: {
  title: string;
  links?: string[];
  empty: string;
  moreLabel: (count: number) => string;
  onOpenVaultPath: (path?: string | null) => void;
}) {
  const visibleLinks = links?.slice(0, 8) ?? [];
  const hiddenCount = Math.max((links?.length ?? 0) - visibleLinks.length, 0);
  return (
    <div className="details-link-section">
      <strong>{title}</strong>
      {(!links || links.length === 0) && <p>{empty}</p>}
      {visibleLinks.map((link) => (
        <button key={link} type="button" onClick={() => onOpenVaultPath(link)}>
          <span>{link}</span>
        </button>
      ))}
      {hiddenCount > 0 && <p>{moreLabel(hiddenCount)}</p>}
    </div>
  );
}

function RelationSummaryStrip({
  text,
  outboundLinks,
  inboundLinks,
  sourceRefs,
}: {
  text: DetailsText;
  outboundLinks?: string[];
  inboundLinks?: string[];
  sourceRefs?: string[];
}) {
  const items = [
    { label: text.sourceRefs, detail: text.frontmatterRefs, value: sourceRefs?.length ?? 0 },
    { label: text.outboundLinks, detail: text.pageLinks, value: outboundLinks?.length ?? 0 },
    { label: text.inboundLinks, detail: text.incomingLinks, value: inboundLinks?.length ?? 0 },
  ];
  return (
    <div className="details-relation-strip" aria-label={`${text.sourceRefs} / ${text.outboundLinks} / ${text.inboundLinks}`}>
      {items.map((item) => (
        <div key={item.label} className={classNames("details-relation-card", item.value > 0 && "active")}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <em>{item.detail}</em>
        </div>
      ))}
    </div>
  );
}

function PagePropertyList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  empty?: string;
}) {
  return (
    <div className="details-property-card">
      <strong>{title}</strong>
      {items.length === 0 && empty && <p>{empty}</p>}
      {items.length > 0 && (
        <dl className="details-property-list">
          {items.map((item) => (
            <div key={`${title}-${item.label}`}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function FocusedPreviewReader({
  title,
  path,
  text,
  closeLabel,
  outlineTitle,
  content,
  currentPath,
  vaultPath,
  outboundLinks,
  inboundLinks,
  sourceRefs,
  headings,
  onClose,
  onOpenVaultPath,
}: {
  title: string;
  path: string;
  text: DetailsText;
  closeLabel: string;
  outlineTitle: string;
  content: string;
  currentPath?: string | null;
  vaultPath: string;
  outboundLinks?: string[];
  inboundLinks?: string[];
  sourceRefs?: string[];
  headings: PreviewHeading[];
  onClose: () => void;
  onOpenVaultPath: (path?: string | null) => void;
}) {
  return (
    <div
      className="details-reader-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-modal="true" className="details-reader-dialog" role="dialog">
        <header className="details-reader-header">
          <div>
            <strong>{title}</strong>
            <code>{path}</code>
          </div>
          <button aria-label={closeLabel} onClick={onClose} title={closeLabel} type="button">
            <X size={16} />
          </button>
        </header>
        <div className="details-reader-body">
          <aside className="details-reader-outline">
            <PreviewOutline headings={headings} title={outlineTitle} />
            <div className="details-reader-links">
              <LinkList
                title={text.outboundLinks}
                links={outboundLinks}
                empty={text.noLinks}
                moreLabel={text.moreLinks}
                onOpenVaultPath={onOpenVaultPath}
              />
              <LinkList
                title={text.inboundLinks}
                links={inboundLinks}
                empty={text.noLinks}
                moreLabel={text.moreLinks}
                onOpenVaultPath={onOpenVaultPath}
              />
              <LinkList
                title={text.sourceRefs}
                links={sourceRefs}
                empty={text.noSourceRefs}
                moreLabel={text.moreLinks}
                onOpenVaultPath={onOpenVaultPath}
              />
            </div>
          </aside>
          <article className="details-markdown-preview details-reader-markdown">
            <MarkdownPreview
              content={content}
              currentPath={currentPath}
              headingIdPrefix="details-reader-"
              outboundLinks={outboundLinks}
              vaultPath={vaultPath}
              onOpenVaultPath={onOpenVaultPath}
            />
          </article>
        </div>
      </section>
    </div>
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
    if (!isTauriAvailable()) {
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
  const [readerOpen, setReaderOpen] = useState(false);
  const parsedPreview = useMemo(
    () => (previewState.status === "ready" ? parseFrontmatter(previewState.preview.content) : null),
    [previewState],
  );
  const previewHeadings = useMemo(
    () => (parsedPreview ? extractPreviewHeadings(parsedPreview.content, "details-preview-") : []),
    [parsedPreview],
  );
  const readerHeadings = useMemo(
    () => (parsedPreview ? extractPreviewHeadings(parsedPreview.content, "details-reader-") : []),
    [parsedPreview],
  );
  const sourceRefs = useMemo(
    () => uniqueStrings([
      ...(selection.kind === "source" ? selection.file.sourceRefs ?? [] : []),
      ...(parsedPreview ? frontmatterValues(parsedPreview.frontmatter, "sources", "source_id", "source_path") : []),
    ]),
    [parsedPreview, selection],
  );
  const sourceDisplayTitle = useMemo(() => {
    if (selection.kind !== "source") return "";
    const frontmatterTitle = parsedPreview?.frontmatter.title;
    const derivedHeading = parsedPreview ? firstHeadingText(parsedPreview.content) : "";
    return (Array.isArray(frontmatterTitle) ? frontmatterTitle[0] : frontmatterTitle)
      || selection.file.title
      || derivedHeading
      || selection.file.name;
  }, [parsedPreview, selection]);
  const sourceStatus = selection.kind === "source"
    ? (
      (Array.isArray(parsedPreview?.frontmatter.status) ? parsedPreview?.frontmatter.status[0] : parsedPreview?.frontmatter.status)
      || selection.file.status
      || selection.file.kind
    )
    : "";
  const reviewState = selection.kind === "source"
    ? (
      (selection.file.needsReview ?? 0) > 0
        ? (language === "zh" ? `${selection.file.needsReview} 项待核对` : `${selection.file.needsReview} review flags`)
        : selection.file.qaVerdict
          ? `QA ${selection.file.qaVerdict}`
          : language === "zh" ? "未标记" : "unflagged"
    )
    : "";
  const sourceProperties = useMemo(() => {
    if (selection.kind !== "source") return [];
    return [
      { label: text.kind, value: selection.file.kind },
      { label: text.pageStatus, value: String(sourceStatus || text.unknown) },
      { label: text.updated, value: selection.file.updated || text.notUpdated },
      { label: text.qa, value: selection.file.qaVerdict || text.unknown },
      { label: text.reviewState, value: reviewState },
      ...(selection.file.sourceId ? [{ label: text.sourceId, value: selection.file.sourceId }] : []),
    ];
  }, [reviewState, selection, sourceStatus, text]);
  const frontmatterProperties = useMemo(() => {
    if (!parsedPreview) return [];
    return Object.entries(parsedPreview.frontmatter).map(([key, value]) => ({
      label: frontmatterPropertyLabel(key, text),
      value: frontmatterDisplayValue(value),
    }));
  }, [parsedPreview, text]);

  useEffect(() => {
    setReaderOpen(false);
  }, [sourcePreviewPath]);

  useEffect(() => {
    if (!readerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReaderOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [readerOpen]);

  useEffect(() => {
    if (!vaultPath || !canPreviewVaultPath(sourcePreviewPath)) {
      setPreviewState({ status: "idle" });
      return;
    }
    if (!isTauriAvailable()) {
      if (selection.kind === "source") {
        setPreviewState({ status: "ready", preview: metadataOnlyPreview(selection.file, language) });
      } else {
        setPreviewState({ status: "idle" });
      }
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
  }, [language, selection, sourcePreviewPath, vaultPath]);

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
          <div className="details-source-header">
            <div className="details-source-chips">
              <span className={classNames("status-chip inline", selection.file.kind)}>{selection.file.kind}</span>
              <span className={classNames("status-chip inline", sourceStatus || "unknown")}>{sourceStatus || text.unknown}</span>
              {(selection.file.needsReview ?? 0) > 0 && (
                <span className="status-chip inline needs_review">{selection.file.needsReview} {text.reviewFlags}</span>
              )}
            </div>
            <h3>{sourceDisplayTitle}</h3>
            <p>{selection.file.path}</p>
          </div>
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
          {canPreviewVaultPath(selection.file.path) && (
            <div className="details-preview">
              <div className="section-head compact">
                <h3>{text.preview}</h3>
                <div className="details-preview-toolbar">
                  {previewState.status === "ready" && (
                    <>
                      <button onClick={() => setReaderOpen(true)} type="button">
                        <BookOpen size={13} />{text.reader}
                      </button>
                      <span>{previewState.preview.sizeBytes} bytes</span>
                    </>
                  )}
                </div>
              </div>
              {previewState.status === "loading" && <p>{text.loadingPreview}</p>}
              {previewState.status === "error" && (
                <p>{text.previewUnavailable}: {previewState.error}</p>
              )}
              {previewState.status === "ready" && (
                <div className="details-reading-layout">
                  <aside className="details-reading-pane">
                    <RelationSummaryStrip
                      text={text}
                      outboundLinks={selection.file.outboundLinks}
                      inboundLinks={selection.file.inboundLinks}
                      sourceRefs={sourceRefs}
                    />
                    <div className="details-link-grid">
                      <LinkList
                        title={text.outboundLinks}
                        links={selection.file.outboundLinks}
                        empty={text.noLinks}
                        moreLabel={text.moreLinks}
                        onOpenVaultPath={onOpenVaultPath}
                      />
                      <LinkList
                        title={text.inboundLinks}
                        links={selection.file.inboundLinks}
                        empty={text.noLinks}
                        moreLabel={text.moreLinks}
                        onOpenVaultPath={onOpenVaultPath}
                      />
                      <LinkList
                        title={text.sourceRefs}
                        links={sourceRefs}
                        empty={text.noSourceRefs}
                        moreLabel={text.moreLinks}
                        onOpenVaultPath={onOpenVaultPath}
                      />
                    </div>
                    <PreviewOutline headings={previewHeadings} title={text.outline} />
                  </aside>
                  <div className="details-reading-main">
                    <div className="details-preview-document">
                      <PagePropertyList items={sourceProperties} title={text.properties} />
                      <PagePropertyList empty={text.noFrontmatter} items={frontmatterProperties} title={text.frontmatter} />
                    </div>
                    <div className="details-markdown-preview">
                      <MarkdownPreview
                        content={parsedPreview?.content || previewState.preview.content}
                        currentPath={previewState.preview.path || selection.file.path}
                        headingIdPrefix="details-preview-"
                        vaultPath={vaultPath}
                        outboundLinks={selection.file.outboundLinks}
                        onOpenVaultPath={onOpenVaultPath}
                      />
                    </div>
                    {previewState.preview.truncated && <p>{text.truncatedPreview}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
          {readerOpen && previewState.status === "ready" && (
            <FocusedPreviewReader
              closeLabel={text.closeReader}
              content={parsedPreview?.content || previewState.preview.content}
              currentPath={previewState.preview.path || selection.file.path}
              headings={readerHeadings}
              inboundLinks={selection.file.inboundLinks}
              outlineTitle={text.outline}
              path={selection.file.path}
              sourceRefs={sourceRefs}
              text={text}
              title={sourceDisplayTitle}
              vaultPath={vaultPath}
              outboundLinks={selection.file.outboundLinks}
              onClose={() => setReaderOpen(false)}
              onOpenVaultPath={onOpenVaultPath}
            />
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
