import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src",
  publicDir: "../public",
  build: {
    target: "es2020",
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      checks: {
        pluginTimings: false
      }
    }
  }
});
