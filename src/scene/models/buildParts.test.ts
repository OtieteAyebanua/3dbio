import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildPartModel, prettyName } from "./buildParts";

function mesh(name: string, position: [number, number, number], size = 10) {
  const m = new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial());
  m.name = name;
  m.position.set(...position);
  return m;
}

/** A model in centimetres, far from the origin, wrapped in two single-child groups. */
function testModel() {
  const inner = new Group();
  inner.add(mesh("Left_Ventricle", [60, -40, 500]), mesh("rightAtrium", [-60, 40, 500]), mesh("Aorta.001", [0, 120, 500]));
  const wrapper = new Group();
  wrapper.add(inner);
  const root = new Group();
  root.add(wrapper);
  return root;
}

describe("prettyName", () => {
  it("turns object names from 3D files into readable names", () => {
    expect(prettyName("Left_Ventricle.001", 0)).toBe("Left Ventricle");
    expect(prettyName("rightAtrium", 0)).toBe("Right Atrium");
    expect(prettyName("", 2)).toBe("Part 3");
  });
});

describe("buildPartModel", () => {
  const model = buildPartModel(testModel(), "Heart");

  it("finds the parts inside wrapper groups and names them", () => {
    expect(model.parts.map((p) => p.name)).toEqual(["Left Ventricle", "Right Atrium", "Aorta"]);
  });

  it("resizes and centres the model, whatever units it was made in", () => {
    const box = new Box3();
    for (const p of model.parts) box.expandByObject(p.object);
    const size = box.getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(2.2);
    const middle = box.getCenter(new Vector3());
    expect(middle.length()).toBeLessThan(1e-6);
  });

  it("scatters parts mostly sideways — never far down (into the platform) or straight up", () => {
    for (const p of model.parts) {
      const [x, y, z] = p.explode;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      expect(y).toBeGreaterThanOrEqual(-0.25 - 1e-9);
      expect(y).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const aorta = model.parts[2]; // directly above the centre: nudged aside
    expect(Math.hypot(aorta.explode[0], aorta.explode[2])).toBeGreaterThan(0.8);
  });

  it("gives every part its own materials", () => {
    const [a, b] = model.parts.map((p) => (p.object.children[0] as Mesh).material);
    expect(a).not.toBe(b);
  });
});
