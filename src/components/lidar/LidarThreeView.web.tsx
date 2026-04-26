import React, { useEffect, useRef } from 'react';
// Metro `three` paket kökünü çözemeyebilir; doğrudan build dosyası (OneDrive / exports sorunlarından kaçınır).
import * as THREE from '../../../node_modules/three/build/three.module.js';
import { OrbitControls } from '../../../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from '../../../node_modules/three/examples/jsm/controls/TransformControls.js';
import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';
import type { LidarThreeViewProps } from './types';

function buildCuboidGroup(c: LidarCuboidAnnotation, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  g.userData.cuboidId = c.id;
  g.userData.baseW = c.width;
  g.userData.baseH = c.height;
  g.userData.baseD = c.depth;
  g.scale.set(1, 1, 1);
  const geom = new THREE.BoxGeometry(c.width, c.height, c.depth);
  const mat = new THREE.MeshBasicMaterial({
    color: selected ? 0xf97316 : 0x38bdf8,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.cuboidId = c.id;
  const edges = new THREE.EdgesGeometry(geom);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: selected ? 0xf97316 : 0xe2e8f0 })
  );
  g.add(mesh);
  g.add(line);
  g.position.set(c.cx, c.cy, c.cz);
  g.rotation.y = c.yaw;
  return g;
}

