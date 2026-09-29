/**
 * Draws the "digital hand" over the page as a lit 3D hand, on a full-window canvas.
 *
 * The hand is built every frame from MediaPipe's 21 points (with their depth), seen from your side:
 * the back of the hand, reaching into the scene. Each bone is a
 * rounded, tapering tube, and the tubes are blended smoothly into one another — so the palm is
 * one fleshy shape, the skin webs between the fingers, and the joints bend without seams.
 * It's drawn by a small shader that traces the shape pixel by pixel ("ray marching"), with
 * skin-like lighting: light that seeps through at the edges, a soft sheen, and shading in the
 * creases. Fingers pointing towards the screen look shorter, because they are.
 */
import {
  Color,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import type { HandState } from "./gestures";
import { handSize, INDEX_TIP, type Hand, type Point } from "./landmarks";

/**
 * How big the hand is drawn (1 = full size). It shrinks towards the index fingertip, so the
 * fingertip — and the pointer on it — stays in the same place.
 */
export const HAND_SCALE = 0.35;

/** The skin colour of the hand. */
const SKIN = "#e3b598";

/** The hand is tinted this colour for each gesture state, so you can see what it's doing. */
export const STATE_COLORS: Record<HandState, string> = {
  "": SKIN, // pointing
  click: "#ffd84a", // middle finger touching: left click when you let go
  right: "#ff9a3c", // ring finger touching: right click
  drag: "#5fe07c", // grabbing: dragging
  scroll: "#a47cff", // four fingers straight, thumb tucked: scrolling
  spread: "#4fcfc0", // both hands grabbing: pull apart to scatter, push together to assemble
};
/** How strongly a gesture colour tints the skin (0–1). */
const TINT = 0.5;

/** Thickness (radius, as a fraction of hand size) at each of the 21 points. */
const RADII = [
  0.2, // wrist
  0.15, 0.12, 0.1, 0.085, // thumb: base, knuckle, joint, tip
  0.105, 0.09, 0.08, 0.07, // index
  0.11, 0.093, 0.082, 0.072, // middle
  0.102, 0.087, 0.077, 0.068, // ring
  0.09, 0.075, 0.066, 0.058, // pinky
];

const vertexShader = /* glsl */ `
  varying vec2 vPixel;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPixel = world.xy;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uP[21];     // the 21 points (pixels; y up, +z towards the viewer)
  uniform float uR[21];    // thickness at each point (pixels)
  uniform float uSize;     // hand size (pixels)
  uniform vec2 uDepth;     // nearest and farthest z the hand can reach
  uniform vec3 uColor;     // skin colour (linear)
  varying vec2 vPixel;

  // A rounded tube from a to b, radius ra at a narrowing to rb at b.
  float tube(vec3 p, int a, int b) {
    vec3 pa = p - uP[a], ba = uP[b] - uP[a];
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    return length(pa - ba * h) - mix(uR[a], uR[b], h);
  }
  // Smoothly blended union: k is how wide the blend (the "webbing") is.
  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }
  float finger(vec3 p, int a, float k) {
    return smin(smin(tube(p, a, a + 1), tube(p, a + 1, a + 2), k), tube(p, a + 2, a + 3), k);
  }

  float hand(vec3 p) {
    float joint = 0.05 * uSize, web = 0.1 * uSize, flesh = 0.28 * uSize;
    // The palm: the bones from the wrist to each knuckle, blended into one fleshy shape,
    // plus the start of the forearm.
    vec3 forearm = uP[0] + (uP[0] - uP[9]) * 0.45;
    float palm = length(p - uP[0]) - uR[0];
    palm = smin(palm, length(p - forearm) - uR[0] * 0.95, flesh);
    palm = smin(palm, tube(p, 0, 5), flesh);
    palm = smin(palm, tube(p, 0, 9), flesh);
    palm = smin(palm, tube(p, 0, 13), flesh);
    palm = smin(palm, tube(p, 0, 17), flesh);
    palm = smin(palm, tube(p, 0, 1), flesh);
    palm = smin(palm, tube(p, 1, 5), flesh * 0.6); // the fleshy base of the thumb
    // Fingers: jointed tubes, webbed onto the palm.
    float d = smin(palm, finger(p, 1, joint), web);
    d = smin(d, finger(p, 5, joint), web);
    d = smin(d, finger(p, 9, joint), web);
    d = smin(d, finger(p, 13, joint), web);
    d = smin(d, finger(p, 17, joint), web);
    return d;
  }

  vec3 normalAt(vec3 p) {
    float h = 0.01 * uSize;
    vec2 k = vec2(1.0, -1.0);
    return normalize(k.xyy * hand(p + k.xyy * h) + k.yyx * hand(p + k.yyx * h) +
                     k.yxy * hand(p + k.yxy * h) + k.xxx * hand(p + k.xxx * h));
  }

  // Darker where the surface is tucked in (between fingers, in the palm's creases).
  float occlusion(vec3 p, vec3 n) {
    float step = 0.06 * uSize, shade = 0.0;
    for (int i = 1; i <= 4; i++) {
      float along = step * float(i);
      shade += (along - hand(p + n * along)) / along / float(i);
    }
    return clamp(1.0 - shade * 0.5, 0.0, 1.0);
  }

  void main() {
    // Look straight into the page from in front of the hand.
    vec3 p = vec3(vPixel, uDepth.y);
    float travelled = 0.0, closest = 1e9;
    vec3 closestPoint = p;
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      float d = hand(p);
      if (d < closest) { closest = d; closestPoint = p; }
      if (d < 0.25) { hit = true; break; }
      p.z -= d;
      if (p.z < uDepth.x) break;
    }
    // Smooth edges: pixels that only just miss are partly covered.
    float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.2, closest);
    if (alpha <= 0.0) discard;
    if (!hit) p = closestPoint;
    // Fade out along the forearm, so the hand doesn't end in a hard edge at the wrist.
    vec3 along = uP[0] - uP[9];
    float beyondWrist = dot(p - uP[0], along) / dot(along, along);
    alpha *= 1.0 - smoothstep(0.05, 0.4, beyondWrist);
    if (alpha <= 0.0) discard;

    vec3 n = normalAt(p);
    vec3 view = vec3(0.0, 0.0, 1.0);
    vec3 light = normalize(vec3(-0.45, 0.65, 0.75));
    float facing = dot(n, light);
    float diffuse = max(facing, 0.0);
    // Skin lets light through: the lit side wraps round, reddening where it fades into shadow.
    float wrapped = max((facing + 0.45) / 1.45, 0.0);
    vec3 scatter = vec3(1.0, 0.38, 0.28) * (wrapped - diffuse) * 0.55;
    float sky = n.y * 0.5 + 0.5;
    vec3 ambient = mix(vec3(0.42, 0.36, 0.33), vec3(0.62, 0.62, 0.66), sky) * 0.55;
    float ao = occlusion(p, n);

    vec3 color = uColor * (ambient * ao + diffuse * vec3(1.0, 0.96, 0.9) * 0.85 + scatter);
    // A soft sheen, and a gentle glow at the edges as light skims the skin.
    vec3 half_ = normalize(light + view);
    color += pow(max(dot(n, half_), 0.0), 28.0) * 0.14 * ao;
    color += pow(1.0 - max(dot(n, view), 0.0), 3.0) * vec3(1.0, 0.9, 0.85) * 0.18 * ao;

    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), alpha);
  }
`;

/** One hand: a flat card around the hand, whose shader draws the 3D hand inside it. */
class HandMesh {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  private points = Array.from({ length: 21 }, () => new Vector3());
  private radii = new Array<number>(21).fill(0);
  private color = new Color();

  constructor() {
    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uP: { value: this.points },
          uR: { value: this.radii },
          uSize: { value: 1 },
          uDepth: { value: [0, 0] },
          uColor: { value: this.color },
        },
      }),
    );
    this.mesh.frustumCulled = false;
  }

  /** Pose the hand from 21 points in page pixels (y down, z away from the camera). */
  update(hand: Hand, tint: string): void {
    const size = handSize(hand);
    this.mesh.visible = size >= 1;
    if (!this.mesh.visible) return;

    // Page pixels → 3D: y up, and +z towards the viewer. The viewer is you, behind your hand
    // (not the camera in front of it): parts nearer the camera are further into the screen,
    // so you see the back of the hand reaching into the scene, as you see your own hand.
    hand.forEach((p, i) => {
      this.points[i].set(p.x, -p.y, p.z ?? 0);
      this.radii[i] = RADII[i] * size;
    });
    this.color.set(SKIN).lerp(new Color(tint), tint === SKIN ? 0 : TINT);

    // Size the card to cover the hand (with room for its thickness and the forearm stub).
    const pad = size * 0.7;
    let [minX, maxX, minY, maxY, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    this.mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, 0);
    this.mesh.scale.set(maxX - minX + pad * 2, maxY - minY + pad * 2, 1);

    const u = this.mesh.material.uniforms;
    u.uSize.value = size;
    u.uDepth.value = [minZ - pad, maxZ + pad];
  }
}

