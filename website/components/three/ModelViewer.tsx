"use client";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { detectWebGL, usePrefersReducedMotion } from "./hooks";

export type ModelViewerVariant = "hero" | "feature";
export type ModelScrollMotion = "none" | "hero" | "gift";

export interface ModelViewerProps {
  model: string;
  className?: string;
  label?: string;
  variant?: ModelViewerVariant;
  fallback?: ReactNode;
  progressRef?: MutableRefObject<number>;
  scrollMotion?: ModelScrollMotion;
  glow?: "gold" | "terracotta";
}

function SceneLights({ variant }: { variant: ModelViewerVariant }) {
  const hero = variant === "hero";
  return (
    <>
      <ambientLight intensity={hero ? 0.55 : 0.5} />
      <directionalLight
        position={[4.5, 6.5, 3.5]}
        intensity={hero ? 1.35 : 1.25}
        color="#fff6ea"
      />
      <directionalLight
        position={[-5, 2.5, -3]}
        intensity={hero ? 0.55 : 0.62}
        color={hero ? "#d4a574" : "#c45d45"}
      />
      <pointLight
        position={[0.5, 1.2, 3.5]}
        intensity={hero ? 0.7 : 0.75}
        color={hero ? "#f0d49a" : "#e8c9a0"}
        distance={12}
      />
      <pointLight
        position={[-2.5, -0.5, 2]}
        intensity={hero ? 0.25 : 0.4}
        color="#c45d45"
        distance={10}
      />
    </>
  );
}

function FittedModel({
  url,
  variant,
  reducedMotion,
  pointer,
  progressRef,
  scrollMotion,
}: {
  url: string;
  variant: ModelViewerVariant;
  reducedMotion: boolean;
  pointer: MutableRefObject<{ x: number; y: number }>;
  progressRef?: MutableRefObject<number>;
  scrollMotion: ModelScrollMotion;
}) {
  const { scene } = useGLTF(url);
  const root = useRef<THREE.Group>(null);
  const floatPhase = useRef(Math.random() * Math.PI * 2);
  const basePos = useRef(new THREE.Vector3());
  const baseScale = useRef(1);
  const ready = useRef(false);
  const { camera, size } = useThree();

  const cloned = useMemo(() => scene.clone(true), [scene]);

  const fit = useCallback(() => {
    const group = root.current;
    if (!group) return;

    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const boxSize = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z, 0.001);
    const target = variant === "hero" ? 2.2 : 1.85;
    const scale = target / maxDim;

    group.scale.setScalar(scale);
    group.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    group.updateMatrixWorld(true);

    const fittedBox = new THREE.Box3().setFromObject(group);
    const fittedSize = fittedBox.getSize(new THREE.Vector3());
    const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
    const aspect = size.width / Math.max(size.height, 1);
    const cam = camera as THREE.PerspectiveCamera;
    const fov = (cam.fov * Math.PI) / 180;
    const distH = (fittedSize.y * 1.25) / (2 * Math.tan(fov / 2));
    const distW = (fittedSize.x * 1.3) / (2 * Math.tan(fov / 2) * aspect);
    const distance =
      Math.max(distH, distW, 2.5) * (variant === "hero" ? 1.02 : 1.04);

    cam.near = 0.1;
    cam.far = 80;
    cam.position.set(
      fittedCenter.x + distance * 0.2,
      fittedCenter.y + distance * 0.1,
      fittedCenter.z + distance,
    );
    cam.lookAt(fittedCenter.x, fittedCenter.y, fittedCenter.z);
    cam.updateProjectionMatrix();

    basePos.current.copy(group.position);
    baseScale.current = scale;
    ready.current = true;
  }, [camera, size.height, size.width, variant]);

  useEffect(() => {
    ready.current = false;
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
  }, [fit, cloned]);

  useFrame((state, delta) => {
    const group = root.current;
    if (!group || !ready.current) return;

    const t = state.clock.elapsedTime + floatPhase.current;
    const p = THREE.MathUtils.clamp(progressRef?.current ?? 0, 0, 1);
    const motion = reducedMotion ? "none" : scrollMotion;

    const floatY = reducedMotion
      ? 0
      : motion === "gift"
        ? Math.sin(t * 0.55) * 0.02
        : motion === "hero"
          ? 0
          : Math.sin(t * 0.7) * (variant === "hero" ? 0.05 : 0.035);

    let rotY =
      reducedMotion
        ? 0.12
        : Math.sin(t * 0.16) * (variant === "hero" ? 0.1 : 0.16);
    let rotX = 0;
    let posY = basePos.current.y + floatY;
    let scaleMul = 1;
    const spinHero = motion === "hero";

    if (motion === "hero") {
      rotX = 0;
    } else if (motion === "gift") {
      rotY = THREE.MathUtils.lerp(-0.25, 1.2, p) + Math.sin(t * 0.18) * 0.05;
      rotX = THREE.MathUtils.lerp(0.12, -0.06, p);
      posY = basePos.current.y + THREE.MathUtils.lerp(-0.22, 0.06, p) + floatY;
      scaleMul = THREE.MathUtils.lerp(0.88, 1, p);
    }

    const parallaxX =
      reducedMotion || motion !== "none"
        ? 0
        : pointer.current.x * (variant === "hero" ? 0.1 : 0.07);
    const parallaxY =
      reducedMotion || motion !== "none"
        ? 0
        : pointer.current.y * (variant === "hero" ? 0.07 : 0.05);

    group.position.x = basePos.current.x;
    group.position.z = basePos.current.z;
    group.position.y = THREE.MathUtils.damp(group.position.y, posY, 4, delta);
    group.scale.setScalar(
      THREE.MathUtils.damp(group.scale.x, baseScale.current * scaleMul, 4, delta),
    );
    if (spinHero) {
      group.rotation.y += delta * 0.28;
    } else {
      group.rotation.y = THREE.MathUtils.damp(
        group.rotation.y,
        rotY + parallaxX,
        3.2,
        delta,
      );
    }
    group.rotation.x = THREE.MathUtils.damp(
      group.rotation.x,
      rotX + parallaxY * 0.35,
      3.2,
      delta,
    );
  });

  return (
    <group ref={root}>
      <primitive object={cloned} />
    </group>
  );
}

