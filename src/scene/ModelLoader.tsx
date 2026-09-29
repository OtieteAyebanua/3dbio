/**
 * Shown where the model will appear while it loads: glowing rings orbiting a softly pulsing
 * core. (Its label — the model's name and how much has loaded — is ModelLoaderLabel, drawn on
 * the page over the 3D view.)
 */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, type Group, type Mesh } from "three";

const RINGS = [
  { radius: 0.62, tilt: [1.2, 0, 0.3], speed: 0.9, color: "#d9785f" },
  { radius: 0.5, tilt: [0.4, 0.9, 0], speed: -1.3, color: "#c9a27a" },
  { radius: 0.74, tilt: [-0.5, 0.3, 1.1], speed: 0.6, color: "#7d8fc4" },
] as const;
const SPARKS = 10;

interface Props {
  scale?: number;
  position?: [number, number, number];
}

export function ModelLoader({ scale = 1, position = [0, 0, 0] }: Props) {
  const rings = useRef<(Group | null)[]>([]);
  const core = useRef<Mesh>(null);
  const sparks = useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    rings.current.forEach((ring, i) => {
      if (ring) ring.rotation.z += RINGS[i].speed * delta;
    });
    core.current!.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
    sparks.current!.rotation.y = t * 0.7;
    sparks.current!.rotation.x = Math.sin(t * 0.4) * 0.4;
  });

  return (
    <group position={position} scale={scale}>
      {/* The pulsing core, with a soft halo */}
      <mesh ref={core}>
        <sphereGeometry args={[0.13, 32, 32]} />
        <meshBasicMaterial color="#fff1e4" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshBasicMaterial color="#f0b48f" transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Rings, each tilted its own way and turning at its own speed */}
      {RINGS.map((ring, i) => (
        <group key={i} rotation={ring.tilt as unknown as [number, number, number]}>
          <group ref={(g) => void (rings.current[i] = g)}>
            <mesh>
              <torusGeometry args={[ring.radius, 0.008, 12, 160]} />
              <meshBasicMaterial color={ring.color} transparent opacity={0.85} />
            </mesh>
            {/* A bright bead travelling round the ring */}
            <mesh position={[ring.radius, 0, 0]}>
              <sphereGeometry args={[0.032, 16, 16]} />
              <meshBasicMaterial color={ring.color} />
            </mesh>
          </group>
        </group>
      ))}

      {/* A drifting shell of sparks */}
      <group ref={sparks}>
        {Array.from({ length: SPARKS }, (_, i) => {
          const a = (i / SPARKS) * Math.PI * 2;
          const y = Math.sin(i * 1.7) * 0.35;
          const r = Math.sqrt(1 - (y / 0.9) ** 2) * 0.9;
          return (
            <mesh key={i} position={[Math.cos(a) * r, y, Math.sin(a) * r]}>
              <sphereGeometry args={[0.014, 8, 8]} />
              <meshBasicMaterial color="#e8c9a8" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/**
 * The loader's label: what's loading, with a sliding bar. (A model is one file, and loaders only
 * report when a whole file is done, so there's no honest percentage to show.)
 */
export function ModelLoaderLabel({ name }: { name: string }) {
  return (
    <div className="model-loader">
      <p>
        Loading <b>{name}</b>
      </p>
      <div className="model-loader-bar">
        <span />
      </div>
    </div>
  );
}
