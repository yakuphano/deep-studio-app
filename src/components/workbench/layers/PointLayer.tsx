import React from 'react';
import { PointAnnotation } from '@/types/annotations';

interface PointLayerProps {
  annotation: PointAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
}

// Get color for label with fallback - preserve purple styling
const getLabelColor = (label: string | any): string => {
  const labelStr = typeof label === 'object'
    ? (label as any).name || (label as any).label || ''
    : String(label ?? '');
  return '#94a3b8';
};

export const PointLayer: React.FC<PointLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect
}) => {
  const screen = imageToScreen(annotation.x, annotation.y);

  return (
    <g>
      {/* Main point circle */}
      <circle
        cx={screen.x}
        cy={screen.y}
        r={isSelected ? 6 : 4}
        fill={isSelected ? '#7c3aed' : '#94a3b8'}
        stroke="white"
        strokeWidth={isSelected ? 2 : 1}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />
      
      {/* Label */}
      <text
        x={screen.x}
        y={screen.y - 10}
        fill={isSelected ? '#7c3aed' : '#94a3b8'}
        fontSize={12}
        fontWeight={isSelected ? '600' : '400'}
        style={{ pointerEvents: 'none' }}
        textAnchor="middle"
      >
        {annotation.label}
      </text>
      
      {/* Selection indicator */}
      {isSelected && (
        <circle
          cx={screen.x}
          cy={screen.y}
          r={10}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={2}
          strokeDasharray="3,3"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};
