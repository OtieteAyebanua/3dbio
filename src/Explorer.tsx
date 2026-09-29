import { useCallback, useEffect, useState } from "react";
import { ModelPicker } from "./components/ModelPicker";
import { PartInfo } from "./components/PartInfo";
import { GuidePanel } from "./guide/GuidePanel";
import { prettyName } from "./scene/models/buildParts";
import type { Collection, ModelSource } from "./collections";
import type { PartModel } from "./scene/models/types";
import { ModelLoaderLabel } from "./scene/ModelLoader";
import { Studio } from "./scene/Studio";

/**
 * The studio: a soft white 3D room for exploring a collection's models piece by piece, with
 * arrows and a dropdown to move between them, and the guide explaining each one.
 */
export function Explorer({ collection, onHome }: { collection: Collection; onHome: () => void }) {
  const MODELS = collection.models;
  const [source, setSource] = useState<ModelSource>(MODELS[0]);
  // Where we are in MODELS (a dropped file keeps this, so the arrows carry on from there).
  const [modelIndex, setModelIndex] = useState(0);
  const [model, setModel] = useState<PartModel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [explode, setExplode] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /** Show a different model, starting assembled with nothing selected. */
  const openModel = useCallback((next: ModelSource) => {
    setSource(next);
    setModel(null);
    setLoadError("");
    setExplode(0);
    setHovered(null);
    setSelected(null);
  }, []);

  /** Show the model at `index` in MODELS. */
  const pick = useCallback(
    (index: number) => {
      setModelIndex(index);
      openModel(MODELS[index]);
    },
    [openModel, MODELS],
  );

  /** Step to the previous (-1) or next (+1) model, wrapping around. */
  const step = useCallback(
    (by: number) => pick((modelIndex + by + MODELS.length) % MODELS.length),
    [modelIndex, pick, MODELS.length],
  );

  // A trackpad pinch would zoom the whole page; here it scatters or zooms the model instead.
  useEffect(() => {
    const noPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener("wheel", noPageZoom, { passive: false });
    return () => window.removeEventListener("wheel", noPageZoom);
  }, []);

  // The keyboard's arrow keys work too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Drag a .glb file onto the page to view it.
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".glb")) {
        setLoadError("That isn't a .glb file. Export your model as .glb (binary glTF) and drop it again.");
        return;
      }
      openModel({ url: URL.createObjectURL(file), name: prettyName(file.name.replace(/\.glb$/i, ""), 0) });
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openModel]);

  const onModelError = useCallback(
    (message: string) =>
      setLoadError(
        source === MODELS[0]
          ? `The model file for ${source.name} is missing from public/models.`
          : `Couldn't open that model: ${message}`,
      ),
    [source, MODELS],
  );

  return (
    <>
      <Studio
        modelUrl={source.url}
        modelName={source.name}
        modelLabels={source.labels}
        model={model}
        onModelLoaded={setModel}
        onModelError={onModelError}
        explode={explode}
        setExplode={setExplode}
        hovered={hovered}
        setHovered={setHovered}
        selected={selected}
        setSelected={setSelected}
      />
      {/* Slightly darker edges focus the eye inward */}
      <div className="vignette" />
      {model ? (
        <>
          <PartInfo model={model} selected={selected} explode={explode} onClose={() => setSelected(null)} />
          <GuidePanel model={model} selected={selected} />
        </>
      ) : (
        !loadError && (
          <>
            <header className="model-title">
              <h1>{source.name}</h1>
              <p>Loading…</p>
            </header>
            <ModelLoaderLabel name={source.name} />
          </>
        )
      )}
      <div className="top-actions">
        <button className="home-button" onClick={onHome}>
          ← Home
        </button>
        <ModelPicker label={collection.pickerLabel} models={MODELS} current={modelIndex} onPick={pick} />
      </div>
      {MODELS.length > 1 && (
        <>
          {/* Step between models; tap them with the hand like any button */}
          <button
            className="model-arrow left"
            onClick={() => step(-1)}
            aria-label={`Previous: ${MODELS[(modelIndex + MODELS.length - 1) % MODELS.length].name}`}
          >
            <svg viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            <span>{MODELS[(modelIndex + MODELS.length - 1) % MODELS.length].name}</span>
          </button>
          <button
            className="model-arrow right"
            onClick={() => step(1)}
            aria-label={`Next: ${MODELS[(modelIndex + 1) % MODELS.length].name}`}
          >
            <svg viewBox="0 0 24 24">
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span>{MODELS[(modelIndex + 1) % MODELS.length].name}</span>
          </button>
        </>
      )}
      {loadError && <p className="empty-state">{loadError}</p>}
    </>
  );
}
