import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const bundleRoot = path.resolve(repoRoot, "src-tauri/target/release/bundle");

const staleEntries = [
  path.join(bundleRoot, "macos", "LLM Wiki Desktop.app"),
];

async function removeIfPresent(targetPath) {
  if (!targetPath.startsWith(bundleRoot + path.sep)) {
    throw new Error(`Refusing to clean outside bundle root: ${targetPath}`);
  }
  await rm(targetPath, { recursive: true, force: true });
}

for (const entry of staleEntries) {
  await removeIfPresent(entry);
}

for (const subdir of ["dmg", "macos"]) {
  const dir = path.join(bundleRoot, subdir);
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (entry.startsWith("LLM Wiki Desktop")) {
      await removeIfPresent(path.join(dir, entry));
    }
  }
}
