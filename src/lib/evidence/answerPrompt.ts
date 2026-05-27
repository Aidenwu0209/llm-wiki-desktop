import type { LlmAnswerEvidenceRef } from "../../types";

export type EvidenceFirstAnswerPromptOptions = {
  language?: "zh" | "en" | string;
  maxEvidenceItems?: number;
  maxSnippetChars?: number;
};

export type EvidenceFirstAnswerPrompt = {
  system: string;
  user: string;
  evidenceIds: string[];
};

function compactPromptText(value?: string | null, maxLength = 700) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function safeEvidenceForPrompt(
  evidenceMap: LlmAnswerEvidenceRef[],
  options: EvidenceFirstAnswerPromptOptions,
) {
  const maxItems = options.maxEvidenceItems ?? 8;
  const maxSnippetChars = options.maxSnippetChars ?? 700;
  return evidenceMap
    .filter((item) => item.id.trim())
    .slice(0, maxItems)
    .map((item) => ({
      evidence_id: item.id,
      type: item.type,
      title: compactPromptText(item.title, 160),
      path: item.path,
      snippet: compactPromptText(item.snippet, maxSnippetChars),
      evidence: compactPromptText(item.evidence, maxSnippetChars),
      status: item.status || item.severity || "loaded",
      relations: item.relations.slice(0, 10).map((relation) => compactPromptText(relation, 180)),
    }));
}

export function buildEvidenceFirstAnswerPrompt(
  question: string,
  evidenceMap: LlmAnswerEvidenceRef[],
  options: EvidenceFirstAnswerPromptOptions = {},
): EvidenceFirstAnswerPrompt {
  const language = options.language === "zh" ? "zh" : "en";
  const safeEvidence = safeEvidenceForPrompt(evidenceMap, options);
  const evidenceIds = safeEvidence.map((item) => item.evidence_id);
  const insufficientAnswer = "当前 vault 证据不足";
  const system = [
    "You are an evidence-first answer generator for LLM Wiki.",
    "Use only the supplied evidence map. Do not use outside knowledge or free-chat assumptions.",
    "Every key conclusion must cite evidence_id values from the evidence map.",
    `If no evidence is supplied, answer exactly: ${insufficientAnswer}`,
    "Do not invent sources, claim ids, concept ids, review ids, citations, or writeback approval.",
    "Do not request or include raw documents. The prompt may contain only evidence snippets and ids.",
    "Return JSON only with keys: answer, citations, unsupported_claims, follow_up_questions, warnings.",
  ].join("\n");
  const user = [
    `Question: ${compactPromptText(question, 1200)}`,
    `Response language: ${language === "zh" ? "Simplified Chinese" : "English"}`,
    "",
    "Evidence map JSON:",
    JSON.stringify(safeEvidence, null, 2),
    "",
    "Required JSON shape:",
    JSON.stringify({
      answer: insufficientAnswer,
      citations: [{ evidence_id: evidenceIds[0] || "EVIDENCE_ID", note: "short reason" }],
      unsupported_claims: [],
      follow_up_questions: [],
      warnings: [],
    }, null, 2),
  ].join("\n");
  return { system, user, evidenceIds };
}
