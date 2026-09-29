import { useCallback, useEffect, useState } from "react";
import { PartInfo } from "./components/PartInfo";
import { GuidePanel } from "./guide/GuidePanel";
import { ModelPicker } from "./components/ModelPicker";
import { useHandControl } from "./hand/useHandControl";
import { prettyName } from "./scene/models/buildParts";
import type { PartModel } from "./scene/models/types";
import { Studio } from "./scene/Studio";

/** The models the arrows step through (files in public/models). The first one shows on load. */
const MODELS = [
  { file: "heart.glb", name: "Heart" },
  { file: "lungs.glb", name: "Lungs" },
  { file: "liver.glb", name: "Liver" },
  { file: "abdomen.glb", name: "Stomach, spleen, pancreas & kidneys" },
  { file: "brain.glb", name: "Brain" },
].map((m) => ({ url: `${import.meta.env.BASE_URL}models/${m.file}`, name: m.name }));
const DEFAULT_MODEL = MODELS[0];

/**
 * A soft white 3D studio for exploring a model part by part, with the see-through hand.
 * The camera and hand control start on load.
 */
export default function App() {
  const { videoRef, canvasRef, status, error, setControl, start } = useHandControl();
  const [source, setSource] = useState(DEFAULT_MODEL);
  // Where we are in MODELS (a dropped file keeps this, so the arrows carry on from there).
  const [modelIndex, setModelIndex] = useState(0);
  const [model, setModel] = useState<PartModel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [explode, setExplode] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setControl(true);
    void start();
  }, [start, setControl]);

  /** Show a different model, starting assembled with nothing selected. */
  const openModel = useCallback((next: typeof DEFAULT_MODEL) => {
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
    [openModel],
  );

  /** Step to the previous (-1) or next (+1) model, wrapping around. */
  const step = useCallback(
    (by: number) => pick((modelIndex + by + MODELS.length) % MODELS.length),
    [modelIndex, pick],
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
        source === DEFAULT_MODEL
          ? "No model yet — put your model at public/models/heart.glb, or drag a .glb file onto this page."
          : `Couldn't open that model: ${message}`,
      ),
    [source],
  );

  return (
    <>
      <Studio
        modelUrl={source.url}
        modelName={source.name}
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
          <header className="model-title">
            <h1>{source.name}</h1>
            <p>Loading…</p>
          </header>
        )
      )}
      <ModelPicker models={MODELS} current={modelIndex} onPick={pick} />
      {/* Step between models; tap them with the hand like any button */}
      <button className="model-arrow left" onClick={() => step(-1)} aria-label={`Previous: ${MODELS[(modelIndex + MODELS.length - 1) % MODELS.length].name}`}>
        <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        <span>{MODELS[(modelIndex + MODELS.length - 1) % MODELS.length].name}</span>
      </button>
      <button className="model-arrow right" onClick={() => step(1)} aria-label={`Next: ${MODELS[(modelIndex + 1) % MODELS.length].name}`}>
        <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        <span>{MODELS[(modelIndex + 1) % MODELS.length].name}</span>
      </button>
      {loadError && <p className="empty-state">{loadError}</p>}

      {status === "starting" && <p className="message">Allow the camera to begin…</p>}
      {status === "error" && (
        <div className="message">
          <p>{error}</p>
          <button onClick={() => void start()}>Try again</button>
        </div>
      )}
      {/* Tracking reads from this video; it's never shown. */}
      <video ref={videoRef} className="camera" playsInline muted />
      {/* The see-through hand is drawn here; it never blocks the page. */}
      <canvas ref={canvasRef} className="hand-overlay" />
    </>
  );
}
