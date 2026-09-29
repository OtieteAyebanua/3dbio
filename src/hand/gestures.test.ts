import { describe, expect, it } from "vitest";
import { ClickGesture, curl, GrabGesture, HandController, isScrollPose, ScrollGesture, TwoHandGesture } from "./gestures";
import { INDEX_TIP, type Hand, type Point } from "./landmarks";
import type { Pointer } from "./pageController";

/** Records what the gestures ask the pointer to do. */
class FakePointer implements Pointer {
  position: Point | null = null;
  log: string[] = [];
  moveTo(p: Point) {
    this.position = p;
  }
  press(at?: Point) {
    if (at) this.position = at;
    this.log.push(`press@${fmt(this.position)}`);
  }
  release() {
    this.log.push(`release@${fmt(this.position)}`);
  }
  click(button: "left" | "right", at?: Point) {
    this.log.push(`${button}@${fmt(at ?? this.position)}`);
  }
  scroll(pixels: number) {
    this.log.push(`scroll ${Math.round(pixels)}`);
  }
  pinch(pixels: number, at: Point) {
    this.log.push(`pinch ${Math.round(pixels)}@${fmt(at)}`);
  }
}
const fmt = (p: Point | null) => (p ? `${Math.round(p.x)},${Math.round(p.y)}` : "none");

/**
 * A made-up right hand in page pixels: wrist at (500, 700), knuckles at y = 500 (hand size 200).
 * `curls` per finger (index, middle, ring, pinky): 0 = straight, 1 = fully curled.
 */
