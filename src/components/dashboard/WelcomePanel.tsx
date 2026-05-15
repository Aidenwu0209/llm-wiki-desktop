import { useEffect, useMemo, useState } from "react";
import { BookOpen, BriefcaseBusiness, CheckCircle2, FolderOpen, GraduationCap, History, Library, Plus, Sprout } from "lucide-react";
import type { DesktopAppState, VaultSuggestion } from "../../types";
import { LogoMark } from "../brand/LogoMark";
import { languageName, type UiLanguage } from "../../i18n";

export type WikiProjectTemplate = "research" | "reading" | "personal-growth" | "business" | "general";

export type NewWikiProjectDraft = {
  projectName: string;
  template: WikiProjectTemplate;
  purpose: string;
  aiOutputLanguage: string;
  parentDirectory: string;
};

type WelcomePanelProps = {
  language: UiLanguage;
  appState: DesktopAppState | null;
  suggestions: VaultSuggestion[];
  busy: string | null;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  defaultParentDirectory?: string;
  defaultLanguage?: string;
  onChooseVault: () => void;
  onToggleLanguage: () => void;
  onSelectVault: (path: string) => void;
  onCreateVault: () => void;
  onCreateProject?: (draft: NewWikiProjectDraft) => boolean | Promise<boolean>;
  onChooseParentDirectory?: () => Promise<string | null>;
};

const templates: Array<{
  id: WikiProjectTemplate;
  label: string;
  description: string;
  purpose: string;
  icon: typeof Library;
}> = [
  { id: "research", label: "Research", description: "Evidence, claims, reviews, and writeback.", purpose: "Research wiki with source-backed claims and review queues.", icon: Library },
  { id: "reading", label: "Reading", description: "Books, notes, source pages, summaries.", purpose: "Reading knowledge base for notes, summaries, and references.", icon: BookOpen },
  { id: "personal-growth", label: "Personal Growth", description: "Learning goals, concepts, reflection.", purpose: "Personal growth wiki for learning, reflection, and planning.", icon: Sprout },
  { id: "business", label: "Business", description: "Market notes, decisions, strategy briefs.", purpose: "Business wiki for decisions, market research, and operating knowledge.", icon: BriefcaseBusiness },
  { id: "general", label: "General", description: "A clean local-first wiki project.", purpose: "General-purpose wiki for mixed knowledge work.", icon: GraduationCap },
];

const welcomeCopy = {
  zh: {
    subtitle: "用 LLM 构建和维护你的个人知识库",
    newProject: "新建项目",
    openProject: "打开项目",
    continue: "继续",
    recentProjects: "最近项目",
    noRecent: "还没有最近项目。",
    demoDetected: "Demo 和已检测项目",
    noSuggestions: "没有找到已生成的知识库建议。",
    openDemo: "打开 DeepSeek 演示知识库",
    createTitle: "创建新的 Wiki 项目",
    createSubtitle: "选择本地项目模板。运行时保持本地优先，写回保持先提案后写回。",
    projectName: "项目名称",
    aiOutputLanguage: "AI 输出语言",
    parentDirectory: "父目录",
    browse: "浏览",
    templatePurpose: "模板用途",
    cancel: "取消",
    create: "创建",
    switchTo: "切换为",
    templates: {
      research: ["研究", "证据、论断、审核和写回。", "用于论文/资料研究的知识库，包含资料支撑的论断和审核队列。"],
      reading: ["阅读", "书籍、笔记、资料页和摘要。", "用于阅读笔记、摘要和引用管理的知识库。"],
      "personal-growth": ["个人成长", "学习目标、概念和复盘。", "用于学习、反思和规划的个人成长知识库。"],
      business: ["商业", "市场笔记、决策和策略简报。", "用于决策、市场研究和运营知识沉淀的商业知识库。"],
      general: ["通用", "干净的本地优先 Wiki 项目。", "用于混合知识工作的通用知识库。"],
    },
  },
  en: {
    subtitle: "Build and maintain your personal knowledge base with LLMs",
    newProject: "New Project",
    openProject: "Open Project",
    continue: "Continue",
    recentProjects: "Recent Projects",
    noRecent: "No recent projects yet.",
    demoDetected: "Demo & Detected",
    noSuggestions: "No generated vault suggestions found.",
    openDemo: "Open DeepSeek demo vault",
    createTitle: "Create New Wiki Project",
    createSubtitle: "Choose a local project template. The runtime stays local-first and proposal-first.",
    projectName: "Project Name",
    aiOutputLanguage: "AI Output Language",
    parentDirectory: "Parent Directory",
    browse: "Browse",
    templatePurpose: "Template purpose",
    cancel: "Cancel",
    create: "Create",
    switchTo: "Switch to",
    templates: {
      research: ["Research", "Evidence, claims, reviews, and writeback.", "Research wiki with source-backed claims and review queues."],
      reading: ["Reading", "Books, notes, source pages, summaries.", "Reading knowledge base for notes, summaries, and references."],
      "personal-growth": ["Personal Growth", "Learning goals, concepts, reflection.", "Personal growth wiki for learning, reflection, and planning."],
      business: ["Business", "Market notes, decisions, strategy briefs.", "Business wiki for decisions, market research, and operating knowledge."],
      general: ["General", "A clean local-first wiki project.", "General-purpose wiki for mixed knowledge work."],
    },
  },
} as const;

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function lastPathSegment(path: string) {
  return visiblePath(path).split("/").filter(Boolean).pop() || visiblePath(path);
}

