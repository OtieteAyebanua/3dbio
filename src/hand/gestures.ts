/**
 * Hand gestures → pointer actions. All hands here are 21 points in page pixels.
 *
 *   Middle fingertip touches thumb   → left click when they come apart
 *   Ring fingertip touches thumb     → right click
 *   Curl all four fingers (grab)     → press and drag; open the hand to drop
 *   Four fingers straight, thumb in  → scroll by moving the hand up/down
 *   Both hands grab                  → pinch: pull apart / push together (scatter / assemble)
 */
import {
  distance,
  handSize,
  INDEX_KNUCKLE,
  INDEX_TIP,
  MIDDLE_KNUCKLE,
  MIDDLE_TIP,
  palmCenter,
  RING_TIP,
  THUMB_TIP,
  WRIST,
  type Hand,
  type Point,
} from "./landmarks";
import type { Pointer } from "./pageController";

/** How far the tip reaches from the wrist compared with another joint (lower = more curled). */
function reach(hand: Hand, tip: number, joint: number): number {
  return distance(hand[WRIST], hand[tip]) / Math.max(distance(hand[WRIST], hand[joint]), 1e-6);
}

// ---------------------------------------------------------------------------------------------
// Click / right click: fingertip touches the thumb

/** Gap between fingertip and thumb tip, relative to hand size. Measured: touching ≈ 0.2–0.3. */
export const TOUCH = 0.3; // closer than this counts as touching
export const RELEASE = 0.38; // further than this counts as apart (the gap stops flickering)
/** Clicks only start while the index finger points (fairly straight), so a closing grab can't click. */
export const INDEX_STRAIGHT = 1.5;

type ClickFinger = "click" | "right";
const CLICK_FINGERS: Record<ClickFinger, number> = { click: MIDDLE_TIP, right: RING_TIP };

export class ClickGesture {
  touching: ClickFinger | null = null;
  private touchPosition: Point | null = null;
  private pointer: Pointer;

  constructor(pointer: Pointer) {
    this.pointer = pointer;
  }

