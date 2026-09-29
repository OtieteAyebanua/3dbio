// Copies the WebAssembly files the app needs into public/, so the app serves them itself
// (no CDN needed — it works on bad venue Wi-Fi). Runs automatically after `npm install`.
//   - MediaPipe's hand tracking
//   - the Draco decoder, which unpacks the compressed 3D models
import { cpSync, mkdirSync } from "node:fs";

const copies = [
  ["node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm"],
  ["node_modules/three/examples/jsm/libs/draco/gltf", "public/draco"],
];

for (const [from, to] of copies) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`Copied ${from} to ${to}`);
}