function makeHand({
  curls = [0, 0, 0, 0],
  thumb = "out" as "out" | "spread" | "tucked" | Point,
  middleTip,
  ringTip,
  dx = 0,
  dy = 0,
}: {
  curls?: number[];
  thumb?: "out" | "spread" | "tucked" | Point;
  middleTip?: Point;
  ringTip?: Point;
  dx?: number;
  dy?: number;
} = {}): Hand {
  const h: Point[] = new Array(21);
  h[0] = { x: 500, y: 700 };
  // "out": resting beside the index finger; "spread": relaxed and well away from the palm.
  const thumbTip =
    thumb === "out" ? { x: 400, y: 555 } : thumb === "spread" ? { x: 320, y: 575 } : thumb === "tucked" ? { x: 485, y: 545 } : thumb;
  h[1] = { x: 450, y: 660 };
  h[2] = { x: 420, y: 620 };
  h[3] = { x: 405, y: 585 };
  h[4] = thumbTip;
  [440, 480, 520, 560].forEach((x, i) => {
    const base = 5 + 4 * i;
    h[base] = { x, y: 500 };
    let px = x;
    let py = 500;
    let angle = 0;
    [75, 50, 45].forEach((seg, j) => {
      angle += (curls[i] * 150) / 3; // joints bend; the tip curls back towards the palm
      px += seg * Math.sin((angle * Math.PI) / 180) * 0.15;
      py -= seg * Math.cos((angle * Math.PI) / 180);
      h[base + 1 + j] = { x: px, y: py };
    });
  });
  if (middleTip) h[12] = middleTip;
  if (ringTip) h[16] = ringTip;
  return h.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

describe("ClickGesture", () => {
  it("left-clicks when the middle finger touches the thumb and comes apart, where they first met", () => {
    const pointer = new FakePointer();
    const click = new ClickGesture(pointer);
    pointer.moveTo({ x: 300, y: 200 });
    click.update(makeHand({ middleTip: { x: 410, y: 560 } })); // touching (gap ≈ 0.06)
    expect(click.touching).toBe("click");
    expect(pointer.log).toEqual([]); // nothing yet — the click happens on release
    pointer.moveTo({ x: 305, y: 204 }); // index wobbles while pinching
    click.update(makeHand({ middleTip: { x: 460, y: 555 } })); // gap 0.30: in the no-flicker band
    expect(click.touching).toBe("click");
    click.update(makeHand()); // apart
    expect(pointer.log).toEqual(["left@300,200"]);
    expect(click.touching).toBe(null);
  });

  it("right-clicks as soon as the ring finger touches the thumb, once", () => {
    const pointer = new FakePointer();
    const click = new ClickGesture(pointer);
    pointer.moveTo({ x: 50, y: 60 });
    click.update(makeHand({ ringTip: { x: 405, y: 560 } }));
    click.update(makeHand({ ringTip: { x: 405, y: 560 } }));
    expect(pointer.log).toEqual(["right@50,60"]);
  });

  it("ignores touches while the index finger is curled (e.g. closing into a grab)", () => {
    const pointer = new FakePointer();
    const click = new ClickGesture(pointer);
    click.update(makeHand({ curls: [0.8, 0.8, 0.8, 0.8], ringTip: { x: 405, y: 560 } }));
    click.update(makeHand());
    expect(pointer.log).toEqual([]);
  });

  it("cancels without clicking when the hand disappears mid-touch", () => {
    const pointer = new FakePointer();
    const click = new ClickGesture(pointer);
    click.update(makeHand({ middleTip: { x: 410, y: 560 } }));
    click.update(null);
    click.update(makeHand());
    expect(pointer.log).toEqual([]);
  });
});

describe("GrabGesture", () => {
  it("does not treat pointing (only the index straight) as a grab", () => {
    expect(curl(makeHand({ curls: [0, 1, 1, 1] }))).toBeGreaterThan(1.65);
  });

  it("picks up where the pointer was before the hand closed, drags with the palm, drops on open", () => {
    const pointer = new FakePointer();
    const grab = new GrabGesture(pointer);
    let t = 100;
    const frame = (hand: Hand | null) => {
      t += 1 / 30;
      return grab.update(hand, t);
    };
    pointer.moveTo({ x: 440, y: 330 });
    for (let i = 0; i < 10; i++) frame(makeHand());
    // Closing the hand drags the index tip (the pointer) downwards.
    for (const c of [0.2, 0.4, 0.6, 0.8, 1]) {
      pointer.moveTo(makeHand({ curls: [c, c, c, c] })[INDEX_TIP]);
      frame(makeHand({ curls: [c, c, c, c] }));
    }
    frame(makeHand({ curls: [1, 1, 1, 1] }));
    expect(grab.active).toBe(true);
    expect(pointer.log[0]).toBe("press@440,330"); // the spot from before the curl

    frame(makeHand({ curls: [1, 1, 1, 1], dx: 60, dy: -30 }));
    expect(fmt(pointer.position)).toBe("500,300"); // moved with the palm

    for (const c of [0.5, 0, 0]) frame(makeHand({ curls: [c, c, c, c], dx: 60, dy: -30 }));
    expect(grab.active).toBe(false);
    expect(pointer.log.at(-1)).toBe("release@500,300");
  });

  it("releases if the hand disappears while grabbing", () => {
    const pointer = new FakePointer();
    const grab = new GrabGesture(pointer);
    pointer.moveTo({ x: 10, y: 10 });
    grab.update(makeHand({ curls: [1, 1, 1, 1] }), 1);
    grab.update(makeHand({ curls: [1, 1, 1, 1] }), 1.03);
    grab.update(null, 1.06);
    expect(pointer.log).toEqual(["press@10,10", "release@10,10"]);
  });
});

describe("ScrollGesture", () => {
  it("recognises four straight fingers with the thumb tucked — and nothing else", () => {
    expect(isScrollPose(makeHand({ thumb: "tucked" }))).toBe(true);
    expect(isScrollPose(makeHand({ thumb: "spread" }))).toBe(false); // relaxed open hand
    expect(isScrollPose(makeHand({ thumb: "tucked", curls: [0, 0, 0, 1] }))).toBe(false); // pinky bent
  });

  it("scrolls with the hand after a few steady frames, and stops at once when the pose ends", () => {
    const pointer = new FakePointer();
    const scroll = new ScrollGesture(pointer);
    for (let i = 0; i < 4; i++) scroll.update(makeHand({ thumb: "tucked" }));
    expect(scroll.active).toBe(true);
    scroll.update(makeHand({ thumb: "tucked", dy: -20 })); // hand up → page moves up with it
    scroll.update(makeHand({ thumb: "tucked", dy: -20.5 })); // tiny wobble: ignored
    scroll.update(makeHand({ thumb: "tucked", dy: 10 }));
    scroll.update(makeHand({ thumb: "spread", dy: 50 })); // pose ended: no scroll from this jump
    expect(pointer.log).toEqual(["scroll 40", "scroll -61"]);
  });
});

describe("HandController", () => {
  it("moves the pointer to the index fingertip while pointing", () => {
    const pointer = new FakePointer();
    const controller = new HandController(pointer);
    const hand = makeHand();
    const result = controller.update([hand], 1);
    expect(pointer.position).toEqual(hand[INDEX_TIP]);
    expect(result.state).toBe("");
  });

  it("reports the gesture state for the hand's colour", () => {
    const pointer = new FakePointer();
    const controller = new HandController(pointer);
    expect(controller.update([makeHand({ middleTip: { x: 410, y: 560 } })], 1).state).toBe("click");
    expect(controller.update([], 1.1).state).toBe("");
  });
});

describe("TwoHandGesture", () => {
  const fist = (dx: number) => makeHand({ curls: [1, 1, 1, 1], dx });
  const pinches = (log: string[]) => log.filter((l) => l.startsWith("pinch")).map((l) => Number(l.split(" ")[1].split("@")[0]));

  it("pinches apart (negative) when two fists pull apart, and together (positive) when they close in", () => {
    const pointer = new FakePointer();
    const two = new TwoHandGesture(pointer);
    for (const gap of [400, 400, 400, 420, 440]) two.update([fist(-gap / 2), fist(gap / 2)]);
    expect(two.active).toBe(true);
    expect(pinches(pointer.log).every((p) => p < 0)).toBe(true);
    expect(pinches(pointer.log).length).toBe(2);
    pointer.log = [];
    two.update([fist(-200), fist(200)]);
    expect(pinches(pointer.log)[0]).toBeGreaterThan(0);
  });

  it("does nothing with one fist, or two open hands", () => {
    const pointer = new FakePointer();
    const two = new TwoHandGesture(pointer);
    for (const gap of [300, 350, 400]) two.update([fist(-gap / 2), makeHand({ dx: gap / 2 })]);
    for (const gap of [300, 350, 400]) two.update([makeHand({ dx: -gap / 2 }), makeHand({ dx: gap / 2 })]);
    expect(two.active).toBe(false);
    expect(pointer.log).toEqual([]);
  });
});

describe("HandController with two hands", () => {
  it("pinches instead of dragging when both hands make fists", () => {
    const pointer = new FakePointer();
    const controller = new HandController(pointer);
    let state = "";
    for (const [i, gap] of [300, 300, 300, 330, 360].entries()) {
      state = controller.update([makeHand({ curls: [1, 1, 1, 1], dx: -gap / 2 }), makeHand({ curls: [1, 1, 1, 1], dx: gap / 2 })], i * 0.03).state;
    }
    expect(state).toBe("spread");
    expect(pointer.log.some((l) => l.startsWith("press"))).toBe(false);
    expect(pointer.log.some((l) => l.startsWith("pinch"))).toBe(true);
  });
});
