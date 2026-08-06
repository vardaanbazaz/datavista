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
              normalizedId.includes("/node_modules/recharts/") ||
              normalizedId.includes("/node_modules/framer-motion/")
            ) {
              return "vendor-viz";
            }
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  },
}));

