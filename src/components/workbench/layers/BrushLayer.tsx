import React from 'react';
import { BrushAnnotation } from '@/types/annotations';

interface BrushLayerProps {
  annotation: BrushAnnotation;
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

export const BrushLayer: React.FC<BrushLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect
}) => {
  // Convert brush points to screen coordinates
  const screenPoints = annotation.points.map(point => 
    imageToScreen(point.x, point.y)
  );

  // Create path string for SVG
  if (screenPoints.length === 0) return null;

  const pathData = screenPoints.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    } else {
      return `${path} L ${point.x} ${point.y}`;
    }
  }, '');

  const strokeWidth = annotation.width || 3;

  return (
    <g>
      {/* Main brush stroke */}
      <path
        d={pathData}
        fill="none"
        stroke={annotation.color || '#ff0000'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />
      
      {/* Selection indicator */}
      {isSelected && (
        <>
          {/* Highlight stroke */}
          <path
            d={pathData}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={strokeWidth + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,5"
            style={{ pointerEvents: 'none' }}
          />
          
          {/* Label at first point */}
          <text
            x={screenPoints[0].x}
            y={screenPoints[0].y - 10}
            fill="#7c3aed"
            fontSize={12}
            fontWeight="600"
            style={{ pointerEvents: 'none' }}
          >
            {annotation.label}
          </text>
        </>
      )}
    </g>
  );
};
