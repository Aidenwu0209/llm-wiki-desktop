import type { IngestPlan, IngestPlanEntry } from "../types";

export function isReviewGatedIngestEntry(entry: IngestPlanEntry) {
  return (
    entry.requiresHumanApproval ||
    entry.currentState === "duplicate" ||
    entry.currentState === "needs_review" ||
    entry.currentState === "blocked_contract"
  );
}

export function isRunnableIngestEntry(entry: IngestPlanEntry) {
  if (isReviewGatedIngestEntry(entry)) return false;
  return (
    entry.status === "ready" ||
    entry.status === "stageable" ||
    entry.status === "cached" ||
    (entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf"))
  );
}

export function runnableIngestCount(plan: IngestPlan | null | undefined) {
  return plan?.entries.filter(isRunnableIngestEntry).length ?? 0;
}
