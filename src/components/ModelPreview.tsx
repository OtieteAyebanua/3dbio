/**
 * A small live 3D preview of a model, slowly turning — for the landing page's cards.
 * Loading it here also warms the cache, so the explorer opens faster.
 */
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ModelLoader } from "../scene/ModelLoader";
import { Suspense, useMemo, useRef } from "react";
import { Box3, Vector3, type Group } from "three";
import { clone as cloneWithRig } from "three/addons/utils/SkeletonUtils.js";

const DRACO_DECODER = `${import.meta.env.BASE_URL}draco/`;
/** The model is scaled so its largest side is this big. */
const SIZE = 2.3;

function Spinning({ url, active, tilt }: { url: string; active: boolean; tilt: number }) {
  const { scene } = useGLTF(url, DRACO_DECODER);
  const group = useRef<Group>(null);
  const speed = useRef(0.25);

  // Our own copy, resized and centred (the explorer uses the same file separately).
  const object = useMemo(() => {
    const copy = cloneWithRig(scene);
    const box = new Box3().setFromObject(copy);
    const size = box.getSize(new Vector3());
    const scale = SIZE / Math.max(size.x, size.y, size.z, 1e-6);
    copy.scale.multiplyScalar(scale);
    copy.position.copy(box.getCenter(new Vector3()).multiplyScalar(-scale));
    return copy;
  }, [scene]);

  useFrame(({ clock }, delta) => {
    // Turns a little faster while the card is pointed at.
    speed.current += ((active ? 0.9 : 0.25) - speed.current) * Math.min(1, delta * 3);
    group.current!.rotation.y += speed.current * delta;
    group.current!.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <group ref={group} rotation-x={tilt}>
      <primitive object={object} />
    </group>
  );
}

export function ModelPreview({ url, active, tilt = 0 }: { url: string; active: boolean; tilt?: number }) {
  return (
    <Canvas className="model-preview" dpr={[1, 2]} camera={{ position: [0, 0.35, 3.4], fov: 40 }} gl={{ alpha: true }}>
      <hemisphereLight args={["#fffaf2", "#d8cdbf", 1.4]} />
      <directionalLight position={[2.5, 3, 3]} intensity={1.8} color="#fff4e8" />
      <directionalLight position={[-3, 1, -2]} intensity={0.8} color="#e6ecff" />
      <Suspense fallback={<ModelLoader scale={1.3} />}>
        <Spinning url={url} active={active} tilt={tilt} />
      </Suspense>
    </Canvas>
  );
}
