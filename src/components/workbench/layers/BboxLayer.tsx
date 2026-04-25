import React from 'react';
import { BboxAnnotation } from '@/types/annotations';
import { screenConstantRadius } from '@/utils/canvasHelpers';
import { resolveAnnotationLabelColor, hexToRgba } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface BboxLayerProps {
  annotation: BboxAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  labelColorOverrides?: Record<string, string>;
}

/**
 * Koordinatlar görüntü piksel uzayında: üst SVG zaten translate+scale uyguluyor;
 * imageToScreen kullanmak çift dönüşüm yapıyordu.
 */
export const BboxLayer: React.FC<BboxLayerProps> = ({
  annotation,
  isSelected,
  scale,
  onSelect,
  labelColorOverrides,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label, labelColorOverrides);
  const { x, y, width, height } = annotation;
  const labelText = String(annotation.label ?? '').trim();
  const badgeLayout = labelText ? getAnnotationLabelBadgeLayout(labelText, scale) : null;
  const hr = screenConstantRadius(scale, 3);
  const fillColor = hexToRgba(color, isSelected ? 0.14 : 0.08);

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fillColor}
        stroke={color}
        strokeWidth={isSelected ? 1.25 : 1}
        strokeDasharray={isSelected ? '4,3' : 'none'}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />

      {badgeLayout && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={x}
          topY={y - 5 / badgeLayout.s - badgeLayout.h}
          fontWeight={isSelected ? '600' : '500'}
        />
      )}

      {isSelected && (
        <>
          <circle cx={x} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'nw-resize' }} />
          <circle cx={x + width} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'ne-resize' }} />
          <circle cx={x + width} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'se-resize' }} />
          <circle cx={x} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'sw-resize' }} />
          <circle cx={x + width / 2} cy={y} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'n-resize' }} />
          <circle cx={x + width} cy={y + height / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'e-resize' }} />
          <circle cx={x + width / 2} cy={y + height} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 's-resize' }} />
          <circle cx={x} cy={y + height / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: 'w-resize' }} />
        </>
      )}
    </g>
  );
};
