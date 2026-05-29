export type LidarBevImageViewerProps = {
  imageUrl: string;
  worldWidth: number;
  worldDepth: number;
  cuboids: import('@/types/lidarAnnotation').LidarCuboidAnnotation[];
  selectedId: string | null;
  hoveredId?: string | null;
  fitViewRequestId?: number;
};

export default function LidarBevImageViewer(_props: LidarBevImageViewerProps) {
  return null;
}
