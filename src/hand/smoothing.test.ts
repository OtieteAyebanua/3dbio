import { describe, expect, it } from "vitest";
import { cameraToPage } from "./mapping";
import { HandSmoother } from "./smoothing";

/** A tiny repeatable random-number generator, so the noise is the same every run. */
function noise(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 2;
  };
}

describe("HandSmoother", () => {
  it("cuts the wobble of a still hand to a fraction", () => {
    const rand = noise(7);
    const smoother = new HandSmoother();
    const out: number[] = [];
    for (let i = 0; i < 90; i++) {
      const x = 0.5 + rand() * 0.004; // MediaPipe-like wobble
      out.push(smoother.update([[{ x, y: 0.5 }]], i / 30)[0][0].x);
    }
    const settled = out.slice(30);
    const spread = Math.max(...settled) - Math.min(...settled);
    expect(spread).toBeLessThan(0.008 / 3);
  });

  it("follows a fast move without much lag", () => {
    const smoother = new HandSmoother();
    let last = 0;
    for (let i = 0; i <= 30; i++) last = smoother.update([[{ x: 0.3 + (0.4 * i) / 30, y: 0.5 }]], i / 30)[0][0].x;
    expect(0.7 - last).toBeLessThan(0.02);
  });

  it("starts fresh when a hand appears", () => {
    const smoother = new HandSmoother();
    smoother.update([[{ x: 0.1, y: 0.1 }]], 0);
    expect(smoother.update([[{ x: 0.1, y: 0.1 }], [{ x: 0.9, y: 0.9 }]], 0.03)[1][0]).toEqual({ x: 0.9, y: 0.9, z: 0 });
  });
});

describe("cameraToPage", () => {
  const video = { width: 640, height: 480 };
  const page = { width: 1600, height: 900 };

  it("maps the middle of the camera image to the middle of the page", () => {
    expect(cameraToPage([{ x: 0.5, y: 0.5 }], video, page)[0]).toEqual({ x: 800, y: 450, z: 0 });
  });

  it("reaches the page edges before the hand reaches the camera's edges", () => {
    const [topLeft, bottomRight] = cameraToPage(
      [
        { x: 0.15, y: 0.5 - 0.35 * (900 / 1600) * (640 / 480) },
        { x: 0.85, y: 0.5 + 0.35 * (900 / 1600) * (640 / 480) },
      ],
      video,
      page,
    );
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(0);
    expect(bottomRight.x).toBeCloseTo(1600);
    expect(bottomRight.y).toBeCloseTo(900);
  });

  it("doesn't stretch the hand when camera and window shapes differ", () => {
    const [a, b] = cameraToPage([{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }], video, page);
    // A square in camera pixels (0.2 × 640 wide vs 0.2 × 480 tall) keeps its proportions.
    expect((b.x - a.x) / (b.y - a.y)).toBeCloseTo((0.2 * 640) / (0.2 * 480));
  });
});
