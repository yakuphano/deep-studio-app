import React from 'react';
import { EllipseAnnotation } from '@/types/annotations';

interface EllipseLayerProps {
  annotation: EllipseAnnotation;
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

export const EllipseLayer: React.FC<EllipseLayerProps> = ({
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
      <ellipse
        cx={annotation.cx}
        cy={annotation.cy}
        rx={annotation.rx}
        ry={annotation.ry}
        stroke={color}
        strokeWidth={3}
        fill="transparent"
        style={{
          vectorEffect: 'non-scaling-stroke',
          pointerEvents: 'auto',
          cursor: activeTool === 'select' ? 'move' : 'default',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (activeTool !== 'pan') {
            onSelect(annotation.id);
          }
        }}
      />
      
      {/* Label text near ellipse */}
      {(() => {
        const labelText =
          typeof annotation.label === 'object'
            ? (annotation.label as any).name ||
              (annotation.label as any).label ||
              ''
            : String(annotation.label ?? '');
        
        return labelText.trim() ? (
          <text
            x={annotation.cx - annotation.rx + 4}
            y={annotation.cy - annotation.ry - 4}
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
