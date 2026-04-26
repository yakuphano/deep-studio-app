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

/** BEV sahnesi ~48 birim genişlik; kutular nokta ölçeğinde okunaklı olsun */
export function defaultCuboidDimensionsForLabel(label: string): { width: number; height: number; depth: number } {
  const L = label.trim().toLowerCase();
  if (L === 'truck') return { width: 14, height: 4.2, depth: 10 };
  if (L === 'pedestrian') return { width: 1.2, height: 1.85, depth: 1.1 };
  if (L === 'cyclist') return { width: 2, height: 1.95, depth: 2.8 };
  if (L === 'sign') return { width: 4, height: 5, depth: 0.65 };
  if (L === 'other') return { width: 8, height: 3.2, depth: 8 };
  return { width: 9.5, height: 2.35, depth: 5.2 };
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