export class HandRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  // Looks straight at the page, one unit per page pixel, so the hand sits exactly where it's tracked.
  private camera = new OrthographicCamera(0, 1, 0, -1, -10000, 10000);
  private hands = [new HandMesh(), new HandMesh()];
  private ring: Mesh;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    for (const hand of this.hands) this.scene.add(hand.mesh);

    // A small ring marks exactly where clicks land; drawn on top of the hand.
    this.ring = new Mesh(
      new RingGeometry(5, 7.5, 32),
      new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.ring.renderOrder = 1;
    this.scene.add(this.ring);
  }

  /** `hands` in page pixels; the first one is the controlling hand (tinted by `state`). */
  draw(hands: Hand[], state: HandState, pointer: Point | null): void {
    this.resize();
    this.hands.forEach((mesh, i) => {
      const hand = hands[i];
      if (!hand) {
        mesh.mesh.visible = false;
        return;
      }
      // Shrink the hand (including its depth) towards the index fingertip.
      const tip = hand[INDEX_TIP];
      const small = hand.map((p) => ({
        x: tip.x + (p.x - tip.x) * HAND_SCALE,
        y: tip.y + (p.y - tip.y) * HAND_SCALE,
        z: ((p.z ?? 0) - (tip.z ?? 0)) * HAND_SCALE,
      }));
      // The first hand shows what it's doing; both do while they pinch together.
      mesh.update(small, i === 0 || state === "spread" ? STATE_COLORS[state] : SKIN);
    });

    this.ring.visible = pointer !== null;
    if (pointer) this.ring.position.set(pointer.x, -pointer.y, 0);
    this.renderer.render(this.scene, this.camera);
  }

  clear(): void {
    for (const hand of this.hands) hand.mesh.visible = false;
    this.ring.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  /** Keep the drawing the size of the window, at the screen's pixel density (sharp on Retina). */
  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    Object.assign(this.camera, { left: 0, right: width, top: 0, bottom: -height });
    this.camera.updateProjectionMatrix();
  }
}
