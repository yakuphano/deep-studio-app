import React from 'react';

const MIN_SCALE = 0.08;

export function annotationLabelToString(label: unknown): string {
  if (label == null) return '';
  if (typeof label === 'object') {
    const o = label as { name?: unknown; label?: unknown };
    const n = o.name ?? o.label;
    if (typeof n === 'string') return n;
  }
  return String(label);
}

export function getAnnotationLabelBadgeLayout(labelText: string, scale: number) {
  const s = Math.max(scale, MIN_SCALE);
  const fontSize = 11 / s;
  const padX = 5 / s;
  const padY = 3 / s;
  const rx = 4 / s;
  const charW = fontSize * 0.55;
  const w = Math.max(labelText.length * charW + padX * 2, fontSize * 2.4);
  const h = fontSize * 1.32 + padY * 2;
  return { w, h, fontSize, padX, padY, rx, s };
}

type Align = 'start' | 'middle' | 'end';

interface AnnotationLabelBadgeProps {
  labelText: string;
  color: string;
  scale: number;
  anchorX: number;
  topY: number;
  align?: Align;
  fontWeight?: string;
}

export function AnnotationLabelBadge({
  labelText,
  color,
  scale,
  anchorX,
  topY,
  align = 'start',
  fontWeight = '600',
}: AnnotationLabelBadgeProps) {
  const t = labelText.trim();
  if (!t) return null;
  const { w, h, fontSize, padX, padY, rx } = getAnnotationLabelBadgeLayout(t, scale);
  let rectX = anchorX;
  if (align === 'middle') rectX = anchorX - w / 2;
  if (align === 'end') rectX = anchorX - w;
  const textX = rectX + padX;
  const textY = topY + h - padY - fontSize * 0.22;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={rectX} y={topY} width={w} height={h} rx={rx} ry={rx} fill={color} />
      <text
        x={textX}
        y={textY}
        fill="#FFFFFF"
        fontSize={fontSize}
        fontWeight={fontWeight}
        style={{ pointerEvents: 'none' }}
      >
        {t}
      </text>
    </g>
  );
}
