import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  cacheDir: ".vite-session",
  plugins: [react(), tailwindcss()],
  root,
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://127.0.0.1:5173",
      },
    },
    strictPort: true,
  },
});
