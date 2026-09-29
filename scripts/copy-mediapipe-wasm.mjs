// Copies MediaPipe's WebAssembly files into public/, so the app serves them itself
// (no CDN needed — it works on bad venue Wi-Fi). Runs automatically after `npm install`.
import { cpSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`Copied MediaPipe wasm files to ${to}`);
