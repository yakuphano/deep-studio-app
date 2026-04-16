import React from 'react';
import { BboxAnnotation } from '@/types/annotations';

interface BboxLayerProps {
  annotation: BboxAnnotation;
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

export const BboxLayer: React.FC<BboxLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect
}) => {
  const screen = imageToScreen(annotation.x, annotation.y);
  const screenWidth = annotation.width * scale;
  const screenHeight = annotation.height * scale;

  return (
    <g>
      {/* Main bbox rectangle */}
      <rect
        x={screen.x}
        y={screen.y}
        width={screenWidth}
        height={screenHeight}
        fill={isSelected ? 'rgba(124, 58, 237, 0.1)' : 'rgba(148, 163, 184, 0.1)'}
        stroke={isSelected ? '#7c3aed' : '#94a3b8'}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? '5,5' : 'none'}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />
      
      {/* Label */}
      <text
        x={screen.x}
        y={screen.y - 5}
        fill={isSelected ? '#7c3aed' : '#94a3b8'}
        fontSize={12}
        fontWeight={isSelected ? '600' : '400'}
        style={{ pointerEvents: 'none' }}
      >
        {annotation.label}
      </text>
      
      {/* Resize handles for selected bbox */}
      {isSelected && (
        <>
          {/* Corner handles */}
          <circle
            cx={screen.x}
            cy={screen.y}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'nw-resize' }}
          />
          <circle
            cx={screen.x + screenWidth}
            cy={screen.y}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'ne-resize' }}
          />
          <circle
            cx={screen.x + screenWidth}
            cy={screen.y + screenHeight}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'se-resize' }}
          />
          <circle
            cx={screen.x}
            cy={screen.y + screenHeight}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'sw-resize' }}
          />
          
          {/* Edge handles */}
          <circle
            cx={screen.x + screenWidth / 2}
            cy={screen.y}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'n-resize' }}
          />
          <circle
            cx={screen.x + screenWidth}
            cy={screen.y + screenHeight / 2}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'e-resize' }}
          />
          <circle
            cx={screen.x + screenWidth / 2}
            cy={screen.y + screenHeight}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 's-resize' }}
          />
          <circle
            cx={screen.x}
            cy={screen.y + screenHeight / 2}
            r={4}
            fill="#7c3aed"
            stroke="white"
            strokeWidth={1}
            style={{ cursor: 'w-resize' }}
          />
        </>
      )}
    </g>
  );
};
