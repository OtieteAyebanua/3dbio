/** MediaPipe hand tracking in the browser. The model and engine files are served by this app. */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Hand } from "./landmarks";

const BASE = import.meta.env.BASE_URL;

export class HandTracker {
  private landmarker: HandLandmarker;
  private lastTimestamp = 0;
  /** "GPU" or "CPU" — which one MediaPipe ended up running on. */
  readonly delegate: string;

  private constructor(landmarker: HandLandmarker, delegate: string) {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  /** Load the model. Tries the graphics chip (fast) first, then the CPU. */
  static async create(): Promise<HandTracker> {
    const files = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const landmarker = await HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
          runningMode: "VIDEO",
          numHands: 2,
        });
        return new HandTracker(landmarker, delegate);
      } catch (error) {
        if (delegate === "CPU") throw error;
        console.warn("GPU hand tracking unavailable, falling back to CPU:", error);
      }
    }
    throw new Error("unreachable");
  }

  /**
   * Find hands in the current video frame. Returns 21 points per hand as 0–1 fractions of
   * the image, mirrored (so moving your hand right moves it right on screen, like a mirror).
   */
  detect(video: HTMLVideoElement): Hand[] {
    // VIDEO mode needs strictly increasing timestamps.
    const timestamp = Math.max(performance.now(), this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    const result = this.landmarker.detectForVideo(video, timestamp);
    return result.landmarks.map((hand) => hand.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
  }

  close(): void {
    this.landmarker.close();
  }
}
