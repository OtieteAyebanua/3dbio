/**
 * A dropdown of every body part (model) that can be explored. Built from buttons rather than
 * a <select>, because the browser's own dropdown list can't be opened by the hand's pointer.
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  models: { name: string }[];
  current: number;
  onPick: (index: number) => void;
}

export function ModelPicker({ models, current, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Tapping anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className={`model-picker ${open ? "open" : ""}`} ref={root}>
      <button className="model-picker-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Body parts
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul role="listbox">
          {models.map((m, i) => (
            <li key={m.name}>
              <button
                role="option"
                aria-selected={i === current}
                className={i === current ? "current" : ""}
                onClick={() => {
                  setOpen(false);
                  if (i !== current) onPick(i);
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
