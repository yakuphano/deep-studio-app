/**
 * BEV (kuşbakışı) görüntüsünden yüksek çözünürlüklü nokta bulutu.
 */
import { blendElevationWithRgb, colorsFromElevation } from '@/lib/lidar/pointCloudElevationColor';

export type BevPointCloudMeta = {
  worldWidth: number;
  worldDepth: number;
  sampleWidth: number;
  sampleHeight: number;
  pointCount: number;
};

const DEFAULT_MAX_POINTS = 140_000;
const MAX_SAMPLE_EDGE = 1536;

export async function bevImageUrlToPointCloud(
  imageUrl: string,
  options?: { maxPoints?: number; worldWidth?: number; worldDepth?: number; maxHeight?: number }
): Promise<{
  positions: Float32Array;
  colors: Float32Array;
  meta: BevPointCloudMeta;
}> {
  if (typeof document === 'undefined') {
    const s = syntheticUrbanStrip();
    return {
      ...s,
      meta: {
        worldWidth: 48,
        worldDepth: 48,
        sampleWidth: 0,
        sampleHeight: 0,
        pointCount: s.positions.length / 3,
      },
    };
  }

  const maxPoints = options?.maxPoints ?? DEFAULT_MAX_POINTS;
  const worldW = options?.worldWidth ?? 48;
  const worldD = options?.worldDepth ?? 48;
  const maxH = options?.maxHeight ?? 8;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görüntü yüklenemedi'));
    img.src = imageUrl;
  });

  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(nw, nh));
  const sampleW = Math.max(1, Math.round(nw * scale));
  const sampleH = Math.max(1, Math.round(nh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const step = Math.max(1, Math.floor((sampleW * sampleH) / maxPoints));
  const pts: number[] = [];
  const imgRgb: number[] = [];

  for (let j = 0; j < sampleH; j += 1) {
    for (let i = 0; i < sampleW; i += 1) {
      if ((i + j * sampleW) % step !== 0) continue;
      const o = (j * sampleW + i) * 4;
      const r = data[o] / 255;
      const g = data[o + 1] / 255;
      const b = data[o + 2] / 255;
      const a = data[o + 3] / 255;
      if (a < 0.12) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 0.04) continue;

      const u = i / (sampleW - 1) - 0.5;
      const v = j / (sampleH - 1) - 0.5;
      const x = u * worldW;
      const z = v * worldD;
      const y = Math.min(maxH, Math.pow(lum, 1.08) * maxH * 0.94 + 0.02);

      pts.push(x, y, z);
      imgRgb.push(r, g, b);
    }
  }

  if (pts.length < 300) {
    const s = syntheticUrbanStrip();
    return {
      ...s,
      meta: {
        worldWidth: worldW,
        worldDepth: worldD,
        sampleWidth: sampleW,
        sampleHeight: sampleH,
        pointCount: s.positions.length / 3,
      },
    };
  }

  const positions = new Float32Array(pts);
  const imgColors = new Float32Array(imgRgb);
  const colors = blendElevationWithRgb(positions, imgColors, 0.72);

  return {
    positions,
    colors,
    meta: {
      worldWidth: worldW,
      worldDepth: worldD,
      sampleWidth: sampleW,
      sampleHeight: sampleH,
      pointCount: positions.length / 3,
    },
  };
}

export function syntheticUrbanStrip(): { positions: Float32Array; colors: Float32Array } {
  const pts: number[] = [];
  const lanes = [-12, -4, 4, 12];
  for (const lane of lanes) {
    for (let z = -22; z < 22; z += 0.28) {
      for (let i = 0; i < 4; i++) {
        const x = lane + (Math.random() - 0.5) * 2.2;
        const zz = z + (Math.random() - 0.5) * 0.35;
        const y = Math.random() * 0.12;
        pts.push(x, y, zz);
      }
    }
  }
  for (let k = 0; k < 6000; k++) {
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 44;
    const h = Math.random() * 4;
    pts.push(x, h, z);
  }
  const positions = new Float32Array(pts);
  const colors = colorsFromElevation(positions);
  return { positions, colors };
}
