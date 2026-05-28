import type { VaultFile } from "../types";

export type VaultFileTreeNode = {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  depth: number;
  fileCount: number;
  file?: VaultFile;
  children: VaultFileTreeNode[];
};

const ROOT_FOLDER_RANK = new Map([
  ["index.md", 0],
  ["_dashboard.md", 1],
  ["concepts", 2],
  ["sources", 3],
  ["drafts", 4],
  ["claims", 5],
  ["reviews", 6],
  ["qa-reports", 7],
  ["reports", 8],
  ["raw", 9],
  ["templates", 10],
  ["_state", 11],
]);

function cleanVaultPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function makeFolderNode(path: string, name: string, depth: number): VaultFileTreeNode {
  return {
    id: `folder:${path || "."}`,
    name,
    path,
    kind: "folder",
    depth,
    fileCount: 0,
    children: [],
  };
}

function makeFileNode(path: string, file: VaultFile, depth: number): VaultFileTreeNode {
  return {
    id: `file:${path}`,
    name: file.name || path.split("/").pop() || path,
    path,
    kind: "file",
    depth,
    fileCount: 1,
    file,
    children: [],
  };
}

function nodeRank(node: VaultFileTreeNode) {
  return node.depth === 0 ? ROOT_FOLDER_RANK.get(node.name) ?? 99 : 99;
}

function sortNodes(nodes: VaultFileTreeNode[]): VaultFileTreeNode[] {
  return nodes
    .sort((a, b) => {
      const rankA = nodeRank(a);
      const rankB = nodeRank(b);
      if (rankA !== rankB) return rankA - rankB;
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .map((node) => ({
      ...node,
      children: sortNodes(node.children),
    }));
}

export function buildVaultFileTree(files: VaultFile[]): VaultFileTreeNode[] {
  const root = makeFolderNode("", "Vault", -1);
  const folders = new Map<string, VaultFileTreeNode>([["", root]]);

  for (const file of files) {
    const normalizedPath = cleanVaultPath(file.path);
    if (!normalizedPath) continue;
    const parts = normalizedPath.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      let folder = folders.get(currentPath);
      if (!folder) {
        folder = makeFolderNode(currentPath, name, index);
        folders.set(currentPath, folder);
        parent.children.push(folder);
      }
      folder.fileCount += 1;
      parent = folder;
    }

    const fileNode = makeFileNode(normalizedPath, { ...file, path: normalizedPath }, parts.length - 1);
    parent.children.push(fileNode);
  }

  return sortNodes(root.children);
}
