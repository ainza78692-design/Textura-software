import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist/desktop-renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: "desktop.html",
      output: {
        manualChunks: {
          tanstack: ["@tanstack/react-query", "@tanstack/react-router"],
          radix: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          charts: ["recharts"],
          xlsx: ["xlsx"],
        },
      },
    },
  },
});
