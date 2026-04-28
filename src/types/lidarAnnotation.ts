/** LiDAR 3B cuboid — merkez, yarı eksenler (scale), Y ekseni etrafında yaw (radyan) */
export type LidarCuboidAnnotation = {
  id: string;
  label: string;
  /** İsteğe bağlı liste adı (boşsa sınıf + sıra gösterilir) */
  name?: string;
  /** merkez dünya koordinatı */
  cx: number;
  cy: number;
  cz: number;
  /** tam boyutlar (width=X, height=Y, depth=Z) */
  width: number;
  height: number;
  depth: number;
  yaw: number;
};

/**
 * Default box sizes (width=X, height=Y, depth=Z / BEV length on Z).
 * Car / pedestrian / cyclist tuned for autonomous-driving style labels.
 */
export function defaultCuboidDimensionsForLabel(label: string): { width: number; height: number; depth: number } {
  const L = label.trim().toLowerCase();
  if (L === 'car') return { width: 1.8, height: 1.6, depth: 4.2 };
  if (L === 'truck') return { width: 2.6, height: 3.2, depth: 12 };
  if (L === 'pedestrian') return { width: 0.8, height: 1.7, depth: 0.8 };
  if (L === 'cyclist') return { width: 0.6, height: 1.6, depth: 1.8 };
  if (L === 'sign') return { width: 0.65, height: 5, depth: 4 };
  if (L === 'other') return { width: 2, height: 2, depth: 4 };
  return { width: 1.8, height: 1.6, depth: 4.2 };
}

export function createEmptyLidarCuboid(label = 'Car'): LidarCuboidAnnotation {
  const { width, height, depth } = defaultCuboidDimensionsForLabel(label);
  return {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    label,
    name: '',
    cx: 0,
    cy: height / 2,
    cz: 0,
    width,
    height,
    depth,
    yaw: 0,
  };
}
