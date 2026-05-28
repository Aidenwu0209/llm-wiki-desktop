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

export function findVaultFileForOpen(
  vaultPath: string,
  files: VaultFile[] | undefined | null,
  path?: string | null,
) {
  const target = vaultRelativeOpenPath(vaultPath, path);
  if (!target) return null;
  return files?.find((file) => vaultRelativeOpenPath(vaultPath, file.path, { allowRootedRelative: true }) === target) ?? null;
}
