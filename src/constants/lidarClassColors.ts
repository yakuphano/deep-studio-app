/** LiDAR 3D box fill colors (hex) — semi-transparent mesh uses these in the viewer */
export const LIDAR_CLASS_COLOR_HEX: Record<string, number> = {
  car: 0x3b82f6,
  truck: 0xf97316,
  pedestrian: 0x22c55e,
  cyclist: 0xa855f7,
  sign: 0xeab308,
  other: 0x94a3b8,
};

export function lidarClassColorHex(label: string): number {
  const k = label.trim().toLowerCase();
  return LIDAR_CLASS_COLOR_HEX[k] ?? LIDAR_CLASS_COLOR_HEX.other;
}
