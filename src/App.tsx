import { useEffect, useState } from "react";
import { ANATOMY, NASA } from "./collections";
import { Explorer } from "./Explorer";
import { Landing, type Destination } from "./components/Landing";
import { useHandControl } from "./hand/useHandControl";

type Screen = "home" | Destination;

/** The screen named in the address (#anatomy, #nasa), so reloading or the back button keeps your place. */
function screenFromHash(): Screen {
  const hash = window.location.hash.slice(1);
  return hash === "anatomy" || hash === "nasa" ? hash : "home";
}

/**
 * The app: a landing page to choose what to explore, and the explorers themselves. The camera
 * and hand control start on load and stay on across screens.
 */
export default function App() {
  const { videoRef, canvasRef, status, error, setControl, start, stats } = useHandControl();
  const [screen, setScreen] = useState<Screen>(screenFromHash);

  useEffect(() => {
    setControl(true);
    void start();
  }, [start, setControl]);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Screen) => {
    window.location.hash = next === "home" ? "" : next;
    setScreen(next);
  };

  return (
    <>
      {screen === "home" ? (
        <Landing onChoose={go} camera={status} hands={stats.hands} />
      ) : (
        // A new key per collection, so switching starts that explorer afresh.
        <Explorer key={screen} collection={screen === "nasa" ? NASA : ANATOMY} onHome={() => go("home")} />
      )}

      {status === "starting" && <p className="message">Allow the camera to begin…</p>}
      {status === "error" && (
        <div className="message">
          <p>{error}</p>
          <button onClick={() => void start()}>Try again</button>
        </div>
      )}
      {/* Tracking reads from this video; it's never shown. */}
      {/* Never picture-in-picture: Chrome offers to pop a playing video out when you leave the tab. */}
      <video ref={videoRef} className="camera" playsInline muted disablePictureInPicture />
      {/* The 3D hand is drawn here; it never blocks the page. */}
      <canvas ref={canvasRef} className="hand-overlay" />
    </>
  );
}
