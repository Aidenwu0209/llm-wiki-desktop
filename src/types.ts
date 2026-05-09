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
  staleClaims: number;
  contradictedClaims: number;
  ingestJobs: number;
  actions: number;
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

export type DashboardLink = {
  label: string;
  path: string;
};

export type DashboardAction = {
  actionId: string;
  kind: string;
  severity: "p0" | "p1" | "p2" | "p3" | string;
  title: string;
  body: string;
  reason: string;
  status: string;
  recommendedAction: string;
  primaryObjectType: string;
  primaryObjectId: string;
  links: DashboardLink[];
};

export type DesktopIngestJob = {
  jobId: string;
  sourceUuid: string;
  sourcePath: string;
  fileName: string;
  artifactPath?: string | null;
  status: string;
  currentStep: string;
  nextAction: string;
  reason: string;
};

export type DesktopRegistryEntry = {
  sourceUuid: string;
  sourceId?: string | null;
  sourcePath: string;
  sourceSha256: string;
  artifactPath?: string | null;
  artifactSha256?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  status: string;
  lastError?: string | null;
};

export type ArtifactContractSummary = {
  sourcePath: string;
  artifactPath: string;
  manifestPath?: string | null;
  chunksPath?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  sourceSha256?: string | null;
  artifactSha256?: string | null;
  status: string;
  chunkCount: number;
  anchorsLines: boolean;
  anchorsPages: boolean;
  limitations: string[];
};

export type ImpactEdge = {
  edgeId: string;
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relationship: string;
  status: string;
};

export type IngestPlan = {
  generatedAt: string;
  vaultPath: string;
  planPath: string;
  summary: IngestPlanSummary;
  entries: IngestPlanEntry[];
  registry: DesktopRegistryEntry[];
  artifacts: ArtifactContractSummary[];
  jobs: DesktopIngestJob[];
  actions: DashboardAction[];
  impactEdges: ImpactEdge[];
};

export type IngestPipelineResult = {
  id: string;
  stagedArtifacts: string[];
  publishedSources: string[];
  logs: TaskLog[];
  exitCode: number;
  logPath: string;
};
