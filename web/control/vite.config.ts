import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import {
  getLocalControlApiOrigin,
  getLocalControlAppOrigin,
  localRuntimeDefaultHost,
  localRuntimePorts,
} from "../shared/localRuntime";

import worker from "./src/worker";

const root = fileURLToPath(new URL(".", import.meta.url));
const localControlApiHost = new URL(getLocalControlApiOrigin()).host;
const localControlAppHost = new URL(getLocalControlAppOrigin()).host;

export default defineConfig({
  cacheDir: ".vite-control",
  plugins: [react(), tailwindcss(), controlApiPlugin()],
  root,
  server: {
    host: localRuntimeDefaultHost,
    port: localRuntimePorts.controlApp,
    strictPort: true,
  },
});

function controlApiPlugin(): Plugin {
  return {
    configureServer(server) {
      const sidecarServer = createServer((req, res) => {
        void respondWithControlApi(req, res, localControlApiHost).catch((error) => {
          server.config.logger.error(`control API sidecar failed: ${String(error)}`);

          if (!res.headersSent) {
            res.statusCode = 500;
          }
          res.end();
        });
      });

      sidecarServer.once("error", (error) => {
        server.config.logger.error(
          `control API sidecar could not listen on http://${localControlApiHost}: ${String(error)}`,
        );
        process.exitCode = 1;
        process.kill(process.pid, "SIGTERM");
      });
      sidecarServer.listen(localRuntimePorts.controlApi, localRuntimeDefaultHost);
      server.httpServer?.once("close", () => {
        sidecarServer.close();
      });

      server.middlewares.use(async (req, res, next) => {
        if (req.url === undefined || !req.url.startsWith("/api/")) {
          next();
          return;
        }

        try {
          await respondWithControlApi(req, res, localControlAppHost);
        } catch (error) {
          next(error);
        }
      });
    },
    name: "control-api",
  };
}

async function respondWithControlApi(
  req: IncomingMessage,
  res: ServerResponse,
  fallbackHost: string,
) {
  const request = new Request(
    new URL(req.url ?? "/", `http://${req.headers.host ?? fallbackHost}`),
    {
      body: await readRequestBody(req),
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

async function readRequestBody(request: IncomingMessage) {
  if (request.method === undefined || request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}
