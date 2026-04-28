import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { lidarClassColorHex } from '@/constants/lidarClassColors';
import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';
import type { LidarGizmoMode, LidarPointColorMode, LidarThreeTool, LidarThreeViewProps } from './types';
import { buildClassicPointCloudBuffers } from '@/lib/lidar/lidarPointCloudGpu';

type TcGizmo = TransformControls & {
  _gizmo: { gizmo: Record<string, THREE.Object3D>; picker: Record<string, THREE.Object3D> };
};

const SELECTED_EDGE = 0x22d3ee;
const HOVER_EDGE = 0x7dd3fc;
const MESH_OPACITY = 0.35;
const MIN_CREATE_DRAG = 0.28;

/**
 * Scale mode's center "XYZ" handle does uniform scale and shrinks boxes easily.
 * LiDAR: resize only via axis handles; center handle stays for **translate** mode only.
 *
 * Must run **after** `renderer.render()`: TransformControlsGizmo.updateMatrixWorld resets
 * handle.visible every frame, so a pre-render hide is overwritten before raycast/pick.
 */
function suppressScaleUniformCenterHandle(tc: TransformControls) {
  if (tc.getMode() !== 'scale') return;
  const g = (tc as unknown as TcGizmo)._gizmo;
  if (!g?.gizmo?.scale || !g?.picker?.scale) return;
  for (const group of [g.gizmo.scale, g.picker.scale]) {
    const h = group.children.find((c) => c.name === 'XYZ');
    if (h) h.visible = false;
  }
}

/** Soft round sprite so PointsMaterial reads as LiDAR dots, not square tiles. */
function createPointSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function buildCuboidGroup(
  c: LidarCuboidAnnotation,
  selected: boolean,
  hovered: boolean
): THREE.Group {
  const g = new THREE.Group();
  g.userData.cuboidId = c.id;
  g.userData.baseW = c.width;
  g.userData.baseH = c.height;
  g.userData.baseD = c.depth;
  g.scale.set(1, 1, 1);
  const geom = new THREE.BoxGeometry(c.width, c.height, c.depth);
  const fillColor = lidarClassColorHex(c.label);
  const mat = new THREE.MeshBasicMaterial({
    color: fillColor,
    transparent: true,
    opacity: MESH_OPACITY,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.cuboidId = c.id;
  const edges = new THREE.EdgesGeometry(geom);
  let edgeColor = 0x64748b;
  if (selected) edgeColor = SELECTED_EDGE;
  else if (hovered) edgeColor = HOVER_EDGE;
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor }));
  g.add(mesh);
  g.add(line);
  g.position.set(c.cx, c.cy, c.cz);
  g.rotation.order = 'YXZ';
  g.rotation.set(0, c.yaw, 0);
  return g;
}

