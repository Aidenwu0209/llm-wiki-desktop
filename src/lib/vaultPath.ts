import type { VaultFile } from "../types";

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRelativePath(value: string) {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function basename(value: string) {
  return value.split("/").filter(Boolean).pop() || value;
}

function stripPreviewExtension(value: string) {
  return value.replace(/\.(md|markdown|txt|json|jsonl|csv|tsv|canvas)$/i, "");
}

function normalizeLookupValue(value?: string | null) {
  if (!value) return "";
  return stripPreviewExtension(
    decodePath(value)
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .trim(),
  ).toLowerCase();
}

function fileLookupKeys(vaultPath: string, file: VaultFile) {
  const relativePath = vaultRelativeOpenPath(vaultPath, file.path, { allowRootedRelative: true });
  return new Set(
    [
      relativePath,
      basename(relativePath),
      file.sourceId,
      file.title,
      file.name,
    ]
      .map((value) => normalizeLookupValue(value))
      .filter(Boolean),
  );
}

function inferVaultFileKind(path: string): VaultFile["kind"] {
  const firstSegment = path.replace(/\\/g, "/").split("/").filter(Boolean)[0] || "";
  if (firstSegment === "sources") return "source";
  if (firstSegment === "drafts") return "draft";
  if (firstSegment === "concepts") return "concept";
  if (firstSegment === "raw") return "inbox";
  if (["reviews", "qa-reports", "reports", ".graph"].includes(firstSegment)) return "report";
  return "note";
}

export function vaultRelativeOpenPath(
  vaultPath: string,
  path?: string | null,
  options?: { allowRootedRelative?: boolean },
) {
  if (!path) return "";
  const cleaned = decodePath(path).split("#")[0].split("?")[0].replace(/\\/g, "/").trim();
  const normalizedVault = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const isAbsoluteOutsideVault =
    (cleaned.startsWith("/") || /^[A-Za-z]:\//.test(cleaned)) &&
    !(normalizedVault && cleaned.startsWith(`${normalizedVault}/`));
  if (isAbsoluteOutsideVault && !options?.allowRootedRelative) return "";
  const withoutVaultRoot = normalizedVault && cleaned.startsWith(`${normalizedVault}/`)
    ? cleaned.slice(normalizedVault.length + 1)
    : cleaned.replace(/^\/+/, "");
  return normalizeRelativePath(withoutVaultRoot);
}

export function canPreviewVaultPath(path?: string | null) {
  return Boolean(path && /\.(md|markdown|txt|json|jsonl|csv|tsv|canvas)$/i.test(path));
}

export function findVaultFileForOpen(
  vaultPath: string,
  files: VaultFile[] | undefined | null,
  path?: string | null,
) {
  const target = vaultRelativeOpenPath(vaultPath, path);
  if (!target) return null;
  const exact = files?.find((file) => vaultRelativeOpenPath(vaultPath, file.path, { allowRootedRelative: true }) === target) ?? null;
  if (exact) return exact;
  const targetKey = normalizeLookupValue(target);
  if (!targetKey) return null;
  return files?.find((file) => fileLookupKeys(vaultPath, file).has(targetKey)) ?? null;
}

export function createPreviewVaultFile(vaultPath: string, path?: string | null) {
  const relativePath = vaultRelativeOpenPath(vaultPath, path, { allowRootedRelative: true });
  if (!relativePath) return null;
  const name = basename(relativePath);
  return {
    name,
    path: relativePath,
    kind: inferVaultFileKind(relativePath),
    title: stripPreviewExtension(name),
  } satisfies VaultFile;
}
