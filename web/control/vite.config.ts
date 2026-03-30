import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import worker from "./src/worker";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  cacheDir: ".vite-control",
  plugins: [react(), tailwindcss(), controlApiPlugin()],
  root,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});

function controlApiPlugin(): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === undefined || !req.url.startsWith("/api/")) {
          next();
          return;
        }

        try {
          const request = new Request(
            new URL(req.url, `http://${req.headers.host ?? "127.0.0.1:5173"}`),
            {
              headers: createHeaders(req.headers),
              method: req.method,
            },
          );
          const response = await worker.fetch(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });

          if (response.body === null) {
            res.end();
            return;
          }

          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
    name: "control-api",
  };
}

function createHeaders(source: Record<string, string | string[] | undefined>) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }

      continue;
    }

    headers.set(key, value);
  }

  return headers;
}
