/**
 * The guide's back end: asks DeepSeek to explain a model or one of its parts.
 *
 * On Vercel this file is a serverless function at POST /api/explain (Vercel runs anything in
 * api/ automatically). Locally, the Vite dev server serves the same endpoint using `explain`
 * below (see server/explainApi.ts). Either way it runs on the server, so the DeepSeek API key
 * (DEEPSEEK_API_KEY: in .env locally, in the project's Environment Variables on Vercel) never
 * reaches the page.
 *
 * POST { model, part?, parts? } → { title, summary, role, funFacts }
 */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

/** Allow time for DeepSeek to answer (and one retry). */
export const maxDuration = 60;

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

/** Answers are the same every time, so each is only asked for once (per running server). */
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
    signal: AbortSignal.timeout(25_000),
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

/** Handle one request body; returns the HTTP status and the JSON to send back. */
export async function explain(body: unknown, apiKey: string | undefined): Promise<{ status: number; body: unknown }> {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: "No DeepSeek key: set DEEPSEEK_API_KEY (in .env locally, or in the host's environment variables) and restart/redeploy." },
    };
  }
  const { model, part, parts } = (body ?? {}) as { model?: unknown; part?: unknown; parts?: unknown };
  if (typeof model !== "string" || !model.trim() || model.length > 200) return { status: 400, body: { error: "Missing model name." } };
  const partName = typeof part === "string" && part.trim() ? part.slice(0, 200) : undefined;
  const partList = Array.isArray(parts)
    ? parts.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 120))
    : [];

  const key = `${model}\n${partName ?? ""}`;
  let answer = cache.get(key);
  if (!answer) {
    // DeepSeek occasionally fails or times out; one retry covers most of those.
    answer = askDeepSeek(apiKey, model, partName, partList).catch(() => askDeepSeek(apiKey, model, partName, partList));
    cache.set(key, answer);
    answer.catch(() => cache.delete(key)); // a failure can be retried
  }
  try {
    return { status: 200, body: await answer };
  } catch (e) {
    return { status: 502, body: { error: e instanceof Error ? e.message : String(e) } };
  }
}

/** The Vercel function. */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 20_000) return Response.json({ error: "Request too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const result = await explain(body, process.env.DEEPSEEK_API_KEY);
  return Response.json(result.body, { status: result.status });
}
