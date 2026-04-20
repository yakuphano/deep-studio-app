import React from 'react';
import { PolygonAnnotation } from '@/types/annotations';

interface PolygonLayerProps {
  annotation: PolygonAnnotation;
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

export const PolygonLayer: React.FC<PolygonLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect
}) => {
  // Convert polygon points to screen coordinates
  const screenPoints = annotation.points.map(point => 
    imageToScreen(point.x, point.y)
  );

  // Create polygon points string for SVG
  const pointsString = screenPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <g>
      {/* Main polygon */}
      <polygon
        points={pointsString}
        fill={isSelected ? 'rgba(124, 58, 237, 0.1)' : 'rgba(148, 163, 184, 0.1)'}
        stroke={isSelected ? '#7c3aed' : '#94a3b8'}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? '5,5' : 'none'}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />
      
      {/* Label at first point */}
      {screenPoints.length > 0 && (
        <text
          x={screenPoints[0].x}
          y={screenPoints[0].y - 5}
          fill={isSelected ? '#7c3aed' : '#94a3b8'}
          fontSize={12}
          fontWeight={isSelected ? '600' : '400'}
          style={{ pointerEvents: 'none' }}
        >
          {annotation.label}
        </text>
      )}
      
      {/* Vertex points for selected polygon */}
      {isSelected && screenPoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={4}
          fill="#7c3aed"
          stroke="white"
          strokeWidth={1}
          style={{ cursor: 'pointer' }}
        />
      ))}
    </g>
  );
};
