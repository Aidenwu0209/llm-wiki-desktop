export type UiLanguage = "zh" | "en";

export const INTERFACE_LANGUAGE_STORAGE_KEY = "llm-wiki-desktop.interfaceLanguage";

export function normalizeUiLanguage(value?: string | null): UiLanguage {
  return value === "en" ? "en" : "zh";
}

export function oppositeLanguage(language: UiLanguage): UiLanguage {
  return language === "zh" ? "en" : "zh";
}

export function languageName(language: UiLanguage) {
  return language === "zh" ? "中文" : "English";
}

export const WELCOME_ONBOARDING_COPY = {
  zh: {
    title: "OCR + ERNIE 证据工作流",
    subtitle: "评委第一次打开时可以按这条路径完成从资料提交到可审核写回。",
    steps: [
      "创建或打开知识库",
      "提交 PDF 或图片",
      "使用 PaddleOCR-VL 文档解析技能",
      "使用文心一言基于证据问答",
      "创建可审核写回提案",
    ],
    flow: [
      "PDF / 图片",
      "PaddleOCR-VL 文档解析技能",
      "Markdown / JSON Artifact",
      "LLM Wiki Runtime",
      "Evidence Map",
      "文心一言回答",
      "Writeback Proposal",
    ],
    demoTitle: "演示路径",
    demoDescription: "无真实 vault 时先查看合成 Demo Tour；不会假装打开不存在的知识库。",
    viewDemoTour: "查看 Demo Tour",
    syntheticDemo: "合成示例",
  },
  en: {
    title: "OCR + ERNIE Evidence Flow",
    subtitle: "A first-time reviewer can follow this path from submission to auditable writeback.",
    steps: [
      "Create or open a Vault",
      "Submit PDFs or images",
      "Use PaddleOCR-VL Document Parsing Skill",
      "Ask with ERNIE using evidence",
      "Create a writeback proposal",
    ],
    flow: [
      "PDF / Image",
      "PaddleOCR-VL Document Parsing Skill",
      "Markdown / JSON Artifact",
      "LLM Wiki Runtime",
      "Evidence Map",
      "ERNIE Answer",
      "Writeback Proposal",
    ],
    demoTitle: "Demo path",
    demoDescription: "If no real demo vault is available, use the synthetic Demo Tour instead of pretending to open a vault.",
    viewDemoTour: "View Demo Tour",
    syntheticDemo: "Synthetic demo",
  },
} as const;

const ZH_RUNTIME_LABELS: Record<string, string> = {
  all: "全部",
  approved: "已批准",
  approve_or_reject_claim: "批准或拒绝论断",
  artifact: "解析产物",
  blocked: "已阻塞",
  broken: "断开",
  cancelled: "已取消",
  claim: "论断",
  claim_review: "论断审核",
  completed: "已完成",
  concept: "概念",
  conflict: "冲突",
  contradicted: "冲突",
  details: "详情",
  draft: "草稿",
  entrypoint: "入口",
  evidence: "证据",
  failed: "失败",
  hypothesis: "假设",
  ignored: "已忽略",
  ingest_pipeline: "导入流程",
  invalid_artifact_hash: "解析产物哈希不一致",
  lint: "检查",
  needs_review: "待审核",
  not_required: "不需要",
  note: "笔记",
  ok: "正常",
  open: "未处理",
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  pending: "待处理",
  proposed: "待审批",
  proposal_requested: "已请求提案",
  published: "已发布",
  qa_pending: "QA 待处理",
  queued: "排队中",
  ready: "就绪",
  registered: "已登记",
  rejected: "已拒绝",
  resolved: "已解决",
  review: "审核",
  retrying: "重试中",
  review_only: "仅审核",
  running: "运行中",
  report: "报告",
  run_ingest_lint: "运行导入检查",
  runtime: "运行时",
  science_review: "科学审核",
  source: "资料",
  stageable: "可入库",
  stale: "已失效",
  synthesis: "综合",
  succeeded: "成功",
  supported: "已支撑",
  timeout: "超时",
  timed_out: "超时",
  wiki_lint: "Wiki 检查",
};

export function runtimeLabel(value: string | null | undefined, language: UiLanguage | string) {
  if (!value) return "";
  if (language !== "zh") return value;
  const key = value.trim();
  const warningMatch = key.match(/^(\d+)\s+warnings?$/i);
  if (warningMatch) return `${warningMatch[1]} 个警告`;
  return ZH_RUNTIME_LABELS[key] ?? ZH_RUNTIME_LABELS[key.toLowerCase()] ?? key;
}

export function runtimeText(value: string | null | undefined, language: UiLanguage | string) {
  if (!value) return "";
  if (language !== "zh") return value;

  let text = value;
  text = text.replace(/^Reported claim:\s*/i, "指标论断：");
  text = text.replace(/^claim needs review:\s*/i, "论断需要审核：");
  text = text.replace(/^claim 需要审核:\s*/i, "论断需要审核：");
  text = text.replace(/^missing anchor:\s*/i, "缺失锚点：");
  text = text.replace(/claim 指向未知 source_uuid/g, "论断指向未知资料 UUID");
  text = text.replace(/source id pending/g, "资料 ID 待定");
  text = text.replace(/source path unknown/g, "资料路径未知");
  text = text.replace(/DeepSeek evidence chain is broken: open the claim, source, and artifact; repair or regenerate the missing anchor; rerun traceability\/lint before trusting the insight or query writeback\./g, "DeepSeek 证据链已断开：请打开论断、资料和解析产物，修复或重新生成缺失锚点；在信任该洞察或执行查询写回前，重新运行可追踪性检查和 lint。");
  text = text.replace(
    /Claim (claim-[\w-]+) cannot be traced to ([^ ]+) because (.+?)\./g,
    (_match, claimId: string, target: string, reason: string) => `论断 ${claimId} 无法追踪到 ${target}，原因：${runtimeText(reason, language)}。`,
  );
  return text;
}
