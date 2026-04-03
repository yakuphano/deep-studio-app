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
