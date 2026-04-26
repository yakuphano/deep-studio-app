/**
 * BEV (kuşbakışı) görüntüsünden basit nokta bulutu üretir.
 * Parlaklık → yükseklik eğrisi; LiDAR benzeri sahneler için önizleme / demo.
 */
export async function bevImageUrlToPointCloud(
  imageUrl: string,
  options?: { maxPoints?: number; worldWidth?: number; worldDepth?: number; maxHeight?: number }
): Promise<{ positions: Float32Array; colors: Float32Array }> {
  if (typeof document === 'undefined') {
    return syntheticUrbanStrip();
  }
  const maxPoints = options?.maxPoints ?? 65000;
  const worldW = options?.worldWidth ?? 48;
  const worldD = options?.worldDepth ?? 48;
  const maxH = options?.maxHeight ?? 6;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Görüntü yüklenemedi'));
    img.src = imageUrl;
  });

  const sampleW = Math.min(512, img.naturalWidth);
  const sampleH = Math.min(512, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');
  ctx.drawImage(img, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

  const step = Math.max(1, Math.floor((sampleW * sampleH) / maxPoints));
  const pts: number[] = [];
  const cols: number[] = [];

  for (let j = 0; j < sampleH; j += 1) {
    for (let i = 0; i < sampleW; i += 1) {
      if ((i + j * sampleW) % step !== 0) continue;
      const o = (j * sampleW + i) * 4;
      const r = data[o] / 255;
      const g = data[o + 1] / 255;
      const b = data[o + 2] / 255;
      const a = data[o + 3] / 255;
      if (a < 0.08) continue;
      const lum = 0.21 * r + 0.72 * g + 0.07 * b;
      if (lum < 0.04) continue;

      const u = i / (sampleW - 1) - 0.5;
      const v = j / (sampleH - 1) - 0.5;
      const x = u * worldW;
      const z = v * worldD;
      const y = Math.min(maxH, Math.pow(lum, 1.4) * maxH * 0.85 + 0.05);

      pts.push(x, y, z);
      cols.push(r * 0.4 + 0.2, g * 0.7 + 0.15, b * 0.8 + 0.2);
    }
  }

  if (pts.length < 300) {
    return syntheticUrbanStrip();
  }

  return {
    positions: new Float32Array(pts),
    colors: new Float32Array(cols),
  };
}

/** Yedek sahne — şerit / dağılım noktaları */
export function syntheticUrbanStrip(): { positions: Float32Array; colors: Float32Array } {
  const pts: number[] = [];
  const cols: number[] = [];
  const lanes = [-12, -4, 4, 12];
  for (let lane of lanes) {
    for (let z = -22; z < 22; z += 0.35) {
      for (let i = 0; i < 3; i++) {
        const x = lane + (Math.random() - 0.5) * 2.2;
        const zz = z + (Math.random() - 0.5) * 0.4;
        const y = Math.random() * 0.15;
        pts.push(x, y, zz);
        const c = 0.35 + Math.random() * 0.35;
        cols.push(c * 0.4, c * 0.85, c);
      }
    }
  }
  for (let k = 0; k < 4000; k++) {
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 44;
    const h = Math.random() * 4;
    pts.push(x, h, z);
    cols.push(0.2 + h * 0.15, 0.75, 0.35 + h * 0.08);
  }
  return { positions: new Float32Array(pts), colors: new Float32Array(cols) };
}
