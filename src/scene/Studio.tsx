/**
 * A soft, warm-white round studio with a model floating in the middle.
 *
 * The floor's rings and the far walls fade into a warm haze, so the space feels open and deep.
 * The view leans a little towards the pointer (the hand or the mouse) — parallax.
 *
 * Interaction (hand gesture / mouse):
 *   point / hover            highlight a part and show its name
 *   middle-finger tap / click select a part and zoom in on it (tap empty space to zoom back out)
 *   grab and move / drag      turn the model
 *   four-finger up-down / wheel  scatter the parts apart or bring them together;
 *                                while a part is selected, zoom in or out on it
 *   ring finger / right-click scatter everything at once, or reassemble
 *   both hands grab, pull apart / push together (or trackpad pinch)
 *                                scatter / assemble; while a part is selected, zoom in / out
 */
import { ContactShadows, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { ExplodedModel, MODEL_Y, type Turn } from "./ExplodedModel";
import { buildPartModel } from "./models/buildParts";
import type { ModelPart, PartModel } from "./models/types";

// Warm off-whites (never pure #fff, which looks harsh on screen).
const HAZE = "#e9e5de"; // background and fog: the distance dissolves into this
const FLOOR = "#ebe6de";
const RING = "#dcd5ca";
const PEDESTAL = "#f3f0ea";
const RING_RADII = [2.4, 3.6, 5.2, 7.2, 9.8, 13, 17, 22];

/** How far the view leans towards the pointer, and how quickly it follows. */
const PARALLAX = { x: 0.3, y: 0.15, smoothing: 2 };
const CAMERA = { x: 0, y: 1.75, z: 5.4 };

/** Turning sensitivity (radians per pixel dragged). The model turns freely all the way round, both ways. */
const TURN_SPEED = 0.008;
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
/** Scatter change per wheel/scroll pixel. */
const SCATTER_SPEED = 0.0018;
/** Zooming on a selected part: change per wheel/scroll pixel, and the limits (1 = the part fills the view). */
const ZOOM_SPEED = 0.003;
const ZOOM_RANGE = [0.4, 3];
/** The part never gets closer than this to the camera, however small it is (metres). */
const MIN_FOCUS_RADIUS = 0.05;
/** The direction the camera looks at a selected part from: from the front, slightly above. */
const FOCUS_VIEW = new Vector3(0, 0.12, 1).normalize();

function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[60, 96]} />
        <meshStandardMaterial color={FLOOR} roughness={0.95} />
      </mesh>
      {/* Faint rings for a sense of scale, fading into the haze */}
      {RING_RADII.map((r) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position-y={0.003}>
          <ringGeometry args={[r, r + 0.025, 128]} />
          <meshStandardMaterial color={RING} roughness={1} />
        </mesh>
      ))}
      {/* A low round platform under the model */}
      <mesh position-y={0.15}>
        <cylinderGeometry args={[1.35, 1.45, 0.3, 96]} />
        <meshStandardMaterial color={PEDESTAL} roughness={0.8} />
      </mesh>
      <ContactShadows position-y={0.301} scale={3.2} far={MODEL_Y + 1} blur={2.6} opacity={0.32} color="#6b5f52" />
    </group>
  );
}

/**
 * Moves the camera. Normally it looks at the whole model, leaning a little towards the pointer.
 * With a part selected it flies in close to that part (and follows it as the model turns or
 * scatters), at the chosen zoom.
 */
function CameraRig({ focus, zoom }: { focus: ModelPart | null; zoom: number }) {
  const look = useRef(new Vector3(0, MODEL_Y - 0.1, 0));
  const goal = useRef({ position: new Vector3(), look: new Vector3() });

  useFrame(({ camera, pointer, clock }, delta) => {
    const { position, look: lookGoal } = goal.current;
    const holder = focus?.object.parent; // the part's group, which moves as the model turns and scatters
    if (focus && holder) {
      lookGoal.fromArray(focus.center);
      holder.localToWorld(lookGoal);
      // Far enough back that the whole part fits in view, then zoomed.
      const halfFov = MathUtils.degToRad((camera as PerspectiveCamera).fov / 2);
      const distance = (Math.max(focus.radius, MIN_FOCUS_RADIUS) / Math.sin(halfFov)) * 1.25 / zoom;
      position.copy(FOCUS_VIEW).multiplyScalar(distance).add(lookGoal);
      position.x += pointer.x * distance * 0.08;
      position.y += pointer.y * distance * 0.04;
    } else {
      const drift = Math.sin(clock.elapsedTime * 0.15) * 0.06;
      position.set(CAMERA.x + pointer.x * PARALLAX.x + drift, CAMERA.y + pointer.y * PARALLAX.y, CAMERA.z);
      lookGoal.set(0, MODEL_Y - 0.1, 0);
    }
    const speed = focus ? 3 : PARALLAX.smoothing;
    camera.position.lerp(position, 1 - Math.exp(-speed * delta));
    look.current.lerp(lookGoal, 1 - Math.exp(-speed * 1.5 * delta));
    camera.lookAt(look.current);
  });
  return null;
}