export default function LidarThreeView({
  positions,
  colors,
  cuboids,
  selectedId,
  tool,
  onSelectCuboid,
  onAddCuboid,
  onCuboidTransform,
}: LidarThreeViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toolRef = useRef(tool);
  const onSelectRef = useRef(onSelectCuboid);
  const onAddRef = useRef(onAddCuboid);
  const onCuboidTransformRef = useRef(onCuboidTransform);
  toolRef.current = tool;
  onSelectRef.current = onSelectCuboid;
  onAddRef.current = onAddCuboid;
  onCuboidTransformRef.current = onCuboidTransform;

  const ctxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    transformControls: TransformControls;
    points: THREE.Points;
    cuboidRoot: THREE.Group;
    raycaster: THREE.Raycaster;
    plane: THREE.Plane;
    geom: THREE.BufferGeometry;
  } | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const w = Math.max(320, wrap.clientWidth || 640);
    const h = Math.max(320, wrap.clientHeight || 480);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
    camera.position.set(22, 26, 32);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    wrap.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 0, 0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    const mat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    scene.add(points);

    const grid = new THREE.GridHelper(80, 40, 0x475569, 0x1e293b);
    scene.add(grid);

    const cuboidRoot = new THREE.Group();
    scene.add(cuboidRoot);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(0.95);
    transformControls.enabled = true;
    scene.add(transformControls.getHelper());

    const commitTransformObject = (obj: THREE.Object3D) => {
      const fn = onCuboidTransformRef.current;
      if (!fn || !(obj instanceof THREE.Group)) return;
      const id = obj.userData.cuboidId as string | undefined;
      if (!id) return;
      const bw = Number(obj.userData.baseW) || 1;
      const bh = Number(obj.userData.baseH) || 1;
      const bd = Number(obj.userData.baseD) || 1;
      const mode = transformControls.getMode();
      if (mode === 'translate') {
        fn(id, {
          cx: obj.position.x,
          cy: obj.position.y,
          cz: obj.position.z,
          yaw: obj.rotation.y,
        });
      } else if (mode === 'scale') {
        const sx = Math.max(0.04, obj.scale.x);
        const sy = Math.max(0.04, obj.scale.y);
        const sz = Math.max(0.04, obj.scale.z);
        fn(id, {
          cx: obj.position.x,
          cy: obj.position.y,
          cz: obj.position.z,
          yaw: obj.rotation.y,
          width: Math.max(0.15, bw * sx),
          height: Math.max(0.15, bh * sy),
          depth: Math.max(0.15, bd * sz),
        });
      }
    };

    transformControls.addEventListener('mouseDown', () => {
      controls.enabled = false;
    });
    transformControls.addEventListener('mouseUp', () => {
      controls.enabled = true;
      if (transformControls.object) {
        commitTransformObject(transformControls.object);
      }
    });

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 0.28;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();

    const ndc = new THREE.Vector2();
    const onDown = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const mode = toolRef.current;
      if (mode === 'add') {
        if (raycaster.ray.intersectPlane(plane, hit)) {
          onAddRef.current(hit.x, hit.z);
        }
        return;
      }
      if (mode === 'select') {
        const meshes: THREE.Object3D[] = [];
        cuboidRoot.traverse((o) => {
          if (o instanceof THREE.Mesh && o.userData.cuboidId) meshes.push(o);
        });
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          onSelectRef.current((hits[0].object as THREE.Mesh).userData.cuboidId as string);
        } else {
          onSelectRef.current(null);
        }
        return;
      }
      if (mode === 'move' || mode === 'scale') {
        const meshes: THREE.Object3D[] = [];
        cuboidRoot.traverse((o) => {
          if (o instanceof THREE.Mesh && o.userData.cuboidId) meshes.push(o);
        });
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          onSelectRef.current((hits[0].object as THREE.Mesh).userData.cuboidId as string);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onDown);

    const onResize = () => {
      const nw = Math.max(320, wrap.clientWidth);
      const nh = Math.max(320, wrap.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    ctxRef.current = {
      renderer,
      scene,
      camera,
      controls,
      transformControls,
      points,
      cuboidRoot,
      raycaster,
      plane,
      geom,
    };

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      transformControls.detach();
      transformControls.dispose();
      scene.remove(transformControls.getHelper());
      controls.dispose();
      renderer.dispose();
      geom.dispose();
      mat.dispose();
      if (renderer.domElement.parentElement === wrap) {
        wrap.removeChild(renderer.domElement);
      }
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    t.geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    t.geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    t.geom.computeBoundingSphere();
  }, [positions, colors]);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    const { cuboidRoot, transformControls } = t;
    transformControls.detach();
    while (cuboidRoot.children.length) {
      const ch = cuboidRoot.children[0];
      cuboidRoot.remove(ch);
      if (ch instanceof THREE.Group) {
        ch.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
          if (o instanceof THREE.LineSegments) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
      }
    }
    for (const c of cuboids) {
      cuboidRoot.add(buildCuboidGroup(c, c.id === selectedId));
    }
  }, [cuboids, selectedId]);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    const { cuboidRoot, transformControls } = t;
    transformControls.detach();
    if ((tool !== 'move' && tool !== 'scale') || !selectedId) {
      return;
    }
    const grp = cuboidRoot.children.find(
      (ch): ch is THREE.Group =>
        ch instanceof THREE.Group && (ch as THREE.Group).userData.cuboidId === selectedId
    );
    if (!grp) return;
    transformControls.setMode(tool === 'move' ? 'translate' : 'scale');
    transformControls.attach(grp);
  }, [cuboids, selectedId, tool]);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    if (tool === 'orbit') {
      t.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    } else {
      t.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
  }, [tool]);

  const hint =
    tool === 'orbit'
      ? 'Left drag: rotate · Scroll wheel: zoom'
      : tool === 'select'
        ? 'Click a cuboid surface to select'
        : tool === 'add'
          ? 'Click the ground grid to place a new 3D box'
          : tool === 'move'
            ? 'Select a box, then drag arrows to move (release to save)'
            : 'Select a box, then drag handles to resize (release to save)';

  return (
    <div style={styles.wrap}>
      <div ref={wrapRef} style={styles.canvasHost} />
      <div style={styles.hintBar}>{hint}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    width: '100%',
    flex: 1,
    minHeight: 420,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #334155',
    background: '#020617',
  },
  canvasHost: {
    position: 'absolute',
    inset: 0,
  },
  hintBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '6px 8px',
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    pointerEvents: 'none',
    background: 'linear-gradient(transparent, rgba(2,6,23,0.85))',
  },
};