export function WelcomePanel({
  language,
  appState,
  suggestions,
  busy,
  createOpen: controlledCreateOpen,
  onCreateOpenChange,
  defaultParentDirectory = "",
  defaultLanguage = "English",
  onChooseVault,
  onToggleLanguage,
  onSelectVault,
  onCreateVault,
  onCreateProject,
  onChooseParentDirectory,
}: WelcomePanelProps) {
  const text = welcomeCopy[language];
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [template, setTemplate] = useState<WikiProjectTemplate>("research");
  const [aiOutputLanguage, setAiOutputLanguage] = useState(defaultLanguage || "English");
  const [parentDirectory, setParentDirectory] = useState(defaultParentDirectory);
  const createOpen = controlledCreateOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const recentVaults = Array.from(new Set(appState?.recentVaults ?? []));
  const suggestionByPath = new Map(suggestions.map((item) => [item.path, item]));
  const deepseekVaults = suggestions.filter((item) => item.kind === "deepseek");
  const lastVault = appState?.lastSelectedVault || recentVaults[0] || "";
  const visibleRecent = recentVaults.slice(0, 5);
  const detectedProjects = useMemo(() => suggestions.filter((item) => item.exists).slice(0, 4), [suggestions]);
  const selectedTemplate = templates.find((item) => item.id === template) ?? templates[0];
  const selectedTemplateText = text.templates[selectedTemplate.id];

  const resetCreateState = () => {
    setProjectName("");
    setTemplate("research");
    setAiOutputLanguage(defaultLanguage || "English");
    setParentDirectory(defaultParentDirectory);
  };

  const openCreate = () => {
    resetCreateState();
    setCreateOpen(true);
  };

  const closeCreate = () => {
    resetCreateState();
    setCreateOpen(false);
  };

  useEffect(() => {
    if (createOpen) {
      resetCreateState();
    }
  }, [createOpen, defaultLanguage, defaultParentDirectory]);

  const chooseParent = async () => {
    const picked = await onChooseParentDirectory?.();
    if (picked) setParentDirectory(picked);
  };

  const submitCreate = async () => {
    if (onCreateProject) {
      const created = await onCreateProject({
        projectName,
        template,
        purpose: selectedTemplateText[2],
        aiOutputLanguage,
        parentDirectory,
      });
      if (created) {
        closeCreate();
      }
      return;
    }
    onCreateVault();
  };

  return (
    <section className="welcome-product product-welcome">
      <div className="welcome-product-center welcome-hero">
        <button className="language-toggle welcome-language-toggle" type="button" onClick={onToggleLanguage}>
          {text.switchTo} {languageName(language === "zh" ? "en" : "zh")}
        </button>
        <LogoMark size={82} className="welcome-product-logo welcome-logo" />
        <h1>LLM Wiki</h1>
        <p>{text.subtitle}</p>
        <div className="welcome-product-actions welcome-primary-actions">
          <button className="primary-command primary" onClick={openCreate}>
            <Plus size={17} />
            {text.newProject}
          </button>
          <button onClick={onChooseVault}>
            <FolderOpen size={17} />
            {text.openProject}
          </button>
        </div>
        {lastVault && (
          <button className="continue-project" onClick={() => onSelectVault(lastVault)}>
            <History size={15} />
            {text.continue} {lastPathSegment(lastVault)}
          </button>
        )}
      </div>

      <div className="welcome-projects">
        <section>
          <div className="section-head compact">
            <h3>{text.recentProjects}</h3>
            <span>{recentVaults.length}</span>
          </div>
          {visibleRecent.length === 0 && <p className="empty">{text.noRecent}</p>}
          {visibleRecent.map((path) => {
            const suggestion = suggestionByPath.get(path);
            const exists = suggestion?.exists ?? true;
            return (
              <button key={path} onClick={() => onSelectVault(path)} disabled={!exists}>
                <strong>{lastPathSegment(path)}</strong>
                <span className={classNames("inline-state", exists ? "ok" : "danger")}>{exists ? "ready" : "missing"}</span>
                <code>{visiblePath(path)}</code>
              </button>
            );
          })}
        </section>

        <section>
          <div className="section-head compact">
            <h3>{text.demoDetected}</h3>
            <span>{detectedProjects.length}</span>
          </div>
          {detectedProjects.length === 0 && <p className="empty">{text.noSuggestions}</p>}
          {deepseekVaults[0]?.exists && (
            <button onClick={() => onSelectVault(deepseekVaults[0].path)}>
              <strong>{text.openDemo}</strong>
              <span className="inline-state ok">demo</span>
              <code>{visiblePath(deepseekVaults[0].path)}</code>
            </button>
          )}
          {detectedProjects.map((item) => (
            <button key={`${item.kind}-${item.path}`} onClick={() => onSelectVault(item.path)}>
              <strong>{item.label}</strong>
              <span className="inline-state ok">{item.kind}</span>
              <code>{visiblePath(item.path)}</code>
            </button>
          ))}
        </section>
      </div>

      {createOpen && (
        <div className="modal-backdrop project-modal-backdrop" role="presentation" onMouseDown={closeCreate}>
          <div className="project-modal" role="dialog" aria-modal="true" aria-labelledby="create-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="project-modal-head">
              <div>
                <h2 id="create-project-title">{text.createTitle}</h2>
                <p>{text.createSubtitle}</p>
              </div>
              <LogoMark size={46} />
            </div>

            <label className="field-label">
              {text.projectName}
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="DeepSeek Research" />
            </label>

            <div className="template-picker" aria-label="Project templates">
              {templates.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={classNames("template-card", template === item.id && "selected")}
                    type="button"
                    onClick={() => setTemplate(item.id)}
                  >
                    <Icon size={18} />
                    <strong>{text.templates[item.id][0]}</strong>
                    <em>{text.templates[item.id][1]}</em>
                    {template === item.id && <CheckCircle2 className="selected-check" size={16} />}
                  </button>
                );
              })}
            </div>

            <div className="project-form-grid">
              <label className="field-label">
                {text.aiOutputLanguage}
                <select value={aiOutputLanguage} onChange={(event) => setAiOutputLanguage(event.target.value)}>
                  <option value="English">English</option>
                  <option value="简体中文">简体中文</option>
                  <option value="日本語">日本語</option>
                  <option value="한국어">한국어</option>
                  <option value="Bilingual: English + 中文">Bilingual: English + 中文</option>
                </select>
              </label>
              <label className="field-label">
                {text.parentDirectory}
                <div className="directory-picker">
                  <input value={parentDirectory} onChange={(event) => setParentDirectory(event.target.value)} placeholder="/Users/you/Wikis" />
                  <button type="button" onClick={chooseParent}>
                    <FolderOpen size={15} />
                    {text.browse}
                  </button>
                </div>
              </label>
            </div>

            <div className="project-preview">
              <span>{text.templatePurpose}</span>
              <strong>{selectedTemplateText[0]}</strong>
              <p>{selectedTemplateText[2]}</p>
            </div>

            <div className="project-modal-actions">
              <button type="button" onClick={closeCreate}>{text.cancel}</button>
              <button type="button" className="primary-command primary" onClick={submitCreate} disabled={busy === "create" || !projectName.trim() || !parentDirectory.trim()}>
                {text.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
