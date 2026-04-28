/**
 * LiDAR point cloud CPU helpers: bounds, intensity proxy, classic PointsMaterial buffers.
 */

export function computeHeightBounds(positions: Float32Array): { min: number; max: number } {
  let minY = 1e9;
  let maxY = -1e9;
  const n = positions.length / 3;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (minY >= maxY) {
    return { min: 0, max: 1 };
  }
  return { min: minY, max: maxY };
}

/** Per-point normalized intensity proxy from vertex color (LiDAR return strength surrogate). */
export function computeIntensityFromColors(colors: Float32Array): Float32Array {
  const n = colors.length / 3;
  const raw = new Float32Array(n);
  let lo = 1e9;
  let hi = -1e9;
  for (let i = 0; i < n; i++) {
    const r = colors[i * 3];
    const g = colors[i * 3 + 1];
    const b = colors[i * 3 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    raw[i] = lum;
    lo = Math.min(lo, lum);
    hi = Math.max(hi, lum);
  }
  const out = new Float32Array(n);
  const d = hi - lo || 1;
  for (let i = 0; i < n; i++) {
    out[i] = (raw[i] - lo) / d;
  }
  return out;
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Same ramp as the old shader height colormap. */
export function heightToRgb(y: number, hMin: number, hMax: number): { r: number; g: number; b: number } {
  const t = Math.min(1, Math.max(0, (y - hMin) / Math.max(hMax - hMin, 1e-4)));
  const low = { r: 0.42, g: 0.22, b: 0.68 };
  const mid = { r: 0.08, g: 0.72, b: 0.78 };
  const high = { r: 0.98, g: 0.95, b: 0.72 };
  if (t < 0.45) return mixRgb(low, mid, t / 0.45);
  return mixRgb(mid, high, (t - 0.45) / 0.55);
}

/** Same ramp as the old shader intensity colormap. */
export function intensityToRgb(s: number): { r: number; g: number; b: number } {
  const lo = { r: 0.04, g: 0.07, b: 0.18 };
  const hi = { r: 1.0, g: 0.55, b: 0.15 };
  const t = Math.min(1, Math.max(0, s));
  return mixRgb(lo, hi, t);
}

/**
 * Subsampled positions + per-vertex RGB for THREE.PointsMaterial (vertexColors).
 * Classic LiDAR look: small round points, no custom shader.
 */
/** Cap drawn points for smooth orbit / pan on large clouds (stride grows if needed). */
const MAX_DRAWN_POINTS = 320_000;

export function buildClassicPointCloudBuffers(
  positions: Float32Array,
  colors: Float32Array,
  density: number,
  mode: 'height' | 'intensity'
): { positions: Float32Array; vertexColors: Float32Array } {
  const d = Math.min(1, Math.max(0.25, density));
  let stride = Math.max(1, Math.ceil(1 / d));
  const n = positions.length / 3;
  const projected = Math.ceil(n / stride);
  if (projected > MAX_DRAWN_POINTS) {
    stride = Math.ceil(n / MAX_DRAWN_POINTS);
  }
  const outCount = Math.ceil(n / stride);
  const p = new Float32Array(outCount * 3);
  const vertexColors = new Float32Array(outCount * 3);
  const { min: hMin, max: hMax } = computeHeightBounds(positions);
  const intensityFull = computeIntensityFromColors(colors);
  let j = 0;
  for (let i = 0; i < n; i += stride) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    p[j * 3] = x;
    p[j * 3 + 1] = y;
    p[j * 3 + 2] = z;
    const rgb =
      mode === 'intensity'
        ? intensityToRgb(intensityFull[i] ?? 0.5)
        : heightToRgb(y, hMin, hMax);
    vertexColors[j * 3] = rgb.r;
    vertexColors[j * 3 + 1] = rgb.g;
    vertexColors[j * 3 + 2] = rgb.b;
    j++;
  }
  return {
    positions: p.subarray(0, j * 3),
    vertexColors: vertexColors.subarray(0, j * 3),
  };
}
