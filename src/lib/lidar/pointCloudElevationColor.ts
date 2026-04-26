/**
 * Yükseklik (Y) tabanlı renk — otomotiv LiDAR görüntüleyicilerindeki gibi
 * alçak = mor/mavi, orta = turkuaz/yeşil, yüksek = sarı/beyaz (yüksek kontrast).
 */
export function elevationColormapRgb(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  let r: number;
  let g: number;
  let b: number;
  if (x < 0.2) {
    const u = x / 0.2;
    r = 0.08 + u * 0.12;
    g = 0.02 + u * 0.2;
    b = 0.35 + u * 0.45;
  } else if (x < 0.45) {
    const u = (x - 0.2) / 0.25;
    r = 0.2 + u * 0.05;
    g = 0.22 + u * 0.55;
    b = 0.8 - u * 0.25;
  } else if (x < 0.7) {
    const u = (x - 0.45) / 0.25;
    r = 0.25 + u * 0.45;
    g = 0.77 + u * 0.15;
    b = 0.55 - u * 0.35;
  } else {
    const u = (x - 0.7) / 0.3;
    r = 0.7 + u * 0.3;
    g = 0.92 + u * 0.08;
    b = 0.2 + u * 0.78;
  }
  return [r, g, b];
}

/** positions xyz… üzerinden Y min/max ile vertex renkleri üretir */
export function colorsFromElevation(positions: Float32Array): Float32Array {
  const n = Math.floor(positions.length / 3);
  if (n === 0) return new Float32Array(0);
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const span = yMax - yMin || 1;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1];
    const t = (y - yMin) / span;
    const [r, g, b] = elevationColormapRgb(Math.pow(t, 0.85));
    const o = i * 3;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
  }
  return colors;
}

/** Yükseklik rengi + hafif orijinal RGB (0–1) karışımı — BEV’de yapı okunaklılığı */
export function blendElevationWithRgb(
  positions: Float32Array,
  rgb: Float32Array,
  elevationWeight = 0.82
): Float32Array {
  const elev = colorsFromElevation(positions);
  const n = Math.floor(positions.length / 3);
  const w = Math.max(0, Math.min(1, elevationWeight));
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const e = elev[i] ?? 0;
    const c = rgb[i] ?? 0;
    out[i] = e * w + c * (1 - w);
  }
  return out;
}
