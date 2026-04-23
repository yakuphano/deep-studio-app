/**
 * Klasik sihirli değnek: tohum piksele göre toleranslı flood-fill + dış kontur (Moore).
 * Yalnızca tarayıcı (HTMLImageElement + canvas getImageData); CORS olmayan görüntü gerekir.
 */

export const MAGIC_WAND_DEFAULT_TOLERANCE = 32;
export const MAGIC_WAND_MAX_REGION_PIXELS = 1_200_000;
export const MAGIC_WAND_MIN_FILLED_PIXELS = 8;
/** Kontur sadeleştirme (görüntü uzayı piksel) */
export const MAGIC_WAND_RDP_EPSILON = 1.75;
export const MAGIC_WAND_MAX_CONTOUR_VERTICES = 800;

export function sampleImageRgba(
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): Uint8ClampedArray | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return ctx.getImageData(0, 0, targetW, targetH).data;
  } catch {
    return null;
  }
}

/** Tainted <img> için: CORS izinliyse fetch + ImageBitmap ile piksel oku */
export async function sampleImageRgbaFromUrl(
  url: string,
  targetW: number,
  targetH: number
): Promise<Uint8ClampedArray | null> {
  if (typeof document === 'undefined' || !url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, targetW, targetH);
    bmp.close();
    return ctx.getImageData(0, 0, targetW, targetH).data;
  } catch {
    return null;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 4-yönlü flood fill; mask[y*w+x] ∈ {0,1} */
export function floodFillMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  seedX: number,
  seedY: number,
  tolerance: number,
  maxPixels: number
): Uint8Array | null {
  const ix = Math.floor(clamp(seedX, 0, w - 1));
  const iy = Math.floor(clamp(seedY, 0, h - 1));
  const si = (iy * w + ix) * 4;
  const sr = rgba[si];
  const sg = rgba[si + 1];
  const sb = rgba[si + 2];

  const match = (px: number, py: number): boolean => {
    const i = (py * w + px) * 4;
    return (
      Math.abs(rgba[i] - sr) <= tolerance &&
      Math.abs(rgba[i + 1] - sg) <= tolerance &&
      Math.abs(rgba[i + 2] - sb) <= tolerance
    );
  };

  const mask = new Uint8Array(w * h);
  const qx = new Int32Array(maxPixels + 4);
  const qy = new Int32Array(maxPixels + 4);
  let qt = 0;
  let filled = 0;
  let overflow = false;

  if (!match(ix, iy)) return null;

  qx[qt] = ix;
  qy[qt] = iy;
  qt++;
  mask[iy * w + ix] = 1;
  filled = 1;

  let qh = 0;
  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;

    const tryPush = (nx: number, ny: number) => {
      if (overflow) return;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
      const ii = ny * w + nx;
      if (mask[ii]) return;
      if (!match(nx, ny)) return;
      if (qt >= qx.length - 1) {
        overflow = true;
        return;
      }
      mask[ii] = 1;
      filled++;
      qx[qt] = nx;
      qy[qt] = ny;
      qt++;
    };

    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  if (overflow || filled > maxPixels) return null;
  if (filled < MAGIC_WAND_MIN_FILLED_PIXELS) return null;
  return mask;
}

/**
 * Moore komşuluğu ile dış sınır (mask 1 = dolu). 1 piksel sıfır dolgusu ile güvenli başlangıç.
 * Koordinatlar orijinal (padding’siz) görüntü uzayında.
 */
export function traceMooreContourOuter(mask: Uint8Array, w: number, h: number): { x: number; y: number }[] {
  const pw = w + 2;
  const ph = h + 2;
  const P = (x: number, y: number) => y * pw + x;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) padded[P(x + 1, y + 1)] = 1;
    }
  }

  const filled = (x: number, y: number) => padded[P(x, y)] === 1;

  let sx = -1,
    sy = -1;
  outer: for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      if (filled(x, y) && !filled(x, y - 1)) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx < 0) return [];

  // 0=N, 1=NE, … 7=NW (saat yönü)
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  const contourPad: { x: number; y: number }[] = [];
  let x = sx;
  let y = sy;
  let dir = 7;
  const maxSteps = pw * ph * 16;

  for (let step = 0; step < maxSteps; step++) {
    contourPad.push({ x, y });
    let found = -1;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8;
      const nx = x + dx[nd];
      const ny = y + dy[nd];
      if (filled(nx, ny)) {
        found = nd;
        break;
      }
    }
    if (found < 0) break;
    const nx = x + dx[found];
    const ny = y + dy[found];
    dir = (found + 6) % 8;
    x = nx;
    y = ny;
    if (x === sx && y === sy && contourPad.length > 2) break;
  }

  return contourPad.map((p) => ({ x: p.x - 1, y: p.y - 1 }));
}

