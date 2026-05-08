export type VaultCounts = {
  inbox: number;
  sources: number;
  drafts: number;
  concepts: number;
  reports: number;
  claims: number;
  claimsNeedingReview: number;
  scienceReviewQueue: number;
  growthQueue: number;
};

export type VaultFile = {
  name: string;
  path: string;
  kind: "source" | "draft" | "concept" | "report" | "inbox";
  title?: string | null;
  status?: string | null;
  updated?: string | null;
  qaVerdict?: string | null;
  needsReview?: number;
};

export type VaultStatus = {
  path: string;
  schemaValid: boolean;
  runtimeInstalled: boolean;
  obsidianEnabled: boolean;
  dashboardAvailable: boolean;
  runtimeScriptsPath?: string | null;
  counts: VaultCounts;
  files: VaultFile[];
  errors: string[];
};

export type RuntimeSettings = {
  runtimePath: string;
  pythonPath: string;
  obsidianProfile: "minimal" | "research" | "full";
  skipDownloads: boolean;
};

export type TaskLog = {
  id: string;
  kind: string;
  command: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  logPath: string;
};

export type ImportResult = {
  copied: VaultFile[];
  skippedDuplicates: string[];
  errors: string[];
};

export type IngestPlanSummary = {
  total: number;
  ready: number;
  stageable: number;
  blocked: number;
  cached: number;
  published: number;
};

export type IngestPlanEntry = {
  sourcePath: string;
  fileName: string;
  sha256: string;
  artifactPath?: string | null;
  status: "ready" | "stageable" | "blocked" | "cached" | "published";
  action: string;
  reason: string;
  parserHint?: string | null;
};

export type IngestPlan = {
  generatedAt: string;
  vaultPath: string;
  planPath: string;
  summary: IngestPlanSummary;
  entries: IngestPlanEntry[];
};

export type IngestPipelineResult = {
  id: string;
  stagedArtifacts: string[];
  publishedSources: string[];
  logs: TaskLog[];
  exitCode: number;
  logPath: string;
};
