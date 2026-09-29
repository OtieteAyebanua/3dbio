/**
 * Shows a model made of parts that can be highlighted, selected and scattered apart.
 * Works with the hand (via the page's virtual pointer) and the mouse alike.
 */
import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import {
  Color,
  MathUtils,
  Mesh,
  Quaternion,
  Vector3,
  type Group,
  type Material,
  type MeshStandardMaterial,
} from "three";
import type { ModelPart, PartModel } from "./models/types";

/** How the model is being turned, shared with the studio (which handles the dragging). */
export interface Turn {
  rotation: Quaternion; // the model's target orientation (any way round)
  lastTouched: number; // performance.now() in seconds; the model spins on its own after a while untouched
}

/** Height (metres) the model floats at. */
export const MODEL_Y = 1.55;
/** Seconds without interaction before the model starts slowly spinning on its own. */
const IDLE_SPIN_AFTER = 4;
const IDLE_SPIN_SPEED = 0.15; // radians per second
const UP = new Vector3(0, 1, 0);
/** A press that moved further than this (pixels) was a drag to turn, not a click. */
const CLICK_TOLERANCE = 8;
/** The soft glow added to a hovered or selected part. */
const HIGHLIGHT = new Color("#ffe3bd");
/** Opacity of the other parts while one is selected: hidden, so the part can be inspected on its own. */
const FADED_OPACITY = 0;

type Look = "normal" | "hovered" | "selected" | "faded";

interface Props {
  model: PartModel;
  /** 0 = assembled, 1 = fully scattered. The parts ease towards it. */
  explode: number;
  hovered: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  turn: RefObject<Turn>;
}

export function ExplodedModel({ model, explode, hovered, selected, onHover, onSelect, turn }: Props) {
  const group = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const explodeNow = useRef(0);
  // The point the model turns around (in the model's own coordinates): its centre, or the
  // selected part's centre, so a selected part turns in place just like the whole model does.
  const pivot = useRef(new Vector3());
  const pivotGoal = useRef(new Vector3());
  const idleSpin = useRef(0); // extra spin added while untouched, on top of the user's turning
  const goal = useRef(new Quaternion());

  useFrame(({ clock }, delta) => {
    explodeNow.current = MathUtils.damp(explodeNow.current, explode, 3, delta);
    const g = group.current!;
    const target = turn.current;
    if (performance.now() / 1000 - target.lastTouched > IDLE_SPIN_AFTER) {
      idleSpin.current += IDLE_SPIN_SPEED * delta;
    }
    goal.current.setFromAxisAngle(UP, idleSpin.current).multiply(target.rotation);
    g.quaternion.slerp(goal.current, 1 - Math.exp(-6 * delta)); // ease towards it
    g.position.y = MODEL_Y + Math.sin(clock.elapsedTime * 0.8) * 0.035; // a gentle float

    // A selected part glides to the centre stage (where the whole model normally floats) and
    // turns around its own centre there; deselecting brings the whole model back.
    const part = selected ? model.parts.find((p) => p.id === selected) : undefined;
    if (part) {
      const out = explodeNow.current * model.explodeDistance;
      pivotGoal.current.fromArray(part.center).addScaledVector(new Vector3().fromArray(part.explode), out);
    } else {
      pivotGoal.current.set(0, 0, 0);
    }
    pivot.current.lerp(pivotGoal.current, 1 - Math.exp(-5 * delta));
    inner.current!.position.copy(pivot.current).negate();
  });

  const lookOf = (id: string): Look =>
    selected ? (id === selected ? "selected" : "faded") : id === hovered ? "hovered" : "normal";

  return (
    <group ref={group} position-y={MODEL_Y}>
      <group ref={inner}>
        {model.parts.map((part) => (
          <Part
            key={part.id}
            part={part}
            distance={model.explodeDistance}
            explode={explodeNow}
            look={lookOf(part.id)}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </group>
    </group>
  );
}

/** A part's materials, with their original look so highlighting/fading can return to it. */
interface MaterialState {
  material: MeshStandardMaterial;
  opacity: number;
  emissive: Color | null;
  emissiveIntensity: number;
}

function Part({
  part,
  distance,
  explode,
  look,
  onHover,
  onSelect,
}: {
  part: ModelPart;
  distance: number;
  explode: RefObject<number>;
  look: Look;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const group = useRef<Group>(null);
  // The part's materials and their original look; gathered on the first frame.
  const materials = useRef<MaterialState[] | null>(null);

  useFrame((_, delta) => {
    materials.current ??= collectMaterials(part);
    // Slide out along the part's own direction as the model scatters.
    const e = explode.current * distance;
    group.current!.position.set(part.explode[0] * e, part.explode[1] * e, part.explode[2] * e);

    const glow = look === "hovered" ? 0.4 : look === "selected" ? 0.22 : 0;
    const fade = look === "faded" ? FADED_OPACITY : 1;
    for (const s of materials.current) {
      const m = s.material;
      m.opacity = MathUtils.damp(m.opacity, s.opacity * fade, 6, delta);
      m.depthWrite = m.opacity > 0.9; // faded parts shouldn't hide the ones behind them
      m.visible = m.opacity > 0.01;
      if (s.emissive) {
        m.emissive.copy(glow > 0 ? HIGHLIGHT : s.emissive);
        m.emissiveIntensity = MathUtils.damp(m.emissiveIntensity, glow > 0 ? glow : s.emissiveIntensity, 8, delta);
      }
    }
  });

  // While another part is being inspected, hidden parts have no handlers, so they can't be
  // pointed at, and a tap on the empty space around the inspected part counts as empty.
  const hidden = look === "faded";

  return (
    <group
      ref={group}
      onPointerOver={
        hidden
          ? undefined
          : (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(part.id);
            }
      }
      onPointerOut={hidden ? undefined : () => onHover(null)}
      onClick={
        hidden
          ? undefined
          : (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              if (e.delta <= CLICK_TOLERANCE) onSelect(part.id); // ignore the end of a drag-to-turn
            }
      }
    >
      <primitive object={part.object} />
      {(look === "hovered" || look === "selected") && (
        // zIndexRange keeps labels below the hand overlay; pointerEvents none keeps them from blocking picks.
        <Html position={part.center} center zIndexRange={[100, 0]} pointerEvents="none">
          <div className="part-label">{part.name}</div>
        </Html>
      )}
    </group>
  );
}

/** Every material in a part, made fadeable, with its original look remembered. */
function collectMaterials(part: ModelPart): MaterialState[] {
  const found: MaterialState[] = [];
  part.object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    for (const m of ([] as Material[]).concat(child.material)) {
      const material = m as MeshStandardMaterial;
      material.transparent = true;
      found.push({
        material,
        opacity: material.opacity,
        emissive: material.emissive ? material.emissive.clone() : null,
        emissiveIntensity: material.emissiveIntensity ?? 0,
      });
    }
  });
  return found;
}
