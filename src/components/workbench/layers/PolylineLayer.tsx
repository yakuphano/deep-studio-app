import React from 'react';
import { PolylineAnnotation } from '@/types/annotations';

interface PolylineLayerProps {
  annotation: PolylineAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  activeTool: string;
}

// Get color for label with fallback - preserve purple styling
const getLabelColor = (label: string | any): string => {
  const labelStr = typeof label === 'object'
    ? (label as any).name || (label as any).label || ''
    : String(label ?? '');
  return '#94a3b8';
};

export const PolylineLayer: React.FC<PolylineLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect,
  activeTool,
}) => {
  const color = getLabelColor(annotation.label);
  
  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Draw lines between points */}
      {annotation.points.map((point, index) => {
        if (index === 0) return null;
        const prevPoint = annotation.points[index - 1];
        return (
          <line
            key={`polyline-line-${index}`}
            x1={prevPoint.x}
            y1={prevPoint.y}
            x2={point.x}
            y2={point.y}
            stroke={color}
            strokeWidth={3}
            style={{
              vectorEffect: 'non-scaling-stroke',
            }}
          />
        );
      })}
      
      {/* Draw points */}
      {annotation.points.map((point, index) => (
        <circle
          key={`polyline-point-${index}`}
          cx={point.x}
          cy={point.y}
          r={11}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          style={{
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
          }}
        />
      ))}
      
      {/* Label text near first point */}
      {(() => {
        const labelText =
          typeof annotation.label === 'object'
            ? (annotation.label as any).name ||
              (annotation.label as any).label ||
              ''
            : String(annotation.label ?? '');
        
        return labelText.trim() ? (
          <text
            x={annotation.points[0].x + 12}
            y={annotation.points[0].y - 4}
            fill="#FFFFFF"
            fontSize={12 / scale}
            fontWeight="bold"
            style={{
              pointerEvents: 'none',
            }}
          >
            {labelText}
          </text>
        ) : null;
      })()}
    </g>
  );
};
