import type { PartModel } from "../scene/models/types";

interface Props {
  model: PartModel;
  selected: string | null;
  explode: number;
  /** Stop inspecting the selected part and see the whole model again. */
  onClose: () => void;
}

/** A quiet card describing the selected part, and a line of gesture hints. */
export function PartInfo({ model, selected, explode, onClose }: Props) {
  const part = model.parts.find((p) => p.id === selected);

  return (
    <>
      <header className="model-title">
        <h1>{model.name}</h1>
        <p>
          {model.parts.length} parts · {explode > 0.5 ? "scattered" : "assembled"}
        </p>
      </header>

      {part && (
        <aside className="part-card">
          <h2>
            <i />
            {part.name}
          </h2>
          {part.description && <p>{part.description}</p>}
          <p className="muted">Four fingers up/down to zoom.</p>
        </aside>
      )}
      {part && (
        // Outside the card, which lets the hand pass through it; this one must be tappable.
        <button className="back-button" onClick={onClose}>
          ← Whole {model.name.toLowerCase()}
        </button>
      )}

      <footer className="hints">
        <span>
          <b>Point</b> to explore
        </span>
        <span>
          <b>Tap</b> middle finger to thumb to inspect a part
        </span>
        <span>
          <b>Grab</b> and move to turn
        </span>
        <span>
          <b>Four fingers</b> up/down to {part ? "zoom" : "scatter"}
        </span>
        <span>
          <b>Ring finger</b> to thumb to scatter all
        </span>
        <span>
          <b>Both hands</b> grab and pull apart to {part ? "zoom" : "scatter"}
        </span>
      </footer>
    </>
  );
}
