/**
 * The guide's back end: a small endpoint on the Vite dev server that asks DeepSeek to explain
 * a model or one of its parts.
 *
 * It runs on the server (not in the browser) so the DeepSeek API key, read from .env, never
 * reaches the page. POST /api/explain with { model, part?, parts? } → { title, summary, role, funFacts }.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

export interface Explanation {
  title: string;
  /** What it is, in two or three sentences. */
  summary: string;
  /** What it does / how it works. */
  role: string;
  funFacts: string[];
}

const SYSTEM_PROMPT = `You are the friendly guide in an interactive 3D museum exhibit. Visitors explore
3D models part by part — parts of the human body, and NASA spacecraft — and you explain what
they're looking at, in plain words a curious teenager would enjoy. Be accurate: if you're unsure of something, leave it out rather than
guess. Reply with JSON only, exactly in this shape:
{"title": string, "summary": string, "role": string, "funFacts": [string, string, string]}
- title: the name, nicely written
- summary: what it is and where it sits (in the body, or on the spacecraft) (2–3 sentences)
- role: what it does and how (2–3 sentences)
- funFacts: three short, surprising, true facts (one sentence each)`;

function prompt(model: string, part: string | undefined, parts: string[]): string {
  if (part) return `The model is "${model}". The visitor selected this part of it: "${part}". Explain the part.`;
  const list = parts.length ? ` It's made of these parts: ${parts.slice(0, 80).join(", ")}.` : "";
  return `The visitor is looking at a 3D model of "${model}".${list} Explain it as a whole.`;
}

/** Answers are the same every time, so each is only asked for once. */
const cache = new Map<string, Promise<Explanation>>();

async function askDeepSeek(apiKey: string, model: string, part: string | undefined, parts: string[]): Promise<Explanation> {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt(model, part, parts) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`DeepSeek answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const answer = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Partial<Explanation>;
  return {
    title: String(answer.title ?? part ?? model),
    summary: String(answer.summary ?? ""),
    role: String(answer.role ?? ""),
    funFacts: Array.isArray(answer.funFacts) ? answer.funFacts.map(String).slice(0, 5) : [],
  };
}

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
    if (!apiKey) return send(500, { error: "No DeepSeek key: add DEEPSEEK_API_KEY to the .env file and restart the dev server." });

    readBody(req)
      .then(async (raw) => {
        const { model, part, parts } = JSON.parse(raw) as { model?: unknown; part?: unknown; parts?: unknown };
        if (typeof model !== "string" || !model.trim() || model.length > 200) return send(400, { error: "Missing model name." });
        const partName = typeof part === "string" && part.trim() ? part.slice(0, 200) : undefined;
        const partList = Array.isArray(parts) ? parts.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 120)) : [];

        const key = `${model}\n${partName ?? ""}`;
        let answer = cache.get(key);
        if (!answer) {
          // DeepSeek occasionally fails or times out; one retry covers most of those.
          answer = askDeepSeek(apiKey, model, partName, partList).catch(() => askDeepSeek(apiKey, model, partName, partList));
          cache.set(key, answer);
          answer.catch(() => cache.delete(key)); // a failure can be retried
        }
        send(200, await answer);
      })
      .catch((e: unknown) => send(502, { error: e instanceof Error ? e.message : String(e) }));
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
