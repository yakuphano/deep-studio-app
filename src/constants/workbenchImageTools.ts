import type { Tool } from '@/types/annotations';

/** Tuval araçları (undo/select hariç) — tek kaynak */
export type WorkbenchDrawingToolId = Exclude<Tool, 'undo' | 'select'>;

export type WorkbenchImageToolMeta = {
  icon: string;
  label: string;
  hint?: string;
};

export const WORKBENCH_IMAGE_TOOL_META: Record<WorkbenchDrawingToolId, WorkbenchImageToolMeta> = {
  pan: { icon: 'hand-right-outline', label: 'Pan', hint: 'Shift+sürükle: tüm nesneleri taşı' },
  bbox: { icon: 'square-outline', label: 'Bounding Box' },
  polygon: { icon: 'git-merge-outline', label: 'Polygon' },
  points: { icon: 'radio-button-off-outline', label: 'Points' },
  ellipse: { icon: 'ellipse-outline', label: 'Ellipse' },
  cuboid: { icon: 'cube-outline', label: 'Cuboid' },
  cuboid_wire: {
    icon: 'git-network-outline',
    label: 'Cuboid wire',
    hint: '8 tık: ön yüz 1–4, arka yüz 5–8 (aynı sıra ile eşleşir)',
  },
  polyline: { icon: 'create-outline', label: 'Polyline' },
  semantic: {
    icon: 'color-filter-outline',
    label: 'Semantic',
    hint: 'Sürükleyerek dikdörtgen bölge; sol etiket sınıfı.',
  },
  brush: { icon: 'brush-outline', label: 'Brush' },
  eraser: {
    icon: 'remove-outline',
    label: 'Eraser',
    hint: 'Sürükle: fırça gibi iz boyunca boyayı kaldırır; değen tüm fırça vuruşlarına uygulanır.',
  },
  magic_wand: {
    icon: 'sparkles',
    label: 'Magic Wand',
    hint: 'Click a region to select similarly colored pixels (tolerance). Remote images need CORS for pixel read.',
  },
};

/**
 * Sol panel: Pan + Center ayrı satırda; Undo ikinci satırda (WorkbenchImageToolRail).
 * Burada yalnızca çizim araçları — Brush en altta tek satır.
 */
export const WORKBENCH_IMAGE_TOOL_ROWS: { left: WorkbenchDrawingToolId; right: WorkbenchDrawingToolId | null }[] = [
  { left: 'bbox', right: 'polygon' },
  { left: 'points', right: 'ellipse' },
  { left: 'cuboid', right: 'polyline' },
  { left: 'semantic', right: 'magic_wand' },
  { left: 'cuboid_wire', right: null },
  { left: 'brush', right: 'eraser' },
];
