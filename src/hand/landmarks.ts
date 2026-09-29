/** A point, either as 0–1 fractions of the camera image or in page pixels. */
export interface Point {
  x: number;
  y: number;
  /**
   * Depth, from MediaPipe: distance from the wrist towards (negative) or away from (positive)
   * the camera, in the same units as x. Only used to draw the hand in 3D.
   */
  z?: number;
}

/** One hand = MediaPipe's 21 landmarks. */
export type Hand = Point[];

// MediaPipe's standard hand landmark numbers.
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_KNUCKLE = 5;
export const INDEX_TIP = 8;
export const MIDDLE_KNUCKLE = 9;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;

/** Each finger as a chain of landmarks from the knuckle out to the tip. */
export const FINGERS = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // pinky
];

/** Outline of the palm. */
export const PALM = [0, 1, 5, 9, 13, 17];

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Wrist → middle-finger knuckle: a stable measure of how big the hand appears. */
export function handSize(hand: Hand): number {
  return distance(hand[WRIST], hand[MIDDLE_KNUCKLE]);
}

/** Centre of the palm. */
export function palmCenter(hand: Hand): Point {
  const points = [0, 5, 9, 13, 17].map((i) => hand[i]);
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}
