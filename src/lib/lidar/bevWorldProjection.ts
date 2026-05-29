import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';
import { lidarClassColorHex } from '@/constants/lidarClassColors';

export type BevViewTransform = { scale: number; offsetX: number; offsetY: number };

export function imagePixelToWorldXz(
  px: number,
  py: number,
  worldWidth: number,
  worldDepth: number,
  imageWidth: number,
  imageHeight: number
): { x: number; z: number } {
  const u = imageWidth > 1 ? px / (imageWidth - 1) : 0.5;
  const v = imageHeight > 1 ? py / (imageHeight - 1) : 0.5;
  return { x: (u - 0.5) * worldWidth, z: (v - 0.5) * worldDepth };
}

export function worldXzToImagePixel(
  x: number,
  z: number,
  worldWidth: number,
  worldDepth: number,
  imageWidth: number,
  imageHeight: number
): { px: number; py: number } {
  const u = worldWidth > 0 ? x / worldWidth + 0.5 : 0.5;
  const v = worldDepth > 0 ? z / worldDepth + 0.5 : 0.5;
  return {
    px: u * Math.max(1, imageWidth - 1),
    py: v * Math.max(1, imageHeight - 1),
  };
}

export function drawCuboidFootprintOnCtx(
  ctx: CanvasRenderingContext2D,
  c: LidarCuboidAnnotation,
  worldWidth: number,
  worldDepth: number,
  imageWidth: number,
  imageHeight: number,
  opts: { selected?: boolean; hovered?: boolean }
) {
  const { px: cx, py: cz } = worldXzToImagePixel(c.cx, c.cz, worldWidth, worldDepth, imageWidth, imageHeight);
  const hw = ((c.width / worldWidth) * Math.max(1, imageWidth - 1)) / 2;
  const hd = ((c.depth / worldDepth) * Math.max(1, imageHeight - 1)) / 2;
  const hex = lidarClassColorHex(c.label);
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const fillA = opts.selected ? 0.38 : opts.hovered ? 0.3 : 0.2;
  ctx.save();
  ctx.translate(cx, cz);
  ctx.rotate(c.yaw);
  ctx.fillStyle = `rgba(${r},${g},${b},${fillA})`;
  ctx.strokeStyle = opts.selected ? '#22d3ee' : opts.hovered ? '#7dd3fc' : `rgb(${r},${g},${b})`;
  ctx.lineWidth = opts.selected ? 2.5 : 1.75;
  ctx.beginPath();
  ctx.rect(-hw, -hd, hw * 2, hd * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Scale so the image fills the panel (cover). Edges may crop; pan/double-click refits. */
export function fitViewToFullImage(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number
): BevViewTransform {
  if (containerW < 8 || containerH < 8 || imgW < 1 || imgH < 1) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const pad = 0;
  const sx = (containerW - pad * 2) / imgW;
  const sy = (containerH - pad * 2) / imgH;
  const s = Math.max(sx, sy);
  const scale = Math.max(0.05, Math.min(s, 64));
  return {
    scale,
    offsetX: (containerW - imgW * scale) / 2,
    offsetY: (containerH - imgH * scale) / 2,
  };
}

export function cuboidImagePixelBounds(
  c: LidarCuboidAnnotation,
  worldWidth: number,
  worldDepth: number,
  imageWidth: number,
  imageHeight: number
): { minPx: number; minPy: number; maxPx: number; maxPy: number } {
  const hw = c.width / 2;
  const hd = c.depth / 2;
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  let minPx = Infinity;
  let minPy = Infinity;
  let maxPx = -Infinity;
  let maxPy = -Infinity;
  for (const [lx, lz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ] as const) {
    const wx = c.cx + lx * cos + lz * sin;
    const wz = c.cz - lx * sin + lz * cos;
    const { px, py } = worldXzToImagePixel(wx, wz, worldWidth, worldDepth, imageWidth, imageHeight);
    minPx = Math.min(minPx, px);
    minPy = Math.min(minPy, py);
    maxPx = Math.max(maxPx, px);
    maxPy = Math.max(maxPy, py);
  }
  return { minPx, minPy, maxPx, maxPy };
}

export function fitViewToImageRect(
  containerW: number,
  containerH: number,
  minPx: number,
  minPy: number,
  maxPx: number,
  maxPy: number
): BevViewTransform {
  const iw = Math.max(maxPx - minPx, 8);
  const ih = Math.max(maxPy - minPy, 8);
  const pad = 4;
  const sx = (containerW - pad * 2) / iw;
  const sy = (containerH - pad * 2) / ih;
  const s = Math.max(sx, sy);
  const scale = Math.max(0.08, Math.min(s, 64));
  return {
    scale,
    offsetX: (containerW - iw * scale) / 2 - minPx * scale,
    offsetY: (containerH - ih * scale) / 2 - minPy * scale,
  };
}
