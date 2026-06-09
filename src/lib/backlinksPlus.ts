import type { TraceabilityWarning, VaultFile } from "../types";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function relationKey(value?: string | null) {
  return (value || "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(md|markdown|txt|json|jsonl)$/i, "")
    .trim()
    .toLowerCase();
}

function fileSourceKeys(file: VaultFile, extraSourceRefs: string[] = []) {
  return uniqueStrings([
    file.sourceId,
    file.path,
    file.title,
    file.name,
    ...extraSourceRefs,
    ...(file.sourceRefs ?? []),
  ]).map(relationKey).filter(Boolean);
}

function warningKeys(warning: TraceabilityWarning) {
  return uniqueStrings([
    warning.sourceId,
    warning.sourcePath,
    warning.claimPath,
    warning.artifactPath,
  ]).map(relationKey).filter(Boolean);
}

function warningPath(warning: TraceabilityWarning) {
  return warning.sourcePath || warning.claimPath || warning.artifactPath || "";
}

export type BacklinksPlusSharedSource = {
  path: string;
  label: string;
  kind: VaultFile["kind"];
  refs: string[];
};

export type BacklinksPlusWarning = {
  warningId: string;
  path: string;
  title: string;
  severity: string;
  detail: string;
};

export type BacklinksPlusRelations = {
  sharedSources: BacklinksPlusSharedSource[];
  warnings: BacklinksPlusWarning[];
};

export function buildBacklinksPlusRelations({
  file,
  files,
  sourceRefs = [],
  traceabilityWarnings = [],
}: {
  file: VaultFile;
  files: VaultFile[];
  sourceRefs?: string[];
  traceabilityWarnings?: TraceabilityWarning[];
}): BacklinksPlusRelations {
  const activeKeys = new Set(fileSourceKeys(file, sourceRefs));
  const activePath = relationKey(file.path);
  const sharedSources = files
    .filter((candidate) => relationKey(candidate.path) !== activePath)
    .map((candidate) => {
      const matches = fileSourceKeys(candidate).filter((key) => activeKeys.has(key));
      if (matches.length === 0) return null;
      return {
        path: candidate.path,
        label: candidate.title || candidate.name || candidate.path,
        kind: candidate.kind,
        refs: matches.slice(0, 3),
      } satisfies BacklinksPlusSharedSource;
    })
    .filter((item): item is BacklinksPlusSharedSource => Boolean(item))
    .slice(0, 12);

  const warnings = traceabilityWarnings
    .filter((warning) => {
      const keys = warningKeys(warning);
      return keys.some((key) => key === activePath || activeKeys.has(key));
    })
    .map((warning) => ({
      warningId: warning.warningId,
      path: warningPath(warning),
      title: warning.summary || warning.claimId || warning.warningId,
      severity: warning.severity,
      detail: warning.missingAnchor || warning.missingHeading || warning.suggestedAction || warning.nextAction || "",
    }))
    .slice(0, 12);

  return { sharedSources, warnings };
}
