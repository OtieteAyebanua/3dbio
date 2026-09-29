# multiHCI

A soft white 3D studio for exploring models made of parts — like a heart — with your hand
through the webcam. Point at a part to see its name, tap to select it, grab to turn the model,
and scatter the parts apart to see each one. A see-through "digital hand" shows where your
hand is, and the view leans as it moves (parallax), so the space feels deep.
Everything runs in the browser — no video leaves your computer.

Built with React + TypeScript (Vite), React Three Fiber (three.js) and MediaPipe hand tracking for the web.

## Run it

Needs Node.js 20+.

```bash
npm install      # also copies MediaPipe's engine files into public/
npm run dev      # then open the address it prints (http://localhost:5173)
```

The camera and hand control start as soon as the page opens — just allow the camera. A message
appears only while the camera starts or if it can't.

Other commands:

```bash
npm test         # unit tests for the gestures, smoothing and mapping
npm run build    # production build in dist/ — host it on any static web host (HTTPS needed for the camera)
npm run preview  # serve the production build locally
```

The hand-tracking model (`public/models/hand_landmarker.task`) and engine are served by the
app itself, so it works without internet once loaded — useful on bad venue Wi-Fi.

## Your model

Put your model at **`public/models/heart.glb`** — it loads when the page opens. Or drag any
`.glb` file onto the page to view it.

- **Format:** `.glb` (binary glTF). Most 3D tools can export it (Blender: File → Export → glTF 2.0, format "glTF Binary").
- **Parts:** each separate object in the file becomes a part, named after the object
  (`Left_Ventricle` shows as "Left Ventricle") — so name the objects in your 3D tool.
  Wrapper groups with a single child are skipped automatically.
- **Size:** the model is resized and centred to fit the platform, whatever units it uses.

## Gestures

| Gesture | In the studio | Mouse | Hand colour |
|---|---|---|---|
| Point | Highlight a part and show its name | Hover | White |
| Middle fingertip to thumb, then apart | Select the part (tap empty space to deselect) | Click | Yellow |
| Curl all four fingers (grab), move, open | Turn the model | Drag | Green |
| Four fingers straight, thumb tucked, move up/down | Scatter the parts apart / bring them together | Scroll wheel | Purple |
| Ring fingertip to thumb | Scatter everything at once / reassemble | Right-click | Orange |

Tips: face a window or lamp (dim light blurs fast movement), and move at a steady pace.

## What a web page can and can't do

A browser only lets a page control *itself* — it can't move your computer's real mouse or
click in other apps. So the hand drives a virtual pointer inside this page: it sends normal
pointer and mouse events (`pointermove`, `pointerdown`, `click`, `contextmenu`, …) to the
element under it, and scrolls whatever is under it. Ordinary React handlers work with the
hand and the real mouse alike.

## Code map

| File | What it does |
|---|---|
| `src/App.tsx` | The page: the studio, the model file (`DEFAULT_MODEL`, drag-and-drop) and the hand |
| `src/scene/Studio.tsx` | The 3D studio: colours, lighting, haze, platform, parallax; turning and scattering input |
| `src/scene/ExplodedModel.tsx` | Shows a model's parts: highlight, select, fade, scatter, idle spin |
| `src/scene/models/buildParts.ts` | Turns a loaded model file into parts: naming, fitting, scatter directions |
| `src/components/PartInfo.tsx` | Model title, selected-part card and gesture hints |
| `src/hand/useHandControl.ts` | The per-frame pipeline: camera → tracking → smoothing → gestures → drawing |
| `src/hand/handTracker.ts` | MediaPipe hand tracking (GPU, falls back to CPU) |
| `src/hand/smoothing.ts` | One Euro filter that steadies the points (`MIN_CUTOFF`, `BETA`) |
| `src/hand/mapping.ts` | Camera → page coordinates (`MARGIN`) |
| `src/hand/gestures.ts` | Click, right-click, grab-to-drag and scroll gestures and their thresholds |
| `src/hand/pageController.ts` | The virtual pointer: hover highlight, clicks, drags and scrolling via DOM events |
| `src/hand/handRenderer.ts` | Draws the see-through hand (`HAND_SCALE`, `STATE_COLORS`) |
| `src/hand/landmarks.ts` | MediaPipe's 21 hand-point numbers and small geometry helpers |
| `scripts/copy-mediapipe-wasm.mjs` | Copies MediaPipe's engine files into `public/` after `npm install` |

## Known limitations

- Only controls this web page (see above).
- Fast hand movements can lose tracking (motion blur, 30 FPS webcams). Good lighting helps.
- If tracking drops during a drag, the drag is released.

## The guide (DeepSeek)

The panel at the top right explains the model on show — or the selected part — with what it
is, what it does and three fun facts, written by DeepSeek. **Voice on** reads it aloud with the
browser's built-in voice.

- The DeepSeek key lives in `.env` as `DEEPSEEK_API_KEY` and is only read by the dev server
  ([server/explainApi.ts](server/explainApi.ts), endpoint `POST /api/explain`) — it never reaches the page.
- It works with `npm run dev` and `npm run preview`. A static host (just the `dist` folder)
  has no server, so the guide there would need its own small back end.
