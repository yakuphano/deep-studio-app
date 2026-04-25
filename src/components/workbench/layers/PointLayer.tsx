import React from 'react';
import { PointAnnotation } from '@/types/annotations';
import { screenConstantRadius } from '@/utils/canvasHelpers';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface PointLayerProps {
  annotation: PointAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  /** false: çizim araçlarındayken SVG tıklaması seçim tetiklemesin (üstteki overlay ile yarışmasın) */
  allowPointerHit?: boolean;
  labelColorOverrides?: Record<string, string>;
}

export const PointLayer: React.FC<PointLayerProps> = ({
  annotation,
  isSelected,
  scale,
  imageToScreen: _imageToScreen,
  onSelect,
  allowPointerHit = true,
  labelColorOverrides,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label, labelColorOverrides);
  const r = screenConstantRadius(scale, isSelected ? 3.5 : 2.8);
  const ring = screenConstantRadius(scale, 5);
  const s = Math.max(scale, 0.08);
  const labelText = String(annotation.label ?? '').trim();
  const badgeLayout = labelText ? getAnnotationLabelBadgeLayout(labelText, scale) : null;

  return (
    <g>
      <circle
        cx={annotation.x}
        cy={annotation.y}
        r={r}
        fill={color}
        stroke="white"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: allowPointerHit ? 'pointer' : 'default', pointerEvents: allowPointerHit ? 'auto' : 'none' }}
        onClick={() => onSelect(annotation.id)}
      />

      {badgeLayout && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={annotation.x}
          topY={annotation.y - ring - 2 / s - badgeLayout.h}
          align="middle"
          fontWeight={isSelected ? '600' : '400'}
        />
      )}

      {isSelected && (
        <circle
          cx={annotation.x}
          cy={annotation.y}
          r={ring}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3,3"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};