/** Loads a model file (.glb) and shows it as separate parts. */
function LoadedModel({
  url,
  name,
  onLoaded,
  ...view
}: {
  url: string;
  name: string;
  onLoaded: (model: PartModel) => void;
  explode: number;
  hovered: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  turn: RefObject<Turn>;
}) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => buildPartModel(scene, name), [scene, name]);
  useEffect(() => onLoaded(model), [model, onLoaded]);
  return <ExplodedModel model={model} {...view} />;
}

/** Catches a model that fails to load (missing or broken file) instead of crashing the page. */
class ModelErrorBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  /** Address of the model file (.glb) to show. */
  modelUrl: string;
  modelName: string;
  /** The model once it has loaded (to find the selected part to zoom in on). */
  model: PartModel | null;
  onModelLoaded: (model: PartModel) => void;
  onModelError: (message: string) => void;
  explode: number;
  setExplode: (update: (value: number) => number) => void;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
}

export function Studio({
  modelUrl,
  modelName,
  model,
  onModelLoaded,
  onModelError,
  explode,
  setExplode,
  hovered,
  setHovered,
  selected,
  setSelected,
}: Props) {
  const turn = useRef<Turn>({ rotation: new Quaternion(), lastTouched: 0 });
  const dragDistance = useRef(0);
  const focus = model?.parts.find((p) => p.id === selected) ?? null;
  // Zoom belongs to the part it was set on, so each newly selected part starts fitted to the view.
  const [zoomState, setZoomState] = useState({ part: "", zoom: 1 });
  const zoom = focus && zoomState.part === focus.id ? zoomState.zoom : 1;
  const seconds = () => performance.now() / 1000;

  // Drag anywhere to turn the model (a hand grab-and-move arrives as a drag too).
  const startTurn = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    const last = { ...start };
    dragDistance.current = 0;
    const step = new Quaternion();
    const move = (e: PointerEvent) => {
      dragDistance.current = Math.max(dragDistance.current, Math.hypot(e.clientX - start.x, e.clientY - start.y));
      // Sideways drags spin the model around the vertical axis, up/down drags tip it over,
      // both relative to the screen, so it keeps turning the same way whichever side is up.
      const rotation = turn.current.rotation;
      rotation.premultiply(step.setFromAxisAngle(UP, (e.clientX - last.x) * TURN_SPEED));
      rotation.premultiply(step.setFromAxisAngle(RIGHT, (e.clientY - last.y) * TURN_SPEED));
      rotation.normalize();
      last.x = e.clientX;
      last.y = e.clientY;
      turn.current.lastTouched = seconds();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    turn.current.lastTouched = seconds();
  };

  return (
    <Canvas
      className="studio"
      dpr={[1, 2]}
      camera={{ position: [CAMERA.x, CAMERA.y, CAMERA.z], fov: 42, near: 0.01, far: 120 }}
      onPointerDown={startTurn}
      onWheel={(e) => {
        // A pinch (both hands, or a trackpad) arrives as ctrl+wheel with negative = apart.
        // Zooming already goes the right way; scattering flips so that apart = scatter.
        if (focus) {
          const next = MathUtils.clamp(zoom * Math.exp(-e.deltaY * ZOOM_SPEED), ZOOM_RANGE[0], ZOOM_RANGE[1]);
          setZoomState({ part: focus.id, zoom: next });
        } else {
          const amount = e.ctrlKey ? -e.deltaY : e.deltaY;
          setExplode((v) => MathUtils.clamp(v + amount * SCATTER_SPEED, 0, 1));
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setExplode((v) => (v < 0.5 ? 1 : 0));
      }}
      // A click on empty space (not the end of a drag) deselects.
      onPointerMissed={(e) => {
        if (e.type === "click" && dragDistance.current <= 8) setSelected(null);
      }}
    >
      <color attach="background" args={[HAZE]} />
      {/* Fog is what makes the space feel deep: the floor and distance dissolve into the haze */}
      <fog attach="fog" args={[HAZE, 9, 34]} />

      {/* Soft, even light from above and bounced off the floor, plus a key and a rim light for form */}
      <hemisphereLight args={["#fffdf9", "#ebe4d9", 1.3]} />
      <ambientLight color="#fff8ee" intensity={0.3} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} color="#fff6ea" />
      <directionalLight position={[-3, 3, -4]} intensity={0.9} color="#fff1e0" />

      <Floor />
      {/* A new file gets a fresh boundary (key), so one bad file doesn't block the next */}
      <ModelErrorBoundary key={modelUrl} onError={onModelError}>
        <Suspense fallback={null}>
          <LoadedModel
            url={modelUrl}
            name={modelName}
            onLoaded={onModelLoaded}
            explode={explode}
            hovered={hovered}
            selected={selected}
            onHover={setHovered}
            onSelect={setSelected}
            turn={turn}
          />
        </Suspense>
      </ModelErrorBoundary>
      <CameraRig focus={focus} zoom={zoom} />
    </Canvas>
  );
}
