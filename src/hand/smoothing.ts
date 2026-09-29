/**
 * Steadies MediaPipe's hand points, which wobble slightly from frame to frame.
 *
 * Uses the "One Euro filter" (Casiez et al., 2012): heavy smoothing when the hand is
 * nearly still (removes the shake), light smoothing when it moves fast (no lag).
 */
import type { Hand } from "./landmarks";

/** Smoothing when the hand is still. Lower = steadier, but slow drifts take longer to show. */
export const MIN_CUTOFF = 0.3;
/** How quickly smoothing backs off as the hand speeds up. Higher = less lag on fast moves. */
export const BETA = 12;
/** Smoothing of the speed estimate itself (rarely needs changing). */
const SPEED_CUTOFF = 1;

/** How far to move towards the new value this frame, for a cutoff frequency (Hz). */
function blend(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** Smooths one number over time. */
export class OneEuroFilter {
  private value: number | null = null;
  private speed = 0;
  private minCutoff: number;
  private beta: number;

  constructor(minCutoff = MIN_CUTOFF, beta = BETA) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  update(value: number, dt: number): number {
    if (this.value === null || dt <= 0) {
      this.value = value;
      return value;
    }
    // How fast is it moving? (itself smoothed, so a single wobble doesn't count as speed)
    const rawSpeed = (value - this.value) / dt;
    this.speed += blend(SPEED_CUTOFF, dt) * (rawSpeed - this.speed);
    // Still → low cutoff (heavy smoothing). Fast → high cutoff (light smoothing).
    const cutoff = this.minCutoff + this.beta * Math.abs(this.speed);
    this.value += blend(cutoff, dt) * (value - this.value);
    return this.value;
  }
}

/** Applies a One Euro filter to every x, y and depth of every hand point. */
export class HandSmoother {
  private filters: [OneEuroFilter, OneEuroFilter, OneEuroFilter][][] = [];
  private lastTime: number | null = null;

  /** `now` is in seconds. */
  update(hands: Hand[], now: number): Hand[] {
    let dt = this.lastTime === null ? 0 : now - this.lastTime;
    this.lastTime = now;

    // If a hand appeared or disappeared, start fresh rather than blending different hands.
    if (hands.length !== this.filters.length) {
      this.filters = hands.map((hand) => hand.map(() => [new OneEuroFilter(), new OneEuroFilter(), new OneEuroFilter()]));
      dt = 0;
    }
    return hands.map((hand, h) =>
      hand.map((p, i) => ({
        x: this.filters[h][i][0].update(p.x, dt),
        y: this.filters[h][i][1].update(p.y, dt),
        z: this.filters[h][i][2].update(p.z ?? 0, dt),
      })),
    );
  }
}
