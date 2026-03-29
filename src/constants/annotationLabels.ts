export const ANNOTATION_LABELS = ['Car', 'Person', 'Cat', 'Dog', 'Bicycle', 'Motorcycle', 'Bus', 'Truck', 'Other'] as const;
export const LABEL_COLORS: Record<string, string> = {
  'Car': '#ef4444',         // kırmızı
  'Person': '#6b7280',      // gri
  'Cat': '#eab308',         // sarı
  'Dog': '#f97316',         // turuncu
  'Bicycle': '#3b82f6',     // mavi
  'Motorcycle': '#8b5cf6',  // mor
  'Bus': '#06b6d4',         // cyan
  'Truck': '#10b981',       // yeşil
  'Other': '#94a3b8',       // açık gri
};