export default function LidarThreeView({
  positions,
  colors,
  cuboids,
  selectedId,
  hoveredId = null,
  tool,
  gizmoMode,
  pointColorMode = 'height',
  pointDensity = 1,
  focusRequestId = 0,
  resetCameraRequestId = 0,
  onSelectCuboid,
  onHoverCuboid,
  onCreateBoxFootprint,
  onDeleteCuboid,
  onCuboidTransform,
}: LidarThreeViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toolRef = useRef(tool);
  const cuboidsRef = useRef(cuboids);
  const onSelectRef = useRef(onSelectCuboid);
  const onHoverRef = useRef(onHoverCuboid);
  const onFootprintRef = useRef(onCreateBoxFootprint);
  const onDeleteRef = useRef(onDeleteCuboid);
  const onCuboidTransformRef = useRef(onCuboidTransform);

  toolRef.current = tool;
  cuboidsRef.current = cuboids;
  onSelectRef.current = onSelectCuboid;
  onHoverRef.current = onHoverCuboid;
  onFootprintRef.current = onCreateBoxFootprint;
  onDeleteRef.current = onDeleteCuboid;
  onCuboidTransformRef.current = onCuboidTransform;

  const createDragRef = useRef<{ x0: number; z0: number; pointerId: number } | null>(null);
  const shiftDragRef = useRef<{
    id: string;
    pointerId: number;
    planeY: number;
    grabOffsetX: number;
    grabOffsetZ: number;
  } | null>(null);
  const ctxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    transformControls: TransformControls;
    points: THREE.Points;
    pointMaterial: THREE.PointsMaterial;
    pointGeometry: THREE.BufferGeometry;
    pointSpriteMap: THREE.CanvasTexture;
    cuboidRoot: THREE.Group;
    raycaster: THREE.Raycaster;
    plane: THREE.Plane;
    previewMesh: THREE.Mesh;
    initialCamPos: THREE.Vector3;
    initialTarget: THREE.Vector3;
    renderFrame: () => void;
  } | null>(null);

  const lastResetReq = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const w = Math.max(320, wrap.clientWidth || 640);
    const h = Math.max(320, wrap.clientHeight || 480);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.2, 420);
    camera.position.set(34, 30, 34);
    camera.lookAt(0, 0.6, 0);
    const initialCamPos = camera.position.clone();
    const initialTarget = new THREE.Vector3(0, 0.6, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const pr = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    wrap.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.copy(initialTarget);
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.minDistance = 0.35;
    controls.maxDistance = 220;
    controls.rotateSpeed = 1;
    controls.panSpeed = 1;
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;

    const built = buildClassicPointCloudBuffers(positions, colors, pointDensity, pointColorMode);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    pointGeometry.setAttribute('color', new THREE.BufferAttribute(built.vertexColors, 3));
    pointGeometry.computeBoundingSphere();

    const pointSpriteMap = createPointSpriteTexture();
    const pointMaterial = new THREE.PointsMaterial({
      map: pointSpriteMap,
      size: 1.05,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.35,
    });

    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.frustumCulled = true;
    scene.add(points);

    const bs = pointGeometry.boundingSphere;
    if (bs && Number.isFinite(bs.radius) && bs.radius > 0.08) {
      const pad = 2.05;
      const dist = Math.min(120, bs.radius * pad);
      const cx = bs.center.x;
      const cy = bs.center.y;
      const cz = bs.center.z;
      camera.position.set(cx + dist * 0.82, cy + dist * 0.48, cz + dist * 0.82);
      controls.target.set(cx, cy, cz);
      initialTarget.copy(controls.target);
      initialCamPos.copy(camera.position);
      camera.updateProjectionMatrix();
    }
    controls.update();

    const grid = new THREE.GridHelper(96, 48, 0x1e3a5f, 0x0b1530);
    scene.add(grid);

    const previewGeom = new THREE.PlaneGeometry(1, 1);
    const previewMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const previewMesh = new THREE.Mesh(previewGeom, previewMat);
    previewMesh.rotation.x = -Math.PI / 2;
    previewMesh.visible = false;
    previewMesh.renderOrder = 3;
    scene.add(previewMesh);

    const cuboidRoot = new THREE.Group();
    scene.add(cuboidRoot);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSize(1.05);
    transformControls.enabled = true;
    scene.add(transformControls.getHelper());

    const normalizeYaw = (y: number) => {
      let a = y;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    };

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
        });
      } else if (mode === 'scale') {
        const sx = Math.max(0.04, obj.scale.x);
        const sy = Math.max(0.04, obj.scale.y);
        const sz = Math.max(0.04, obj.scale.z);
        const e = new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ');
        fn(id, {
          cx: obj.position.x,
          cy: obj.position.y,
          cz: obj.position.z,
          yaw: normalizeYaw(e.y),
          width: Math.max(0.15, bw * sx),
          height: Math.max(0.15, bh * sy),
          depth: Math.max(0.15, bd * sz),
        });
      } else if (mode === 'rotate') {
        const e = new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ');
        // Yaw only — keeps box center fixed in annotation data (no float drift).
        fn(id, { yaw: normalizeYaw(e.y) });
      }
    };

    transformControls.addEventListener('mouseDown', () => {
      controls.enabled = false;
    });
    transformControls.addEventListener('mouseUp', () => {
      controls.enabled = true;
    });
    transformControls.addEventListener('dragging-changed', (ev: THREE.Event & { value?: boolean }) => {
      if (ev.value) {
        controls.enabled = false;
        return;
      }
      controls.enabled = true;
      if (transformControls.object) {
        commitTransformObject(transformControls.object);
      }
    });

    const renderFrame = () => {
      renderer.render(scene, camera);
      suppressScaleUniformCenterHandle(transformControls);
    };

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points!.threshold = 0.55;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let lastHoverKey = '';

    const ndc = new THREE.Vector2();
    const rayFromEvent = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
    };

    const collectCuboidMeshes = (): THREE.Object3D[] => {
      const meshes: THREE.Object3D[] = [];
      cuboidRoot.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.cuboidId) meshes.push(o);
      });
      return meshes;
    };

    const findGroupByCuboidId = (id: string): THREE.Group | null => {
      for (const ch of cuboidRoot.children) {
        if (ch instanceof THREE.Group && (ch as THREE.Group).userData.cuboidId === id) {
          return ch as THREE.Group;
        }
      }
      return null;
    };

    const updateCreatePreview = (x1: number, z1: number) => {
      const d = createDragRef.current;
      if (!d) return;
      const minX = Math.min(d.x0, x1);
      const maxX = Math.max(d.x0, x1);
      const minZ = Math.min(d.z0, z1);
      const maxZ = Math.max(d.z0, z1);
      let fw = Math.max(maxX - minX, 0.05);
      let fd = Math.max(maxZ - minZ, 0.05);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      fw = Math.max(fw, 0.15);
      fd = Math.max(fd, 0.15);
      previewMesh.visible = true;
      previewMesh.position.set(cx, 0.08, cz);
      previewMesh.scale.set(fw, fd, 1);
      renderFrame();
    };

    const endCreateDrag = (ev: PointerEvent) => {
      const drag = createDragRef.current;
      if (!drag || drag.pointerId !== ev.pointerId) return;
      createDragRef.current = null;
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      controls.enabled = true;
      previewMesh.visible = false;
      rayFromEvent(ev);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const minX = Math.min(drag.x0, hit.x);
        const maxX = Math.max(drag.x0, hit.x);
        const minZ = Math.min(drag.z0, hit.z);
        const maxZ = Math.max(drag.z0, hit.z);
        const fwRaw = maxX - minX;
        const fdRaw = maxZ - minZ;
        if (Math.max(fwRaw, fdRaw) >= MIN_CREATE_DRAG) {
          const cx = (minX + maxX) / 2;
          const cz = (minZ + maxZ) / 2;
          const width = Math.max(fwRaw, 0.15);
          const depth = Math.max(fdRaw, 0.15);
          onFootprintRef.current({ cx, cz, width, depth });
        }
      }
      renderFrame();
    };

    const flushShiftDrag = () => {
      const st = shiftDragRef.current;
      if (!st) return;
      const grp = findGroupByCuboidId(st.id);
      if (grp) {
        onCuboidTransformRef.current?.(st.id, {
          cx: grp.position.x,
          cy: grp.position.y,
          cz: grp.position.z,
        });
      }
      renderFrame();
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      rayFromEvent(ev);
      const mode = toolRef.current;
      const meshes = collectCuboidMeshes();
      const cuboidHits = raycaster.intersectObjects(meshes, false);

      if (mode === 'delete') {
        if (cuboidHits.length > 0) {
          const oid = (cuboidHits[0].object as THREE.Mesh).userData.cuboidId as string;
          onDeleteRef.current?.(oid);
        }
        return;
      }

      if (mode === 'create') {
        if (cuboidHits.length > 0) return;
        if (raycaster.ray.intersectPlane(plane, hit)) {
          createDragRef.current = { x0: hit.x, z0: hit.z, pointerId: ev.pointerId };
          try {
            renderer.domElement.setPointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
          controls.enabled = false;
        }
        return;
      }

      if (mode === 'select') {
        if (ev.shiftKey && cuboidHits.length > 0) {
          const oid = (cuboidHits[0].object as THREE.Mesh).userData.cuboidId as string;
          const c = cuboidsRef.current.find((x) => x.id === oid);
          if (!c) return;
          if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -c.cy), hit)) {
            shiftDragRef.current = {
              id: oid,
              pointerId: ev.pointerId,
              planeY: c.cy,
              grabOffsetX: c.cx - hit.x,
              grabOffsetZ: c.cz - hit.z,
            };
            try {
              renderer.domElement.setPointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            controls.enabled = false;
          }
          return;
        }
        if (cuboidHits.length > 0) {
          onSelectRef.current((cuboidHits[0].object as THREE.Mesh).userData.cuboidId as string);
        } else {
          onSelectRef.current(null);
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const cd = createDragRef.current;
      if (cd && cd.pointerId === ev.pointerId && toolRef.current === 'create') {
        rayFromEvent(ev);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          updateCreatePreview(hit.x, hit.z);
        }
        return;
      }

      const sd = shiftDragRef.current;
      if (sd && sd.pointerId === ev.pointerId) {
        rayFromEvent(ev);
        const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sd.planeY);
        if (raycaster.ray.intersectPlane(dragPlane, hit)) {
          const grp = findGroupByCuboidId(sd.id);
          if (grp) {
            grp.position.set(hit.x + sd.grabOffsetX, sd.planeY, hit.z + sd.grabOffsetZ);
          }
        }
        renderFrame();
        return;
      }

      if (
        ev.buttons === 0 &&
        toolRef.current === 'select'
      ) {
        rayFromEvent(ev);
        const ms = collectCuboidMeshes();
        const hits = raycaster.intersectObjects(ms, false);
        const hid =
          hits.length > 0 ? ((hits[0].object as THREE.Mesh).userData.cuboidId as string) : null;
        const key = hid ?? '';
        if (key !== lastHoverKey) {
          lastHoverKey = key;
          onHoverRef.current?.(hid);
        }
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (createDragRef.current) {
        endCreateDrag(ev);
      }
      const sd = shiftDragRef.current;
      if (sd && sd.pointerId === ev.pointerId) {
        flushShiftDrag();
        shiftDragRef.current = null;
        try {
          renderer.domElement.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        controls.enabled = true;
      }
    };

    const onPointerCancel = (ev: PointerEvent) => {
      if (createDragRef.current && createDragRef.current.pointerId === ev.pointerId) {
        createDragRef.current = null;
        previewMesh.visible = false;
        try {
          renderer.domElement.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        controls.enabled = true;
      }
      if (shiftDragRef.current && shiftDragRef.current.pointerId === ev.pointerId) {
        flushShiftDrag();
        shiftDragRef.current = null;
        controls.enabled = true;
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel);

    const onShiftDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        controls.rotateSpeed = 2.5;
        controls.panSpeed = 1.85;
      }
    };
    const onShiftUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        controls.rotateSpeed = 1;
        controls.panSpeed = 1;
      }
    };
    window.addEventListener('keydown', onShiftDown);
    window.addEventListener('keyup', onShiftUp);

    const onResize = () => {
      const nw = Math.max(320, wrap.clientWidth);
      const nh = Math.max(320, wrap.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      renderFrame();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    controls.addEventListener('change', renderFrame);
    transformControls.addEventListener('change', renderFrame);
    renderFrame();

    ctxRef.current = {
      renderer,
      scene,
      camera,
      controls,
      transformControls,
      points,
      pointMaterial,
      pointGeometry,
      pointSpriteMap,
      cuboidRoot,
      raycaster,
      plane,
      previewMesh,
      initialCamPos,
      initialTarget,
      renderFrame,
    };

    return () => {
      controls.removeEventListener('change', renderFrame);
      transformControls.removeEventListener('change', renderFrame);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onShiftDown);
      window.removeEventListener('keyup', onShiftUp);
      createDragRef.current = null;
      shiftDragRef.current = null;
      transformControls.detach();
      transformControls.disconnect();
      const tcHelper = transformControls.getHelper();
      scene.remove(tcHelper);
      // TransformControls.dispose() calls this.traverse — invalid on Controls (not Object3D) in three@0.169
      tcHelper.traverse((obj) => {
        const meshLike = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        meshLike.geometry?.dispose();
        const mat = meshLike.material;
        if (mat) {
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      previewGeom.dispose();
      previewMat.dispose();
      scene.remove(previewMesh);
      pointGeometry.dispose();
      pointSpriteMap.dispose();
      pointMaterial.dispose();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) {
        wrap.removeChild(renderer.domElement);
      }
      ctxRef.current = null;
    };
  }, []);

  const rebuildPointCloud = (
    pos: Float32Array,
    col: Float32Array,
    density: number,
    mode: LidarPointColorMode
  ) => {
    const t = ctxRef.current;
    if (!t || pos.length < 9 || col.length < 9) return;
    const built = buildClassicPointCloudBuffers(pos, col, density, mode);
    t.pointGeometry.dispose();
    t.pointGeometry = new THREE.BufferGeometry();
    t.pointGeometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
    t.pointGeometry.setAttribute('color', new THREE.BufferAttribute(built.vertexColors, 3));
    t.pointGeometry.computeBoundingSphere();
    t.points.geometry = t.pointGeometry;
    const s = density >= 0.75 ? 0.95 : density >= 0.5 ? 1.1 : density >= 0.25 ? 1.35 : 1.55;
    t.pointMaterial.size = s;
    t.renderFrame();
  };

  useEffect(() => {
    rebuildPointCloud(positions, colors, pointDensity, pointColorMode);
  }, [positions, colors, pointDensity, pointColorMode]);

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
      cuboidRoot.add(buildCuboidGroup(c, c.id === selectedId, false));
    }
    t.renderFrame();
  }, [cuboids, selectedId]);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    const { cuboidRoot } = t;
    for (const ch of cuboidRoot.children) {
      if (!(ch instanceof THREE.Group) || !ch.userData.cuboidId) continue;
      const id = ch.userData.cuboidId as string;
      const sel = id === selectedId;
      const hov = Boolean(hoveredId) && id === hoveredId;
      const line = ch.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
      if (line?.material instanceof THREE.LineBasicMaterial) {
        let edgeColor = 0x64748b;
        if (sel) edgeColor = SELECTED_EDGE;
        else if (hov) edgeColor = HOVER_EDGE;
        line.material.color.setHex(edgeColor);
      }
    }
    t.renderFrame();
  }, [hoveredId, selectedId]);

  const applyGizmoAxes = (tc: TransformControls, mode: LidarGizmoMode) => {
    const g = tc as TransformControls & { showX: boolean; showY: boolean; showZ: boolean };
    g.showX = true;
    g.showY = true;
    g.showZ = true;
    if (mode === 'rotate') {
      g.showX = false;
      g.showZ = false;
    }
  };

  useEffect(() => {
    const t = ctxRef.current;
    if (!t) return;
    const { cuboidRoot, transformControls } = t;
    transformControls.detach();
    if (tool !== 'select' || !selectedId) {
      t.renderFrame();
      return;
    }
    const grp = cuboidRoot.children.find(
      (ch): ch is THREE.Group =>
        ch instanceof THREE.Group && (ch as THREE.Group).userData.cuboidId === selectedId
    );
    if (!grp) {
      t.renderFrame();
      return;
    }
    const mode =
      gizmoMode === 'translate' ? 'translate' : gizmoMode === 'scale' ? 'scale' : 'rotate';
    transformControls.setMode(mode as 'translate' | 'scale' | 'rotate');
    transformControls.setSpace(mode === 'rotate' ? 'local' : 'world');
    applyGizmoAxes(transformControls, gizmoMode);
    transformControls.attach(grp);
    t.renderFrame();
  }, [cuboids, selectedId, tool, gizmoMode]);

  useEffect(() => {
    const t = ctxRef.current;
    if (!t || !focusRequestId) return;
    if (!selectedId) return;
    const c = cuboids.find((x) => x.id === selectedId);
    if (!c) return;
    const { camera, controls } = t;
    const size = Math.max(c.width, c.height, c.depth, 1.5);
    const dist = size * 2.8;
    camera.position.set(c.cx + dist * 0.85, c.cy + dist * 0.45, c.cz + dist * 0.85);
    controls.target.set(c.cx, c.cy, c.cz);
    controls.update();
    t.renderFrame();
  }, [focusRequestId, selectedId, cuboids]);

  useEffect(() => {
    if (!resetCameraRequestId || resetCameraRequestId === lastResetReq.current) return;
    lastResetReq.current = resetCameraRequestId;
    const t = ctxRef.current;
    if (!t) return;
    t.camera.position.copy(t.initialCamPos);
    t.controls.target.copy(t.initialTarget);
    t.controls.update();
    t.renderFrame();
  }, [resetCameraRequestId]);

  return (
    <div style={styles.wrap}>
      <div ref={wrapRef} style={styles.canvasHost} />
      <button
        type="button"
        style={styles.resetCam}
        onClick={() => {
          const t = ctxRef.current;
          if (!t) return;
          t.camera.position.copy(t.initialCamPos);
          t.controls.target.copy(t.initialTarget);
          t.controls.update();
          t.renderFrame();
        }}
      >
        Reset camera
      </button>
      <div style={styles.cornerAxes} aria-hidden>
        <svg width="56" height="56" viewBox="0 0 56 56">
          <line x1="6" y1="48" x2="44" y2="48" stroke="#f87171" strokeWidth="2.5" />
          <line x1="6" y1="48" x2="6" y2="12" stroke="#4ade80" strokeWidth="2.5" />
          <line x1="6" y1="48" x2="46" y2="28" stroke="#60a5fa" strokeWidth="2.5" />
          <text x="46" y="52" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            X
          </text>
          <text x="2" y="14" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            Y
          </text>
          <text x="48" y="26" fill="#94a3b8" fontSize="9" fontFamily="system-ui">
            Z
          </text>
        </svg>
      </div>
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
    background: '#0f172a',
  },
  canvasHost: {
    position: 'absolute',
    inset: 0,
  },
  resetCam: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 5,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#e2e8f0',
    background: 'rgba(30, 41, 59, 0.92)',
    border: '1px solid #475569',
    borderRadius: 8,
    cursor: 'pointer',
  },
  cornerAxes: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    zIndex: 4,
    pointerEvents: 'none',
    opacity: 0.95,
  },
};
