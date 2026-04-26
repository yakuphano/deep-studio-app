import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';

export type LidarThreeTool = 'orbit' | 'select' | 'add' | 'move' | 'scale';

export type LidarThreeViewProps = {
  positions: Float32Array;
  colors: Float32Array;
  cuboids: LidarCuboidAnnotation[];
  selectedId: string | null;
  tool: LidarThreeTool;
  onSelectCuboid: (id: string | null) => void;
  onAddCuboid: (x: number, z: number) => void;
  /** Web: TransformControls ile taşıma/ölçek sonrası (mouse bırakınca) */
  onCuboidTransform?: (id: string, patch: Partial<LidarCuboidAnnotation>) => void;
};
