import React from 'react';
import type { CuboidWireAnnotation } from '@/types/annotations';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import { screenConstantRadius } from '@/utils/canvasHelpers';

interface CuboidWireLayerProps {
  annotation: CuboidWireAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  activeTool: string;
}

const EDGE_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export const CuboidWireLayer: React.FC<CuboidWireLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen: _imageToScreen,
  onSelect,
  activeTool,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label);
  const c = annotation.corners;
  if (!c || c.length !== 8) return null;

  const strokeW = isSelected ? 2.25 : 1.5;
  const vr = screenConstantRadius(scale, isSelected ? 3 : 2.4);
  const frontFill = `${color}22`;
  const backFill = `${color}18`;

  const frontPath = `M ${c[0].x} ${c[0].y} L ${c[1].x} ${c[1].y} L ${c[2].x} ${c[2].y} L ${c[3].x} ${c[3].y} Z`;
  const backPath = `M ${c[4].x} ${c[4].y} L ${c[5].x} ${c[5].y} L ${c[6].x} ${c[6].y} L ${c[7].x} ${c[7].y} Z`;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <path
        d={frontPath}
        fill={frontFill}
        stroke="none"
        style={{ pointerEvents: 'auto', cursor: activeTool === 'pan' || activeTool === 'select' ? 'pointer' : 'default' }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(annotation.id);
        }}
      />
      <path
        d={backPath}
        fill={backFill}
        stroke="none"
        style={{ pointerEvents: 'auto', cursor: activeTool === 'pan' || activeTool === 'select' ? 'pointer' : 'default' }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(annotation.id);
        }}
      />
      {EDGE_PAIRS.map(([a, b], i) => (
        <line
          key={`e-${i}`}
          x1={c[a].x}
          y1={c[a].y}
          x2={c[b].x}
          y2={c[b].y}
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      ))}
      {isSelected &&
        c.map((pt, i) => (
          <circle
            key={`v-${i}`}
            cx={pt.x}
            cy={pt.y}
            r={vr}
            fill={color}
            stroke="#fff"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'none' }}
          />
        ))}
    </g>
  );
};
