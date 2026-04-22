import React from 'react';
import { BrushAnnotation } from '@/types/annotations';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  annotationLabelToString,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface BrushLayerProps {
  annotation: BrushAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
}

export const BrushLayer: React.FC<BrushLayerProps> = ({
  annotation,
  isSelected,
  scale,
  onSelect,
}) => {
  if (annotation.points.length === 0) return null;

  const pathData = annotation.points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    return `${path} L ${point.x} ${point.y}`;
  }, '');

  /** Görüntü uzayında kalınlık; CSS scale ile ekranda kabaca sabit kalır */
  const strokeWidth = Math.max(1, (annotation.width || 3) / Math.max(scale, 0.08));
  const labelText = annotationLabelToString(annotation.label).trim();
  const badgeLayout = labelText ? getAnnotationLabelBadgeLayout(labelText, scale) : null;
  const labelColor = resolveAnnotationLabelColor(annotation.label);
  const s = Math.max(scale, 0.08);

  return (
    <g>
      <path
        d={pathData}
        fill="none"
        stroke={annotation.color || '#ff0000'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />

      {isSelected && (
        <>
          <path
            d={pathData}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={strokeWidth + 3 / Math.max(scale, 0.1)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5,5"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'none' }}
          />

          {badgeLayout && (
            <AnnotationLabelBadge
              labelText={labelText}
              color={labelColor}
              scale={scale}
              anchorX={annotation.points[0].x}
              topY={annotation.points[0].y - 10 / s - badgeLayout.h}
              fontWeight="600"
            />
          )}
        </>
      )}
    </g>
  );
};
