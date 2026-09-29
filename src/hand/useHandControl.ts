/**
 * The whole hand pipeline, run every camera frame:
 * camera → MediaPipe → smoothing → page coordinates → gestures → draw the hand.
 *
 * The per-frame work stays out of React state (it would re-render 30 times a second);
 * only the small status readout is state, updated twice a second.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { HandController, type HandState } from "./gestures";
import { HandRenderer } from "./handRenderer";
import { HandTracker } from "./handTracker";
import { cameraToPage } from "./mapping";
import { PageController } from "./pageController";
import { HandSmoother } from "./smoothing";

export type CameraStatus = "off" | "starting" | "on" | "error";

export interface HandStats {
  fps: number;
  hands: number;
  state: HandState;
  delegate: string;
}

/**
 * Start the camera and the per-frame loop. Returns a function that stops everything.
 * `isControlling()` is checked every frame: whether the hand should drive the page.
 */
export async function startHandPipeline(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  isControlling: () => boolean,
  onStats: (stats: HandStats) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  let tracker: HandTracker;
  try {
    video.srcObject = stream;
    await video.play();
    tracker = await HandTracker.create();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    throw e;
  }

  const smoother = new HandSmoother();
  const pointer = new PageController();
  const controller = new HandController(pointer);
  const renderer = new HandRenderer(canvas);
  let frame = 0;
  let lastVideoTime = -1;
  let frames = 0;
  let statsTime = performance.now();
  let latest: Pick<HandStats, "hands" | "state"> = { hands: 0, state: "" };
  let controlling = false;

  const loop = () => {
    frame = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return; // no new frame yet
    lastVideoTime = video.currentTime;

    const now = performance.now() / 1000;
    const camera = { width: video.videoWidth, height: video.videoHeight };
    const page = { width: window.innerWidth, height: window.innerHeight };
    const hands = smoother.update(tracker.detect(video), now).map((hand) => cameraToPage(hand, camera, page));

    if (isControlling()) {
      controlling = true;
      const result = controller.update(hands, now);
      renderer.draw(result.hands, result.state, hands.length ? pointer.position : null);
      if (!hands.length) pointer.clearHover();
      latest = { hands: hands.length, state: result.state };
    } else {
      if (controlling) {
        // Hand control just switched off: let go of anything held, remove highlights.
        controller.update([], now);
        pointer.clearHover();
        controlling = false;
      }
      renderer.draw(hands, "", null);
      latest = { hands: hands.length, state: "" };
    }

    frames++;
    const t = performance.now();
    if (t - statsTime >= 500) {
      onStats({ fps: (frames * 1000) / (t - statsTime), ...latest, delegate: tracker.delegate });
      frames = 0;
      statsTime = t;
    }
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    controller.update([], performance.now() / 1000);
    pointer.clearHover();
    renderer.clear();
    tracker.close();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** React wrapper: camera on/off, hand control on/off, and a status readout. */
export function useHandControl() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState("");
  const [control, setControl] = useState(false);
  const [stats, setStats] = useState<HandStats>({ fps: 0, hands: 0, state: "", delegate: "" });

  const controlRef = useRef(control);
  const stopRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    // React's StrictMode runs effects twice in development; never open the camera twice.
    if (stopRef.current || startingRef.current) return;
    startingRef.current = true;
    setStatus("starting");
    setError("");
    try {
      stopRef.current = await startHandPipeline(
        videoRef.current!,
        canvasRef.current!,
        () => controlRef.current,
        setStats,
      );
      setStatus("on");
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow the camera for this site in the browser's address bar, then try again."
          : `Couldn't start: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setStatus("off");
    setStats({ fps: 0, hands: 0, state: "", delegate: "" });
  }, []);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  // Release the camera if the page component goes away.
  useEffect(() => () => stopRef.current?.(), []);

  return { videoRef, canvasRef, status, error, control, setControl, stats, start, stop };
}
