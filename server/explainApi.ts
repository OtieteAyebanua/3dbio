/**
 * Serves the guide's endpoint (POST /api/explain) on the Vite dev server and `vite preview`,
 * using the same code Vercel runs in production (api/explain.ts).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { explain } from "../api/explain.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > 20_000) reject(new Error("Request too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function handler(apiKey: string | undefined): Connect.NextHandleFunction {
  return (req, res: ServerResponse, next) => {
    if (req.method !== "POST") return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    readBody(req)
      .then((raw) => explain(JSON.parse(raw), apiKey))
      .then((result) => send(result.status, result.body))
      .catch((e: unknown) => send(400, { error: e instanceof Error ? e.message : String(e) }));
  };
}

/** Adds /api/explain to the dev server (and to `vite preview`). */
export function explainApi(apiKey: string | undefined): Plugin {
  return {
    name: "explain-api",
    configureServer(server) {
      server.middlewares.use("/api/explain", handler(apiKey));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/explain", handler(apiKey));
    },
  };
}
