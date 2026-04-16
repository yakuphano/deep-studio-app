import React from 'react';
import { CuboidAnnotation } from '@/types/annotations';

interface CuboidLayerProps {
  annotation: CuboidAnnotation;
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

export const CuboidLayer: React.FC<CuboidLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen,
  onSelect,
  activeTool,
}) => {
  const color = getLabelColor(annotation.label);
  const { x, y, width, height, dx = 0, dy = 0 } = annotation;
  
  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Front face */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
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
      
      {/* Back face */}
      <rect
        x={x + dx}
        y={y + dy}
        width={width}
        height={height}
        stroke={color}
        strokeWidth={2}
        fill={color}
        fillOpacity={0.1}
        style={{
          vectorEffect: 'non-scaling-stroke',
          pointerEvents: 'none',
        }}
      />
      
      {/* Connecting edges */}
      <line 
        x1={x} 
        y1={y} 
        x2={x + dx} 
        y2={y + dy} 
        stroke={color} 
        strokeWidth={2} 
        style={{ vectorEffect: 'non-scaling-stroke' }} 
      />
      <line 
        x1={x + width} 
        y1={y} 
        x2={x + width + dx} 
        y2={y + dy} 
        stroke={color} 
        strokeWidth={2} 
        style={{ vectorEffect: 'non-scaling-stroke' }} 
      />
      <line 
        x1={x + width} 
        y1={y + height} 
        x2={x + width + dx} 
        y2={y + height + dy} 
        stroke={color} 
        strokeWidth={2} 
        style={{ vectorEffect: 'non-scaling-stroke' }} 
      />
      <line 
        x1={x} 
        y1={y + height} 
        x2={x + dx} 
        y2={y + height + dy} 
        stroke={color} 
        strokeWidth={2} 
        style={{ vectorEffect: 'non-scaling-stroke' }} 
      />
      
      {/* Label text near front face */}
      {(() => {
        const labelText =
          typeof annotation.label === 'object'
            ? (annotation.label as any).name ||
              (annotation.label as any).label ||
              ''
            : String(annotation.label ?? '');
        
        return labelText.trim() ? (
          <text
            x={x}
            y={y - 4}
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
