import React from 'react';
import { EllipseAnnotation } from '@/types/annotations';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  annotationLabelToString,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface EllipseLayerProps {
  annotation: EllipseAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  activeTool: string;
  labelColorOverrides?: Record<string, string>;
}

export const EllipseLayer: React.FC<EllipseLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen: _imageToScreen,
  onSelect,
  activeTool,
  labelColorOverrides,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label, labelColorOverrides);
  const labelText = annotationLabelToString(annotation.label).trim();
  const badgeLayout = labelText ? getAnnotationLabelBadgeLayout(labelText, scale) : null;

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
          if (activeTool === 'pan' || activeTool === 'select') {
            onSelect(annotation.id);
          }
        }}
      />
      
      {badgeLayout && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={annotation.cx - annotation.rx + 4}
          topY={annotation.cy - annotation.ry - 4 - badgeLayout.h}
          fontWeight="700"
        />
      )}
    </g>
  );
};