function dedupeConsecutive(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const r: { x: number; y: number }[] = [];
  for (const p of pts) {
    const prev = r[r.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) r.push(p);
  }
  return r;
}

function strideAlongContour(
  pts: { x: number; y: number }[],
  maxVertices: number
): { x: number; y: number }[] {
  if (pts.length <= maxVertices) return pts.slice();
  const step = Math.ceil(pts.length / maxVertices);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i += step) out.push({ x: pts[i].x, y: pts[i].y });
  return out;
}

/** Maske → dış kontur (sıralı) → seyreltme → kapalı poligon */
export function maskToContourPolygon(
  mask: Uint8Array,
  w: number,
  h: number,
  _rdpEpsilon = MAGIC_WAND_RDP_EPSILON,
  maxVertices = MAGIC_WAND_MAX_CONTOUR_VERTICES
): { x: number; y: number }[] | null {
  let raw = traceMooreContourOuter(mask, w, h);
  if (raw.length < 3) return null;
  raw = dedupeConsecutive(raw);
  if (raw.length >= 3 && raw[0].x === raw[raw.length - 1].x && raw[0].y === raw[raw.length - 1].y) {
    raw = raw.slice(0, -1);
  }
  if (raw.length < 3) return null;

  let simplified = strideAlongContour(raw, Math.min(maxVertices * 3, 3600));
  simplified = strideAlongContour(simplified, maxVertices);
  if (simplified.length < 3) return null;
  const f = simplified[0];
  const l = simplified[simplified.length - 1];
  if (f.x === l.x && f.y === l.y) simplified = simplified.slice(0, -1);
  return simplified.length >= 3 ? simplified : null;
}

/** Maske sınırlayıcı kutusu (kontur başarısız olursa yedek) */
export function maskToBoundingQuad(
  mask: Uint8Array,
  w: number,
  h: number
): { x: number; y: number }[] | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  if (maxX - minX < 1 || maxY - minY < 1) return null;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function magicWandPolygonFromRgba(
  rgba: Uint8ClampedArray,
  imageW: number,
  imageH: number,
  seedImageX: number,
  seedImageY: number,
  tolerance = MAGIC_WAND_DEFAULT_TOLERANCE
): { x: number; y: number }[] | null {
  const mask = floodFillMask(
    rgba,
    imageW,
    imageH,
    seedImageX,
    seedImageY,
    tolerance,
    MAGIC_WAND_MAX_REGION_PIXELS
  );
  if (!mask) return null;
  const contour = maskToContourPolygon(mask, imageW, imageH);
  if (contour && contour.length >= 3) return contour;
  return maskToBoundingQuad(mask, imageW, imageH);
}

export function magicWandPolygonFromImage(
  img: HTMLImageElement,
  imageW: number,
  imageH: number,
  seedImageX: number,
  seedImageY: number,
  tolerance = MAGIC_WAND_DEFAULT_TOLERANCE
): { x: number; y: number }[] | null {
  const rgba = sampleImageRgba(img, imageW, imageH);
  if (!rgba) return null;
  return magicWandPolygonFromRgba(rgba, imageW, imageH, seedImageX, seedImageY, tolerance);
}

export async function magicWandPolygonFromImageOrUrl(
  img: HTMLImageElement | null,
  imageUrl: string | undefined,
  imageW: number,
  imageH: number,
  seedImageX: number,
  seedImageY: number,
  tolerance = MAGIC_WAND_DEFAULT_TOLERANCE
): Promise<{ x: number; y: number }[] | null> {
  if (img) {
    const fromImg = magicWandPolygonFromImage(img, imageW, imageH, seedImageX, seedImageY, tolerance);
    if (fromImg) return fromImg;
  }
  if (!imageUrl) return null;
  const rgba = await sampleImageRgbaFromUrl(imageUrl, imageW, imageH);
  if (!rgba) return null;
  return magicWandPolygonFromRgba(rgba, imageW, imageH, seedImageX, seedImageY, tolerance);
}
