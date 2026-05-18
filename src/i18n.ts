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

const ZH_RUNTIME_LABELS: Record<string, string> = {
  all: "全部",
  approved: "已批准",
  approve_or_reject_claim: "批准或拒绝论断",
  artifact: "解析产物",
  broken: "断开",
  cancelled: "已取消",
  claim: "论断",
  claim_review: "论断审核",
  completed: "已完成",
  conflict: "冲突",
  contradicted: "冲突",
  details: "详情",
  failed: "失败",
  ignored: "已忽略",
  invalid_artifact_hash: "解析产物哈希不一致",
  needs_review: "待审核",
  ok: "正常",
  open: "未处理",
  proposed: "待审批",
  rejected: "已拒绝",
  resolved: "已解决",
  run_ingest_lint: "运行导入检查",
  source: "资料",
  stale: "已失效",
  succeeded: "成功",
  supported: "已支撑",
  timeout: "超时",
  timed_out: "超时",
};

export function runtimeLabel(value: string | null | undefined, language: UiLanguage | string) {
  if (!value) return "";
  if (language !== "zh") return value;
  const key = value.trim();
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
