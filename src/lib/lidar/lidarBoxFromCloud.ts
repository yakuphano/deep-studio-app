/**
 * Derive 3D box vertical extent and snap from LiDAR-style point positions (X right, Y up, Z forward).
 */

export function estimateFootprintFromPoints(
  positions: Float32Array,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  margin = 0.12
): { height: number; cy: number; groundY: number } {
  const x0 = minX - margin;
  const x1 = maxX + margin;
  const z0 = minZ - margin;
  const z1 = maxZ + margin;
  let ymin = 1e9;
  let ymax = -1e9;
  let n = 0;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
      n++;
    }
  }
  if (n < 10) {
    return { height: 1.5, cy: 0.75, groundY: 0 };
  }
  const groundY = ymin;
  const height = Math.max(0.2, ymax - ymin);
  const cy = groundY + height / 2;
  return { height, cy, groundY };
}

/** Pull box center toward local XY cluster if close enough (reduces floating boxes). */
export function snapCuboidCenterXZ(
  positions: Float32Array,
  cx: number,
  cz: number,
  radius: number,
  snapThreshold: number
): { cx: number; cz: number } {
  let sx = 0;
  let sz = 0;
  let n = 0;
  const r2 = radius * radius;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz <= r2) {
      sx += x;
      sz += z;
      n++;
    }
  }
  if (n < 8) return { cx, cz };
  const tcx = sx / n;
  const tcz = sz / n;
  const dist = Math.hypot(tcx - cx, tcz - cz);
  if (dist < snapThreshold) return { cx: tcx, cz: tcz };
  return { cx, cz };
}
