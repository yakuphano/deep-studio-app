/**
 * BEV (kuşbakışı) görüntüsünden nokta bulutu üretir.
 * Yükseklik + hafif piksel rengi karışımı ile LiDAR görüntüleyici tarzı kontrast.
 */
import { blendElevationWithRgb, colorsFromElevation } from '@/lib/lidar/pointCloudElevationColor';

export async function bevImageUrlToPointCloud(
  imageUrl: string,
  options?: { maxPoints?: number; worldWidth?: number; worldDepth?: number; maxHeight?: number }
): Promise<{ positions: Float32Array; colors: Float32Array }> {
  if (typeof document === 'undefined') {
    return syntheticUrbanStrip();
  }
  const maxPoints = options?.maxPoints ?? 55000;
  const worldW = options?.worldWidth ?? 48;
  const worldD = options?.worldDepth ?? 48;
  const maxH = options?.maxHeight ?? 8;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görüntü yüklenemedi'));
    img.src = imageUrl;
  });

  const sampleW = Math.min(640, img.naturalWidth);
  const sampleH = Math.min(640, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
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
      if (a < 0.1) continue;
      const lum = 0.21 * r + 0.72 * g + 0.07 * b;
      if (lum < 0.055) continue;

      const u = i / (sampleW - 1) - 0.5;
      const v = j / (sampleH - 1) - 0.5;
      const x = u * worldW;
      const z = v * worldD;
      const y = Math.min(maxH, Math.pow(lum, 1.15) * maxH * 0.92 + 0.04);

      pts.push(x, y, z);
      imgRgb.push(r, g, b);
    }
  }

  if (pts.length < 300) {
    return syntheticUrbanStrip();
  }

  const positions = new Float32Array(pts);
  const imgColors = new Float32Array(imgRgb);
  const colors = blendElevationWithRgb(positions, imgColors, 0.78);

  return { positions, colors };
}

/** Yedek sahne — şerit / dağılım noktaları (yükseklik renk haritası) */
export function syntheticUrbanStrip(): { positions: Float32Array; colors: Float32Array } {
  const pts: number[] = [];
  const lanes = [-12, -4, 4, 12];
  for (const lane of lanes) {
    for (let z = -22; z < 22; z += 0.35) {
      for (let i = 0; i < 3; i++) {
        const x = lane + (Math.random() - 0.5) * 2.2;
        const zz = z + (Math.random() - 0.5) * 0.4;
        const y = Math.random() * 0.15;
        pts.push(x, y, zz);
      }
    }
  }
  for (let k = 0; k < 4000; k++) {
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 44;
    const h = Math.random() * 4;
    pts.push(x, h, z);
  }
  const positions = new Float32Array(pts);
  const colors = colorsFromElevation(positions);
  return { positions, colors };
}
