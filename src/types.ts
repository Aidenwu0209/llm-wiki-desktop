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
