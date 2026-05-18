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
  runtimeVersion?: string | null;
  lastUpdated?: string | null;
  counts: VaultCounts;
  files: VaultFile[];
  errors: string[];
};

export type DesktopAppState = {
  lastSelectedVault?: string | null;
  recentVaults: string[];
  interfaceLanguage?: "zh" | "en" | string;
  updatedAt?: string | null;
};

export type VaultRestoreResult = {
  state: DesktopAppState;
  vaultPath?: string | null;
  exists: boolean;
  status?: VaultStatus | null;
  error?: string | null;
};

export type VaultSuggestion = {
  label: string;
  path: string;
  kind: string;
  exists: boolean;
};

export type VaultEntryNote = {
  vaultPath: string;
  entryPath?: string | null;
  entryRelativePath?: string | null;
  obsidianUri?: string | null;
  fallbackPath: string;
  reason: string;
  warning?: string | null;
  isWorkspaceRoot: boolean;
};

export type RuntimeSettings = {
  runtimePath: string;
  pythonPath: string;
  obsidianProfile: "minimal" | "research" | "full";
  skipDownloads: boolean;
  pdfParser: "auto" | "local-text" | "layout-api";
  cloudParsingAllowed: boolean;
  layoutParsingApiUrl: string;
  retryCount: number;
  timeoutSeconds: number;
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

export type RuntimeJobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "completed"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout"
  | "timed_out";

export type RuntimeJobEvent = {
  jobId: string;
  kind: string;
  status: RuntimeJobStatus | string;
  stream?: "stdout" | "stderr" | string | null;
  line?: string | null;
  stage: string;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  command: string[];
  startedAt: string;
  endedAt?: string | null;
  elapsedMs: number;
  durationMs: number;
  exitCode?: number | null;
  logPath?: string | null;
  liveLogPath?: string | null;
  stdoutTail?: string | null;
  stderrTail?: string | null;
  retryOf?: string | null;
  message?: string | null;
};

export type ImportResult = {
  copied: VaultFile[];
  skippedDuplicates: string[];
  errors: string[];
};

export type ImportPreview = {
  sourcePath: string;
  fileName: string;
  sizeBytes: number;
  mime: string;
  sha256: string;
  targetPath?: string | null;
  folderContext?: string | null;
  duplicateOf?: string | null;
  duplicateReason?: string | null;
  approximateDuplicateOf?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  titleHint?: string | null;
  status: string;
  enqueued: boolean;
};

export type ImportBatchResult = {
  imported: ImportPreview[];
  skippedDuplicates: ImportPreview[];
  errors: string[];
  enqueuedJobs: number;
};

export type DesktopSettings = {
  runtimePath: string;
  pythonPath: string;
  uvPath: string;
  projectName: string;
  projectTemplate: "research" | "reading" | "personal-growth" | "business" | "general" | string;
  projectPurpose: string;
  aiOutputLanguage: string;
  interfaceLanguage: "zh" | "en" | string;
  parentDirectory: string;
  layoutParsingApiUrl: string;
  layoutParsingTokenPresent: boolean;
  cloudParsingAllowed: boolean;
  defaultPdfParser: "auto" | "local-text" | "layout-api" | string;
  defaultIngestMode: "inbox_only" | "enqueue_after_import" | string;
  defaultObsidianProfile: "minimal" | "research" | "full" | string;
  embeddingEnabled: boolean;
  embeddingEndpoint: string;
  embeddingApiKeyEnvVar: string;
  embeddingModel: string;
  embeddingOutputDimensions: number;
  embeddingMaxChunkChars: number;
  embeddingOverlapChunkChars: number;
  captioningEnabled: boolean;
  captioningUseMainProvider: boolean;
  captioningProvider: string;
  captioningEndpoint: string;
  captioningApiKeyEnvVar: string;
  captioningModel: string;
  captioningConcurrency: number;
  webSearchEnabled: boolean;
  webSearchProvider: string;
  webSearchApiKeyEnvVar: string;
  webSearchEndpoint: string;
  webSearchCategories: string;
  webSearchAuditLog: boolean;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyBypassLocal: boolean;
  sourceWatchEnabled: boolean;
  sourceWatchAutoIngest: boolean;
  sourceWatchAllowedExtensions: string;
  sourceWatchExcludeDirs: string;
  sourceWatchExcludeExtensions: string;
  sourceWatchExcludeGlobs: string;
  sourceWatchMaxFileSizeMb: number;
  scheduledImportEnabled: boolean;
  scheduledImportPath: string;
  scheduledImportIntervalMinutes: number;
  chatHistoryMessages: number;
  interfaceDensity: "comfortable" | "compact" | string;
  retryCount: number;
  timeoutSeconds: number;
  autoRunLintAfterWrites: boolean;
  autoOpenReportsAfterFailures: boolean;
  skipObsidianPluginDownloads: boolean;
  llmProviderCenter: LlmProviderCenterSettings;
};

export type LlmProviderConfig = {
  enabled: boolean;
  expanded: boolean;
  selectedModel: string;
  customModel: string;
  contextWindow: number;
  reasoningMode: "fast" | "balanced" | "deep" | string;
  apiBaseUrl?: string;
  apiKeyEnvVar?: string;
  apiProtocol?: "openai-compatible" | "anthropic-compatible" | "native" | string;
  apiKeyConfigured?: boolean;
  apiKeyCheckedAt?: string | null;
  cliAvailable?: boolean;
  cliVersion?: string | null;
  cliPath?: string | null;
  cliCheckedAt?: string | null;
};

export type LlmProviderCenterSettings = {
  activeProviderId?: string | null;
  providers: Record<string, LlmProviderConfig>;
};

export type LlmCliCheckResult = {
  command: string;
  available: boolean;
  version?: string | null;
  path?: string | null;
  message: string;
};

export type LlmApiKeyCheckResult = {
  providerId: string;
  envVar: string;
  available: boolean;
  message: string;
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

export type DashboardAffectedObject = {
  objectType: string;
  objectId: string;
  status: string;
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
  affectedObjects: DashboardAffectedObject[];
  links: DashboardLink[];
};

export type DesktopIngestJob = {
  jobId: string;
  sourceUuid: string;
  sourceId?: string | null;
  sourcePath: string;
  fileName: string;
  kind: string;
  artifactPath?: string | null;
  status: string;
  currentStep: string;
  nextAction: string;
  reason: string;
  attempt: number;
  maxAttempts: number;
  startedAt?: string | null;
  endedAt?: string | null;
  lastError?: string | null;
  logPath?: string | null;
  inputs: string[];
  outputs: string[];
};

export type DesktopRegistryEntry = {
  sourceUuid: string;
  sourceId?: string | null;
  duplicateOf?: string | null;
  rawPath: string;
  canonicalPath: string;
  sourcePath: string;
  sourceSha256: string;
  mime: string;
  artifactPath?: string | null;
  artifactSha256?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  status: string;
  sourcePage?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
};

export type ArtifactContractSummary = {
  sourcePath: string;
  sourceId?: string | null;
  sourceUuid: string;
  artifactPath: string;
  manifestPath?: string | null;
  chunksPath?: string | null;
  tablesPath?: string | null;
  figuresPath?: string | null;
  parseLogPath?: string | null;
  parser?: string | null;
  parserVersion?: string | null;
  schemaVersion?: string | null;
  sourceSha256?: string | null;
  artifactSha256?: string | null;
  status: string;
  contractValid: boolean;
  chunkCount: number;
  anchorsLines: boolean;
  anchorsPages: boolean;
  anchorsTables: boolean;
  anchorsFigures: boolean;
  anchorsEquations: boolean;
  limitations: string[];
  lintErrors: string[];
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
  lintFindings: ContractFinding[];
};

export type ContractFinding = {
  findingId: string;
  severity: "p0" | "p1" | "p2" | "p3" | string;
  kind: string;
  objectType: string;
  objectId: string;
  title: string;
  detail: string;
  status: string;
  path?: string | null;
};

export type TraceabilityWarning = {
  warningId: string;
  claimId: string;
  claimText?: string | null;
  claimPath: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  artifactPath?: string | null;
  missingHeading: string;
  missingAnchor: string;
  severity: "p0" | "p1" | "p2" | "p3" | string;
  summary: string;
  suggestedAction: string;
  nextAction: string;
  findingId?: string | null;
};

export type ClaimLedgerItem = {
  claimId: string;
  claimText: string;
  sourceId?: string | null;
  sourceUuid?: string | null;
  sourcePath?: string | null;
  chunkId?: string | null;
  verdict: string;
  status: string;
  needsReview: boolean;
  concepts: string[];
  evidenceQuote?: string | null;
  evidenceHash?: string | null;
  updatedAt?: string | null;
  line: number;
};

export type EvidencePathItem = {
  claimId: string;
  concept?: string | null;
  claimText: string;
  chainStatus: "ok" | "needs_review" | "broken" | string;
  missing: string[];
  sourceId?: string | null;
  sourceUuid?: string | null;
  sourcePage?: string | null;
  evidenceAnchor?: string | null;
  evidenceQuote?: string | null;
  rawPath?: string | null;
  artifactPath?: string | null;
  chunksPath?: string | null;
  qaReportPath?: string | null;
  semanticStatus?: string | null;
  scienceReviewStatus?: string | null;
};

export type ReviewQueueItem = {
  itemId: string;
  kind: string;
  severity: "p0" | "p1" | "p2" | "p3" | string;
  title: string;
  body: string;
  status: string;
  targetPath?: string | null;
  sourceId?: string | null;
  claimId?: string | null;
  evidencePath?: string | null;
  recommendedAction: string;
};

export type WritebackProposal = {
  proposalId: string;
  targetPath: string;
  title: string;
  status: "proposed" | "approved" | "rejected" | "applied" | string;
  diff: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string | null;
  logPath?: string | null;
};

export type WritebackApplyResult = {
  proposal: WritebackProposal;
  dashboardRefreshed: boolean;
  dashboardError?: string | null;
};

export type WritebackApplyStatus = {
  proposalId: string;
  targetPath: string;
  appliedAt?: string | null;
  dashboardRefreshed: boolean;
  dashboardError?: string | null;
  lint: {
    ran: boolean;
    findingCount?: number;
    blockingCount?: number;
    error?: string | null;
  };
};

export type QueryEvidence = {
  claimId: string;
  claimPath: string;
  claimText: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  evidenceHash?: string | null;
  quote?: string | null;
  verdict: string;
  status: string;
  concepts: string[];
  conclusionType: string;
  confidence: string;
};

export type QueryWritebackDraft = {
  query: string;
  answer: string;
  evidenceMap: QueryEvidence[];
  insightCandidates: string[];
  uncertaintyConflicts: string[];
  writebackProposal: string;
  diffPreview: string;
  approvalStatus: string;
  proposal: WritebackProposal;
};

export type IngestPipelineResult = {
  id: string;
  parsedArtifacts: string[];
  stagedArtifacts: string[];
  publishedSources: string[];
  logs: TaskLog[];
  exitCode: number;
  logPath: string;
};
