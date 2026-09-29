/**
 * The hand's "mouse" inside the web page.
 *
 * A web page can't move the computer's real cursor, so the hand drives a virtual one: it
 * sends ordinary pointer/mouse events (pointermove, pointerdown, click, contextmenu, …) to
 * whatever element is under it. Normal React handlers therefore work with the hand and the
 * real mouse alike.
 */
import type { Point } from "./landmarks";

/** What the gestures need from a pointer (see PageController, and fakes in tests). */
export interface Pointer {
  readonly position: Point | null;
  moveTo(point: Point): void;
  /** Press the left button (at `at`, or where the pointer is). */
  press(at?: Point): void;
  release(): void;
  click(button: "left" | "right", at?: Point): void;
  /** Scroll whatever is under the pointer. Positive = further down the page. */
  scroll(pixels: number): void;
  /**
   * Pinch at a point, like two fingers on a trackpad: negative = spreading apart, positive =
   * closing together. Sent as a ctrl+wheel event, the browser's usual signal for a pinch.
   */
  pinch(pixels: number, at: Point): void;
}

/** Ignore movements smaller than this many pixels, to stop the pointer trembling. */
const DEAD_ZONE = 3;
const DOUBLE_CLICK_TIME = 500; // ms between clicks that count as a double-click
const DOUBLE_CLICK_DISTANCE = 12; // px the pointer may drift between them
const POINTER_ID = 42; // our own id, so our events don't clash with the real mouse's

/** Elements that get a "hovered by the hand" highlight. */
const HOVERABLE = "button, a, input, select, textarea, label, [role='button'], [data-hand-target]";

export class PageController implements Pointer {
  position: Point | null = null;
  private held = false;
  private downTarget: Element | null = null;
  private hovered: Element | null = null;
  private highlighted: Element | null = null;
  private lastClick = { time: 0, point: { x: -1e9, y: -1e9 }, count: 0 };

  moveTo(point: Point): void {
    const x = Math.min(Math.max(point.x, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(point.y, 0), window.innerHeight - 1);
    if (this.position && Math.abs(x - this.position.x) < DEAD_ZONE && Math.abs(y - this.position.y) < DEAD_ZONE) {
      return;
    }
    this.position = { x, y };
    const target = elementAt(this.position);
    this.updateHover(target);
    if (target) {
      this.send(target, "pointermove", 0);
      this.send(target, "mousemove", 0);
    }
  }

  press(at?: Point): void {
    if (at) this.position = at;
    if (!this.position) return;
    const target = elementAt(this.position);
    if (!target) return;
    this.held = true;
    this.downTarget = target;
    this.send(target, "pointerdown", 0);
    this.send(target, "mousedown", 0);
    (target.closest("input, textarea, select, button, a, [tabindex]") as HTMLElement | null)?.focus();
  }

  release(): void {
    if (!this.held || !this.position) return;
    this.held = false;
    const target = elementAt(this.position) ?? this.downTarget;
    if (target) {
      this.send(target, "pointerup", 0);
      this.send(target, "mouseup", 0);
    }
    // Like a real mouse: a click happens if the button went down and up on the same element.
    if (target && this.downTarget && (target === this.downTarget || this.downTarget.contains(target))) {
      const count = this.clickCount();
      this.send(this.downTarget, "click", 0, count);
      if (count === 2) this.send(this.downTarget, "dblclick", 0, 2);
    }
    this.downTarget = null;
  }

  click(button: "left" | "right", at?: Point): void {
    if (button === "left") {
      this.press(at);
      this.release();
      return;
    }
    if (at) this.position = at;
    if (!this.position) return;
    const target = elementAt(this.position);
    if (!target) return;
    this.send(target, "pointerdown", 2);
    this.send(target, "mousedown", 2);
    this.send(target, "pointerup", 2);
    this.send(target, "mouseup", 2);
    this.send(target, "contextmenu", 2);
  }

  scroll(pixels: number): void {
    if (!pixels || !this.position) return;
    const target = elementAt(this.position);
    if (!target) return;
    // Send a wheel event first, like a mouse wheel — so things that react to the wheel
    // (e.g. the 3D studio's scatter) work with the hand too.
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: this.position.x,
      clientY: this.position.y,
      deltaY: pixels,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    });
    target.dispatchEvent(wheel);
    // A made-up wheel event doesn't scroll by itself, so scroll whatever is under the pointer.
    if (!wheel.defaultPrevented) scrollableAt(target).scrollBy({ top: pixels });
  }

  pinch(pixels: number, at: Point): void {
    if (!pixels) return;
    const target = elementAt(at);
    if (!target) return;
    target.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: at.x,
        clientY: at.y,
        deltaY: pixels,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        ctrlKey: true,
      }),
    );
  }

  private clickCount(): number {
    const now = performance.now();
    const { time, point, count } = this.lastClick;
    const here = this.position!;
    const again =
      now - time < DOUBLE_CLICK_TIME && Math.hypot(here.x - point.x, here.y - point.y) < DOUBLE_CLICK_DISTANCE;
    this.lastClick = { time: now, point: here, count: again ? count + 1 : 1 };
    return this.lastClick.count;
  }

  private updateHover(target: Element | null): void {
    if (target !== this.hovered) {
      if (this.hovered) {
        this.send(this.hovered, "pointerout", 0, 0, target);
        this.send(this.hovered, "mouseout", 0, 0, target);
      }
      if (target) {
        this.send(target, "pointerover", 0, 0, this.hovered);
        this.send(target, "mouseover", 0, 0, this.hovered);
      }
      this.hovered = target;
    }
    // CSS :hover can't be triggered from code, so highlight with an attribute instead.
    const highlight = target?.closest(HOVERABLE) ?? null;
    if (highlight !== this.highlighted) {
      this.highlighted?.removeAttribute("data-hand-hover");
      highlight?.setAttribute("data-hand-hover", "");
      this.highlighted = highlight;
    }
  }

  /** Remove the hover highlight (when the hand leaves or hand control is switched off). */
  clearHover(): void {
    if (this.held) this.release();
    this.updateHover(null);
    this.position = null;
  }

  private send(target: Element, type: string, button: number, detail = 0, related: Element | null = null): void {
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: this.position?.x ?? 0,
      clientY: this.position?.y ?? 0,
      button,
      buttons: this.held ? 1 : 0,
      detail,
      relatedTarget: related,
    };
    const event = type.startsWith("pointer")
      ? new PointerEvent(type, { ...init, pointerId: POINTER_ID, pointerType: "mouse", isPrimary: true })
      : new MouseEvent(type, init);
    target.dispatchEvent(event);
  }
}

/** The page element under a point, ignoring the hand overlay (which has pointer-events: none). */
function elementAt(point: Point): Element | null {
  return document.elementFromPoint(point.x, point.y);
}

/** The nearest element under the pointer that can scroll, or the page itself. */
function scrollableAt(element: Element | null): Element {
  for (let el = element; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return document.scrollingElement ?? document.documentElement;
}
