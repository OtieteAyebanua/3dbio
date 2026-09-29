/**
 * Asks the guide (DeepSeek, via the dev server's /api/explain) to explain a model or one of its
 * parts. Each answer is fetched once and remembered.
 */
import { useEffect, useState } from "react";

export interface Explanation {
  title: string;
  summary: string;
  role: string;
  funFacts: string[];
}

export type ExplanationState =
  | { status: "loading" }
  | { status: "done"; explanation: Explanation }
  | { status: "error"; message: string };

const answers = new Map<string, Promise<Explanation>>();

function fetchExplanation(model: string, part: string | null, parts: string[]): Promise<Explanation> {
  const key = `${model}\n${part ?? ""}`;
  let answer = answers.get(key);
  if (!answer) {
    answer = fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, part, parts }),
    }).then(async (response) => {
      const body = await response.json().catch(() => ({ error: `The guide answered ${response.status}` }));
      if (!response.ok) throw new Error(body.error ?? `The guide answered ${response.status}`);
      return body as Explanation;
    });
    answers.set(key, answer);
    answer.catch(() => answers.delete(key)); // let a failed question be asked again
  }
  return answer;
}

/**
 * The explanation of `part` of `model` (or of the whole model when `part` is null), and a
 * way to ask again after a failure.
 */
export function useExplanation(model: string, part: string | null, parts: string[]): [ExplanationState, () => void] {
  const key = `${model}\n${part ?? ""}`;
  const [results, setResults] = useState<Record<string, ExplanationState>>({});

  useEffect(() => {
    if (results[key]) return;
    let current = true;
    fetchExplanation(model, part, parts).then(
      (explanation) => current && setResults((r) => ({ ...r, [key]: { status: "done", explanation } })),
      (e: unknown) =>
        current && setResults((r) => ({ ...r, [key]: { status: "error", message: e instanceof Error ? e.message : String(e) } })),
    );
    return () => {
      current = false;
    };
  }, [key, model, part, parts, results]);

  const retry = () =>
    setResults((r) => {
      const rest = { ...r };
      delete rest[key];
      return rest;
    });
  return [results[key] ?? { status: "loading" }, retry];
}
