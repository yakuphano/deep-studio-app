import React from 'react';
import { PolylineAnnotation } from '@/types/annotations';
import { screenConstantRadius } from '@/utils/canvasHelpers';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  annotationLabelToString,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface PolylineLayerProps {
  annotation: PolylineAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  activeTool: string;
}

export const PolylineLayer: React.FC<PolylineLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen: _imageToScreen,
  onSelect,
  activeTool,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label);
  const pr = screenConstantRadius(scale, 3);
  const labelText = annotationLabelToString(annotation.label).trim();
  const badgeLayout =
    labelText && annotation.points.length > 0
      ? getAnnotationLabelBadgeLayout(labelText, scale)
      : null;

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
            strokeWidth={1}
            strokeLinecap="round"
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
          r={pr}
          fill={color}
          stroke="#FFFFFF"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
          }}
        />
      ))}
      
      {badgeLayout && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={annotation.points[0].x + 10}
          topY={annotation.points[0].y - 4 - badgeLayout.h}
          fontWeight="700"
        />
      )}
    </g>
  );
};
