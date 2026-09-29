/**
 * The landing page: choose what to explore. Each card shows its model turning live; the cards
 * are big, so they're easy to tap with the hand (middle finger to thumb) as well as the mouse.
 */
import { useState } from "react";
import { ANATOMY, NASA } from "../collections";
import type { CameraStatus } from "../hand/useHandControl";
import { ModelPreview } from "./ModelPreview";

export type Destination = "anatomy" | "nasa";

interface Props {
  onChoose: (destination: Destination) => void;
  camera: CameraStatus;
  /** How many hands the camera sees right now. */
  hands: number;
}

const GESTURES = [
  { name: "Point", does: "to move", icon: "M12 21V9m0 0V4.5a1.5 1.5 0 0 1 3 0V12m-3-3a1.5 1.5 0 0 0-3 0v5" },
  { name: "Tap", does: "middle finger to thumb to choose", icon: "M8 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm4-10v3m-7 1 2 2m12-2-2 2" },
  { name: "Grab", does: "and move to turn", icon: "M6 12a6 6 0 0 0 12 0V9a2 2 0 0 0-4 0m0 0V8a2 2 0 0 0-4 0v1m0 0a2 2 0 0 0-4 0v3" },
  { name: "Both hands", does: "pull apart to scatter", icon: "M4 12h6m10 0h-6M7 9l-3 3 3 3m10-6 3 3-3 3" },
];

/** A short line about the camera and hand, so visitors know it's working. */
function HandStatus({ camera, hands }: { camera: CameraStatus; hands: number }) {
  const [text, tone] =
    camera === "error"
      ? ["Camera unavailable — the mouse works too", "off"]
      : camera !== "on"
        ? ["Starting the camera…", "wait"]
        : hands > 0
          ? [hands > 1 ? "Both hands detected" : "Hand detected", "on"]
          : ["Raise your hand to the camera", "wait"];
  return (
    <p className={`hand-status ${tone}`}>
      <span className="hand-status-dot" />
      {text}
    </p>
  );
}

export function Landing({ onChoose, camera, hands }: Props) {
  const [pointedAt, setPointedAt] = useState<Destination | null>(null);
  const partCount = "800+";

  const card = (destination: Destination) => ({
    onClick: () => onChoose(destination),
    onPointerEnter: () => setPointedAt(destination),
    onPointerLeave: () => setPointedAt(null),
  });

  return (
    <main className="landing">
      <nav className="landing-nav">
        <span className="landing-brand">
          <img className="landing-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          View3d
        </span>
        <HandStatus camera={camera} hands={hands} />
      </nav>

      <header className="landing-header">
        <p className="landing-kicker">Touch-free 3D explorer</p>
        <h1>
          Reach in and <em>take things apart.</em>
        </h1>
        <p className="landing-lead">
          Point, grab and pull apart real 3D models with your hand, from the human heart to a Mars rover, with a guide
          that explains every piece.
        </p>
      </header>

      <div className="landing-cards">
        <button className={`landing-card anatomy ${pointedAt === "anatomy" ? "active" : ""}`} {...card("anatomy")}>
          <div className="landing-art">
            <ModelPreview url={ANATOMY.models[0].url} active={pointedAt === "anatomy"} />
          </div>
          <div className="landing-text">
            <p className="landing-tag">Human anatomy</p>
            <h2>Inside the human body</h2>
            <p>The heart, brain, skull, lungs and more, each one taken apart piece by piece.</p>
            <div className="landing-meta">
              <span>{ANATOMY.models.length} models</span>
              <span>{partCount} parts</span>
              <span className="landing-go">Explore →</span>
            </div>
          </div>
        </button>

        <button className={`landing-card nasa ${pointedAt === "nasa" ? "active" : ""}`} {...card("nasa")}>
          <div className="landing-art">
            <span className="stars" aria-hidden />
            <ModelPreview url={NASA.models[0].url} active={pointedAt === "nasa"} tilt={0.12} />
          </div>
          <div className="landing-text">
            <p className="landing-tag">NASA</p>
            <h2>Spacecraft up close</h2>
            <p>The Perseverance Mars rover and Gateway, the space station that will orbit the Moon.</p>
            <div className="landing-meta">
              <span>{NASA.models.length} spacecraft</span>
              <span>Mars &amp; Moon</span>
              <span className="landing-go">Explore →</span>
            </div>
          </div>
        </button>
      </div>

      <ul className="landing-gestures">
        {GESTURES.map((g) => (
          <li key={g.name}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={g.icon} />
            </svg>
            <span>
              <b>{g.name}</b> {g.does}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
