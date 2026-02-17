import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/dashboard/",
  build: {
    outDir: resolve(__dirname, "../dist/dashboard"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3300",
      "/assets": "http://localhost:3300",
      "/dashboard-ws": {
        target: "ws://localhost:3300",
        ws: true,
      },
      "/ws": {
        target: "ws://localhost:3300",
        ws: true,
      },
      "/canvas-ws": {
        target: "ws://localhost:3300",
        ws: true,
      },
    },
  },
});
