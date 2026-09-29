/**
 * The guide: explains the model on show — or the selected part — with what it is, what it
 * does and some fun facts, written by DeepSeek. It can read its explanation aloud.
 */
import { useEffect, useMemo, useState } from "react";
import type { PartModel } from "../scene/models/types";
import { speak, stopSpeaking } from "./speak";
import { useExplanation, type Explanation } from "./useExplanation";

interface Props {
  model: PartModel;
  selected: string | null;
}

function spoken(e: Explanation): string {
  const facts = e.funFacts.length ? ` Here are some fun facts. ${e.funFacts.join(" ")}` : "";
  return `${e.title}. ${e.summary} ${e.role}${facts}`;
}

export function GuidePanel({ model, selected }: Props) {
  const part = model.parts.find((p) => p.id === selected) ?? null;
  const partNames = useMemo(() => model.parts.map((p) => p.name), [model]);
  const state = useExplanation(model.name, part?.name ?? null, partNames);
  const [open, setOpen] = useState(true);
  const [voice, setVoice] = useState(false);

  // With the voice on, read out each new explanation as it arrives.
  const explanation = state.status === "done" ? state.explanation : null;
  useEffect(() => {
    if (voice && explanation) speak(spoken(explanation));
    return stopSpeaking;
  }, [voice, explanation]);

  const subject = part?.name ?? model.name;

  return (
    <aside className={`guide ${open ? "" : "closed"}`}>
      <header>
        <button className="guide-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="guide-dot" />
          {open ? "Guide" : `About ${subject}`}
        </button>
        {open && (
          <button className={`guide-voice ${voice ? "on" : ""}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
            {voice ? "Voice on" : "Voice off"}
          </button>
        )}
      </header>

      {open && (
        <div className="guide-body">
          {state.status === "loading" && (
            <>
              <h2>{subject}</h2>
              <p className="guide-loading">The guide is looking this up…</p>
            </>
          )}
          {state.status === "error" && (
            <>
              <h2>{subject}</h2>
              <p className="guide-error">The guide couldn't answer: {state.message}</p>
            </>
          )}
          {explanation && (
            <>
              <h2>{explanation.title}</h2>
              <p>{explanation.summary}</p>
              {explanation.role && (
                <>
                  <h3>What it does</h3>
                  <p>{explanation.role}</p>
                </>
              )}
              {explanation.funFacts.length > 0 && (
                <>
                  <h3>Fun facts</h3>
                  <ul>
                    {explanation.funFacts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
