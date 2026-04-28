import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';

export type LidarThreeTool = 'select' | 'create' | 'delete';

export type LidarGizmoMode = 'translate' | 'rotate' | 'scale';

export type LidarPointColorMode = 'height' | 'intensity';

export type LidarBoxFootprint = {
  cx: number;
  cz: number;
  width: number;
  depth: number;
};

export type LidarThreeViewProps = {
  positions: Float32Array;
  colors: Float32Array;
  cuboids: LidarCuboidAnnotation[];
  selectedId: string | null;
  hoveredId?: string | null;
  tool: LidarThreeTool;
  gizmoMode: LidarGizmoMode;
  pointColorMode?: LidarPointColorMode;
  pointDensity?: number;
  focusRequestId?: number;
  resetCameraRequestId?: number;
  onSelectCuboid: (id: string | null) => void;
  onHoverCuboid?: (id: string | null) => void;
  /** B tool: drag on ground to define footprint (XZ) */
  onCreateBoxFootprint: (bounds: LidarBoxFootprint) => void;
  onDeleteCuboid?: (id: string) => void;
  onCuboidTransform?: (id: string, patch: Partial<LidarCuboidAnnotation>) => void;
};
