/**
 * Turns a loaded 3D model (e.g. from a .glb file) into separate parts.
 *
 * Each separate object in the file becomes a part, named after the object's name in the file.
 * Wrapper groups that contain only one child are skipped, so a file with a single top-level
 * group still splits into the objects inside it. The model is resized and centred to fit.
 */
import { Box3, Mesh, Object3D, Sphere, Vector3, type Material } from "three";
import { clone as cloneWithRig } from "three/addons/utils/SkeletonUtils.js";
import type { ModelPart, PartModel, Vec3 } from "./types";

/** The model is scaled so its largest side is this many metres. */
const FIT_SIZE = 2.2;
/** How far parts travel when fully scattered, as a fraction of the model's size. */
const EXPLODE_FRACTION = 0.38;
/**
 * Parts scatter mostly sideways: only a little down (so they don't sink into the platform)
 * and not too far up (so they stay in view).
 */
const MAX_DOWNWARD = -0.25;
const MAX_UPWARD = 0.5;

/** "Left_Ventricle.001" → "Left Ventricle" (three.js may already have made that "Left_Ventricle001") */
export function prettyName(raw: string, index: number): string {
  const cleaned = raw
    .replace(/\.\d+$/, "")
    .replace(/(\D)\d{3}$/, "$1")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!cleaned) return `Part ${index + 1}`;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Whether an object (or anything inside it) has something to see. */
function hasMesh(object: Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if (child instanceof Mesh) found = true;
  });
  return found;
}

/** The objects that count as the model's parts (empty ones, like markers, are skipped). */
function findParts(root: Object3D): Object3D[] {
  let node = root;
  while (node.children.length === 1) node = node.children[0];
  const parts = node.children.filter(hasMesh);
  return parts.length ? parts : [node];
}

/**
 * `labels` gives friendlier names for parts, by object name (otherwise names are tidied up).
 */
export function buildPartModel(scene: Object3D, name: string, labels: Record<string, string> = {}): PartModel {
  // Our own copy (rig-aware, so animated parts like a robot arm stay attached to their bones).
  const source = cloneWithRig(scene);
  source.updateMatrixWorld(true);

  // Fit: scale so the model's largest side is FIT_SIZE, centred on the origin.
  const box = new Box3().setFromObject(source);
  const size = box.getSize(new Vector3());
  const scale = FIT_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
  const middle = box.getCenter(new Vector3());

  const parts: ModelPart[] = findParts(source).map((original, index) => {
    // Bake the part's full transform (including its parents') and the fit into a wrapper,
    // so every part sits exactly where it was in the model, just resized and centred.
    // The copy is ours, so the part can be moved straight into its wrapper (no second copy,
    // which would break rigged parts).
    const object = original;
    const world = original.matrixWorld.clone();
    world.decompose(object.position, object.quaternion, object.scale);
    const fitted = new Object3D();
    fitted.add(object);
    fitted.scale.setScalar(scale);
    fitted.position.copy(middle).multiplyScalar(-scale);
    fitted.updateMatrixWorld(true);

    // Each part gets its own materials, so fading or highlighting one doesn't affect the rest.
    fitted.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = Array.isArray(child.material)
          ? child.material.map((m: Material) => m.clone())
          : child.material.clone();
      }
    });

    const bounds = new Box3().setFromObject(fitted);
    const center = bounds.getCenter(new Vector3());
    // Scatter outward from the model's centre (up if the part sits right at the centre),
    // mostly sideways.
    const outward = center.lengthSq() > 1e-6 ? center.clone().normalize() : new Vector3(0, 1, 0);
    const y = Math.min(Math.max(outward.y, MAX_DOWNWARD), MAX_UPWARD);
    // The rest of the movement goes sideways, in the part's own horizontal direction
    // (a part straight above or below the centre gets nudged to the side).
    const sideways = Math.hypot(outward.x, outward.z);
    const across = Math.sqrt(1 - y * y);
    const direction =
      sideways > 1e-3
        ? new Vector3((outward.x / sideways) * across, y, (outward.z / sideways) * across)
        : new Vector3(across, y, 0);

    return {
      id: `${index}-${original.name || "part"}`,
      name: labels[original.name] ?? prettyName(original.name, index),
      object: fitted,
      center: center.toArray() as Vec3,
      radius: bounds.getBoundingSphere(new Sphere()).radius,
      explode: direction.toArray() as Vec3,
    };
  });

  return { name, parts, explodeDistance: FIT_SIZE * EXPLODE_FRACTION };
}
