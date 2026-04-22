import React from 'react';
import { PolygonAnnotation } from '@/types/annotations';
import { screenConstantRadius } from '@/utils/canvasHelpers';
import { resolveAnnotationLabelColor, hexToRgba } from '@/constants/annotationLabels';
import {
  AnnotationLabelBadge,
  getAnnotationLabelBadgeLayout,
} from './AnnotationLabelBadge';

interface PolygonLayerProps {
  annotation: PolygonAnnotation;
  isSelected: boolean;
  scale: number;
  imageToScreen: (x: number, y: number) => { x: number; y: number };
  onSelect: (id: string) => void;
  /** Dört köşe dikdörtgen: bbox ile aynı 8 tutamaç (görsel; isabet üst katmandan). */
  bboxStyleResizeHandles?: boolean;
}

export const PolygonLayer: React.FC<PolygonLayerProps> = ({
  annotation,
  isSelected,
  scale,
  onSelect,
  bboxStyleResizeHandles = false,
}) => {
  const color = resolveAnnotationLabelColor(annotation.label);
  const fillPoly = hexToRgba(color, isSelected ? 0.14 : 0.08);
  const labelText = String(annotation.label ?? '').trim();
  const badgeLayout =
    labelText && annotation.points.length > 0
      ? getAnnotationLabelBadgeLayout(labelText, scale)
      : null;
  const pointsString = annotation.points.map((p) => `${p.x},${p.y}`).join(' ');
  const vr = screenConstantRadius(scale, 2.6);
  const hr = screenConstantRadius(scale, 3);
  const showBboxHandles =
    Boolean(bboxStyleResizeHandles && isSelected && annotation.points.length === 4);
  let hx = 0,
    hy = 0,
    hw = 0,
    hh = 0;
  if (showBboxHandles) {
    const xs = annotation.points.map((p) => p.x);
    const ys = annotation.points.map((p) => p.y);
    hx = Math.min(...xs);
    hy = Math.min(...ys);
    hw = Math.max(...xs) - hx;
    hh = Math.max(...ys) - hy;
  }

  return (
    <g>
      <polygon
        points={pointsString}
        fill={fillPoly}
        stroke={color}
        strokeWidth={isSelected ? 1.15 : 1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(annotation.id)}
      />

      {badgeLayout && annotation.points.length > 0 && (
        <AnnotationLabelBadge
          labelText={labelText}
          color={color}
          scale={scale}
          anchorX={annotation.points[0].x}
          topY={annotation.points[0].y - 5 / badgeLayout.s - badgeLayout.h}
          fontWeight={isSelected ? '600' : '500'}
        />
      )}

      {!showBboxHandles &&
        annotation.points.map((point, index) => (
          <circle
            key={`vertex-${index}`}
            cx={point.x}
            cy={point.y}
            r={vr}
            fill={color}
            stroke="white"
            strokeWidth={isSelected ? 1.5 : 1}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: 'none' }}
          />
        ))}

      {showBboxHandles && hw >= 1 && hh >= 1 && (
        <>
          <circle cx={hx} cy={hy} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx + hw} cy={hy} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx + hw} cy={hy + hh} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx} cy={hy + hh} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx + hw / 2} cy={hy} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx + hw} cy={hy + hh / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx + hw / 2} cy={hy + hh} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
          <circle cx={hx} cy={hy + hh / 2} r={hr} fill={color} stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
        </>
      )}
    </g>
  );
};
