import React from 'react';
import { CuboidAnnotation } from '@/types/annotations';
import { screenConstantRadius } from '@/utils/canvasHelpers';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  annotationLabelToString,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface CuboidLayerProps {
  annotation: CuboidAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  activeTool: string;
}

export const CuboidLayer: React.FC<CuboidLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen: _imageToScreen,
  onSelect,
  activeTool,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label);
  const { x, y, width, height, dx = 0, dy = 0 } = annotation;
  const labelText = annotationLabelToString(annotation.label).trim();
  const badgeLayout = labelText ? getAnnotationLabelBadgeLayout(labelText, scale) : null;
  const hr = screenConstantRadius(scale, 3);

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
          cursor: activeTool === 'pan' || activeTool === 'select' ? 'pointer' : 'default',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(annotation.id);
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
      
      {badgeLayout && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={x}
          topY={y - 4 - badgeLayout.h}
          fontWeight="700"
        />
      )}

      {isSelected && (
        <>
          <circle cx={x} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + width} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + width} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + width / 2} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + width} cy={y + height / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + width / 2} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x} cy={y + height / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          {/* Arka yüz köşeleri: dx/dy ile küp derinliği */}
          <circle cx={x + dx} cy={y + dy} r={hr} fill="#ffffff" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + dx + width} cy={y + dy} r={hr} fill="#ffffff" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + dx + width} cy={y + dy + height} r={hr} fill="#ffffff" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={x + dx} cy={y + dy + height} r={hr} fill="#ffffff" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        </>
      )}
    </g>
  );
};
