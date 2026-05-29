import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function hasPath(id: string, value: string) {
  return id.indexOf(value) !== -1;
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (hasPath(id, "node_modules")) {
            if (hasPath(id, "/@tauri-apps/")) return "vendor-tauri";
            if (hasPath(id, "/lucide-react/")) return "vendor-icons";
            if (hasPath(id, "/react-dom/") || hasPath(id, "/react/")) return "vendor-react";
            if (
              hasPath(id, "/react-markdown/") ||
              hasPath(id, "/remark-") ||
              hasPath(id, "/rehype-") ||
              hasPath(id, "/katex/")
            ) {
              return "vendor-markdown";
            }
            if (hasPath(id, "/cytoscape/")) return "vendor-graph";
          }

          if (hasPath(id, "/src/components/search/") || hasPath(id, "/src/components/details/")) return "workspace-reading";
          if (hasPath(id, "/src/components/graph/") || hasPath(id, "/src/lib/graphLayout")) return "workspace-graph";
          if (hasPath(id, "/src/components/sources/") || hasPath(id, "/src/components/traceability/")) return "workspace-sources";
          if (hasPath(id, "/src/components/writeback/")) return "workspace-writeback";
          if (hasPath(id, "/src/components/dashboard/") || hasPath(id, "/src/components/settings/")) return "workspace-dashboard";
          if (hasPath(id, "/src/components/layout/") || hasPath(id, "/src/components/brand/")) return "workspace-shell";
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
