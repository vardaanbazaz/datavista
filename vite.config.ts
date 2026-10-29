/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? "/datavista/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          // Rollup's shared CJS interop helper is needed by react/react-dom (vendor-react)
          // and dexie (engine-core). Left unassigned it lands in engine-core, making
          // vendor-react import engine-core while engine-core imports zustand from
          // vendor-react - a chunk cycle that hits a TDZ error at startup. Pin it to
          // vendor-react, which has no imports of its own.
          if (normalizedId.includes("commonjsHelpers")) {
            return "vendor-react";
          }
          if (normalizedId.includes("/src/shared/services/")) {
            return "engine-core";
          }
          if (normalizedId.includes("/node_modules/")) {
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/zustand/") ||
              normalizedId.includes("/node_modules/react-router-dom/")
            ) {
              return "vendor-react";
            }
            if (
              normalizedId.includes("/node_modules/d3") ||
              normalizedId.includes("/node_modules/lucide-react/") ||
              normalizedId.includes("/node_modules/tailwind-merge/") ||
              normalizedId.includes("/node_modules/framer-motion/")
            ) {
              return "vendor-viz";
            }
            // Export pipeline (xlsx/jsPDF/html2canvas) - heavy, only touched by the
            // Export view, so keep it out of the main chunk everyone downloads.
            if (
              normalizedId.includes("/node_modules/xlsx/") ||
              normalizedId.includes("/node_modules/jspdf/") ||
              normalizedId.includes("/node_modules/html2canvas/")
            ) {
              return "vendor-export";
            }
            if (
              normalizedId.includes("/node_modules/date-fns/") ||
              normalizedId.includes("/node_modules/react-day-picker/")
            ) {
              return "vendor-dates";
            }
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'tests/smoke/**', 'tests/bigfiles/**']
  },
}));