  /** `hand` is null when there's no hand, or another gesture took over (cancels without clicking). */
  update(hand: Hand | null): void {
    if (!hand) {
      this.touching = null;
      return;
    }
    const size = handSize(hand);
    if (size < 1) return;
    const gaps = {
      click: distance(hand[THUMB_TIP], hand[CLICK_FINGERS.click]) / size,
      right: distance(hand[THUMB_TIP], hand[CLICK_FINGERS.right]) / size,
    };

    if (this.touching) {
      if (gaps[this.touching] > RELEASE) {
        // Fingers apart: a left click happens now, where the fingers first met.
        if (this.touching === "click") this.pointer.click("left", this.touchPosition ?? undefined);
        this.touching = null;
      }
      return;
    }
    const pointing = reach(hand, INDEX_TIP, INDEX_KNUCKLE) > INDEX_STRAIGHT;
    const closest: ClickFinger = gaps.click <= gaps.right ? "click" : "right";
    if (pointing && gaps[closest] < TOUCH) {
      this.touching = closest;
      // Remember where the pointer was when the fingers met: moving the fingers can nudge
      // the index finger, and so the pointer, a little.
      this.touchPosition = this.pointer.position;
      if (closest === "right") this.pointer.click("right", this.touchPosition ?? undefined);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Grab to drag: every finger curled

/** Least-curled finger's reach below this = grabbing; above OPEN = let go. Straight ≈ 1.8–1.9. */
export const GRAB = 1.45;
export const OPEN = 1.65;
/** Frames the pose must be seen (or gone) in a row before switching. */
const GRAB_FRAMES = 2;
/** Curling pulls the index tip (the pointer) down; grab where the pointer was this long before. */
const LOOKBACK = 0.25;

/** How straight the least-curled finger is (so pointing — index straight — isn't a grab). */
export function curl(hand: Hand): number {
  return Math.max(...[[8, 5], [12, 9], [16, 13], [20, 17]].map(([tip, knuckle]) => reach(hand, tip, knuckle)));
}

export class GrabGesture {
  active = false;
  private streak = 0;
  private history: { time: number; point: Point }[] = [];
  private anchor: Point = { x: 0, y: 0 };
  private palmAnchor: Point = { x: 0, y: 0 };
  private pointer: Pointer;

  constructor(pointer: Pointer) {
    this.pointer = pointer;
  }

  /** Returns true while grabbing. `now` is in seconds. */
  update(hand: Hand | null, now: number, allowed = true): boolean {
    if (!hand) {
      this.letGo();
      return false;
    }
    const amount = curl(hand);
    const wanted = this.active ? amount < OPEN : allowed && amount < GRAB;
    if (wanted !== this.active) {
      if (++this.streak >= GRAB_FRAMES) {
        this.streak = 0;
        if (wanted) this.grab(hand, now);
        else this.letGo();
      }
    } else {
      this.streak = 0;
    }

    if (this.active) {
      // While grabbing, the pointer follows the palm (the fingertips are curled away).
      const palm = palmCenter(hand);
      this.pointer.moveTo({
        x: this.anchor.x + palm.x - this.palmAnchor.x,
        y: this.anchor.y + palm.y - this.palmAnchor.y,
      });
    } else if (this.pointer.position) {
      this.history.push({ time: now, point: this.pointer.position });
      while (this.history.length && now - this.history[0].time > 1) this.history.shift();
    }
    return this.active;
  }

  private grab(hand: Hand, now: number): void {
    const before = this.history.find((h) => h.time >= now - LOOKBACK);
    this.anchor = before?.point ?? this.pointer.position ?? { x: 0, y: 0 };
    this.palmAnchor = palmCenter(hand);
    this.pointer.press(this.anchor);
    this.active = true;
  }

  private letGo(): void {
    if (this.active) this.pointer.release();
    this.active = false;
    this.streak = 0;
    this.history = [];
  }
}

// ---------------------------------------------------------------------------------------------
// Scroll: four fingers straight with the thumb tucked in

/** A finger is straight when its tip reaches this much further from the wrist than its middle joint. */
export const STRAIGHT = 1.15;
/** Thumb tip closer than this (relative to hand size) to the middle knuckle = tucked in. */
export const THUMB_TUCKED = 0.55;
const SCROLL_FRAMES = 4;
/** Scroll distance per pixel the hand moves. Negative flips the direction. */
export const SCROLL_SPEED = 2;
/** Ignore hand movements smaller than this (pixels per frame): the leftover wobble. */
const SCROLL_DEAD_ZONE = 1.5;
const FINGER_JOINTS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

export function isScrollPose(hand: Hand): boolean {
  const size = handSize(hand);
  if (size < 1) return false;
  const straight = FINGER_JOINTS.every(([tip, joint]) => reach(hand, tip, joint) > STRAIGHT);
  return straight && distance(hand[THUMB_TIP], hand[MIDDLE_KNUCKLE]) / size < THUMB_TUCKED;
}

export class ScrollGesture {
  active = false;
  private streak = 0;
  private lastY: number | null = null;
  private pointer: Pointer;

  constructor(pointer: Pointer) {
    this.pointer = pointer;
  }

  /** Returns true while in scroll mode. */
  update(hand: Hand | null, allowed = true): boolean {
    const pose = hand !== null && allowed && isScrollPose(hand);
    if (pose !== this.active) {
      if (++this.streak >= SCROLL_FRAMES) {
        this.active = pose;
        this.streak = 0;
        this.lastY = null;
      }
    } else {
      this.streak = 0;
    }
    if (!this.active || !pose || !hand) {
      // Pose gone (maybe only for a frame): stop scrolling at once, stay in scroll mode briefly.
      this.lastY = null;
      return this.active;
    }
    const y = palmCenter(hand).y;
    if (this.lastY !== null) {
      const moved = y - this.lastY;
      // Hand up → page content moves up with it (like dragging a page on a touchscreen).
      if (Math.abs(moved) >= SCROLL_DEAD_ZONE) this.pointer.scroll(-moved * SCROLL_SPEED);
    }
    this.lastY = y;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Two hands: both grabbing, then pulled apart or pushed together

/** Pinch amount per pixel the hands move apart or together. */
export const SPREAD_SPEED = 1.5;
/** Ignore changes in the hands' distance smaller than this (pixels per frame): wobble. */
const SPREAD_DEAD_ZONE = 1.5;

/** Whether a hand is making a fist (grabbing), with the same thresholds as a one-hand grab. */
function isFist(hand: Hand, alreadyGrabbing: boolean): boolean {
  return curl(hand) < (alreadyGrabbing ? OPEN : GRAB);
}

export class TwoHandGesture {
  active = false;
  private streak = 0;
  private lastGap: number | null = null;
  private pointer: Pointer;

  constructor(pointer: Pointer) {
    this.pointer = pointer;
  }

  /** Returns true while both hands are grabbing. */
  update(hands: Hand[]): boolean {
    const pose = hands.length >= 2 && isFist(hands[0], this.active) && isFist(hands[1], this.active);
    if (pose !== this.active) {
      if (++this.streak >= GRAB_FRAMES) {
        this.active = pose;
        this.streak = 0;
        this.lastGap = null;
      }
    } else {
      this.streak = 0;
    }
    if (!this.active || !pose) {
      this.lastGap = null;
      return this.active;
    }
    const [a, b] = [palmCenter(hands[0]), palmCenter(hands[1])];
    const gap = distance(a, b);
    if (this.lastGap !== null) {
      const change = gap - this.lastGap;
      // Apart → negative (spread), together → positive, as with a trackpad pinch.
      if (Math.abs(change) >= SPREAD_DEAD_ZONE) {
        this.pointer.pinch(-change * SPREAD_SPEED, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
    this.lastGap = gap;
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Putting it together

export type HandState = "" | "click" | "right" | "drag" | "scroll" | "spread";

/** Decides which gesture is in charge each frame and moves the pointer. */
export class HandController {
  private click: ClickGesture;
  private grab: GrabGesture;
  private scrollGesture: ScrollGesture;
  private twoHands: TwoHandGesture;
  private pointer: Pointer;

  constructor(pointer: Pointer) {
    this.pointer = pointer;
    this.click = new ClickGesture(pointer);
    this.grab = new GrabGesture(pointer);
    this.scrollGesture = new ScrollGesture(pointer);
    this.twoHands = new TwoHandGesture(pointer);
  }

  /**
   * `hands` in page pixels; the first hand controls the pointer (both hands together can
   * pinch). Returns the hands to draw (adjusted while grabbing) and what they're doing.
   */
  update(hands: Hand[], now: number): { hands: Hand[]; state: HandState } {
    // Both hands grabbing: the two-hand pinch is in charge; one-hand gestures stop.
    if (this.twoHands.update(hands)) {
      this.scrollGesture.update(null);
      this.grab.update(null, now);
      this.click.update(null);
      return { hands, state: "spread" };
    }
    if (!hands.length) {
      this.scrollGesture.update(null);
      this.grab.update(null, now);
      this.click.update(null);
      return { hands, state: "" };
    }
    const hand = hands[0];
    // The other hand making a fist too is the start of a two-hand pinch, not a one-hand grab.
    const otherFist = hands.length >= 2 && isFist(hands[1], false);
    // Only one of scroll / grab / point-and-click is in charge at a time.
    const scrolling = this.scrollGesture.update(hand, !this.click.touching && !this.grab.active);
    const grabbing = this.grab.update(hand, now, !scrolling && !otherFist);
    if (scrolling || grabbing) {
      this.click.update(null); // cancel any half-finished click
    } else {
      this.pointer.moveTo(hand[INDEX_TIP]);
      this.click.update(hand);
    }

    let drawn = hands;
    if (grabbing && this.pointer.position) {
      // The pointer follows the palm while grabbing; draw the hand with its index tip on it.
      const dx = this.pointer.position.x - hand[INDEX_TIP].x;
      const dy = this.pointer.position.y - hand[INDEX_TIP].y;
      drawn = [hand.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })), ...hands.slice(1)];
    }
    const state: HandState = this.scrollGesture.active ? "scroll" : this.grab.active ? "drag" : (this.click.touching ?? "");
    return { hands: drawn, state };
  }
}
