import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  getLocalControlApiOrigin,
  localRuntimeDefaultHost,
  localRuntimePorts,
} from "../shared/localRuntime";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  cacheDir: ".vite-session",
  plugins: [react(), tailwindcss()],
  root,
  server: {
    host: localRuntimeDefaultHost,
    port: localRuntimePorts.sessionApp,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: getLocalControlApiOrigin(),
      },
    },
    strictPort: true,
  },
});
