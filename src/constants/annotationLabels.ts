export const ANNOTATION_LABELS = [
  'Car', 'Person', 'Cat', 'Dog', 'Bicycle', 'Motorcycle', 'Bus', 'Truck', 'Other',
  // Traffic related labels
  'Traffic Light', 'Stop Sign', 'Speed Limit', 'Crosswalk', 'Road Sign', 'Pedestrian',
  'Light Post', 'Traffic Sign'
] as const;

export const LABEL_COLORS: Record<string, string> = {
  'Car': '#ef4444',         // red
  'Person': '#6b7280',      // gray
  'Cat': '#eab308',         // yellow
  'Dog': '#f97316',         // orange
  'Bicycle': '#3b82f6',     // blue
  'Motorcycle': '#8b5cf6',  // purple
  'Bus': '#06b6d4',         // cyan
  'Truck': '#10b981',       // green
  'Other': '#94a3b8',       // light gray
  // Traffic related colors
  'Traffic Light': '#ff0000',        // bright red
  'Stop Sign': '#dc2626',             // dark red
  'Speed Limit': '#3b82f6',          // blue
  'Crosswalk': '#f97316',            // orange
  'Road Sign': '#10b981',            // green
  'Pedestrian': '#8b5cf6',           // purple
  'Light Post': '#64748b',           // dark gray
  'Traffic Sign': '#f59e0b',         // amber
};

/** Etiket metninden LABEL_COLORS anahtarına çözümler (ObjectList ile aynı palet) */
export function resolveAnnotationLabelColor(label: unknown): string {
  const labelStr =
    typeof label === 'object' && label !== null
      ? String((label as any).name ?? (label as any).label ?? '').trim()
      : String(label ?? '').trim();
  if (labelStr && LABEL_COLORS[labelStr]) return LABEL_COLORS[labelStr];
  return LABEL_COLORS['Other'];
}

/** #rrggbb → rgba (SVG fill için) */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