function LoadingHint() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <p className="text-[11px] tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
        Loading model…
      </p>
    </div>
  );
}

function DefaultFallback({ label }: { label: string }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      role="img"
      aria-label={label}
    >
      <div
        className="h-[55%] w-[55%] max-w-xs rounded-[2rem] border border-[var(--accent)]/20"
        style={{
          background:
            "radial-gradient(circle at 40% 35%, rgba(212,165,116,0.18), transparent 70%), linear-gradient(145deg, #1a1610, #0a0a0a)",
        }}
      />
    </div>
  );
}

class ModelErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function useCanvasLifecycle(rootMargin = "120px") {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const on = Boolean(entry?.isIntersecting);
        if (on) setMounted(true);
        setActive(on);
      },
      { rootMargin, threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, mounted, active };
}

export function ModelViewer({
  model,
  className,
  label = "3D product visualization",
  variant = "hero",
  fallback,
  progressRef,
  scrollMotion = "none",
  glow = "gold",
}: ModelViewerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { ref, mounted, active } = useCanvasLifecycle(
    variant === "hero" ? "80px" : "180px",
  );
  const [webgl, setWebgl] = useState(true);
  const [ready, setReady] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    setWebgl(detectWebGL());
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion || coarse || scrollMotion !== "none") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.current.x = THREE.MathUtils.clamp(nx, -1, 1);
      pointer.current.y = THREE.MathUtils.clamp(ny, -1, 1);
    },
    [coarse, reducedMotion, scrollMotion],
  );

  const onPointerLeave = useCallback(() => {
    pointer.current.x = 0;
    pointer.current.y = 0;
  }, []);

  const fallbackNode = fallback ?? <DefaultFallback label={label} />;
  const glowStyle =
    glow === "terracotta"
      ? "radial-gradient(ellipse 55% 50% at 50% 52%, rgba(196,93,69,0.22), transparent 68%)"
      : variant === "hero"
        ? "radial-gradient(ellipse 55% 50% at 55% 48%, rgba(212,165,116,0.2), transparent 68%)"
        : "radial-gradient(ellipse 50% 45% at 50% 50%, rgba(212,165,116,0.12), transparent 70%)";

  return (
    <div
      ref={ref}
      className={cn("relative h-full w-full min-h-[240px]", className)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      role="img"
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: glowStyle }}
      />

      {!webgl ? (
        fallbackNode
      ) : !mounted ? (
        <LoadingHint />
      ) : (
        <ModelErrorBoundary fallback={fallbackNode}>
          {!ready ? <LoadingHint /> : null}
          <Canvas
            className="!absolute inset-0 !h-full !w-full touch-none"
            dpr={[1, 1.5]}
            frameloop={active ? "always" : "never"}
            gl={{
              alpha: true,
              antialias: true,
              powerPreference: "high-performance",
              stencil: false,
              depth: true,
            }}
            camera={{ fov: 35, near: 0.1, far: 80, position: [0, 0.4, 4] }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
              setReady(true);
            }}
            style={{ background: "transparent", pointerEvents: "none" }}
            aria-hidden
          >
            <Suspense fallback={null}>
              <SceneLights variant={variant} />
              <FittedModel
                url={model}
                variant={variant}
                reducedMotion={reducedMotion}
                pointer={pointer}
                progressRef={progressRef}
                scrollMotion={scrollMotion}
              />
            </Suspense>
          </Canvas>
        </ModelErrorBoundary>
      )}
    </div>
  );
}
