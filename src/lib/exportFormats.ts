import type { Annotation } from '@/types/annotations';
import { ANNOTATION_LABELS } from '@/constants/annotationLabels';

function labelToClassId(label: string): number {
  const idx = ANNOTATION_LABELS.indexOf(label as typeof ANNOTATION_LABELS[number]);
  return idx >= 0 ? idx : ANNOTATION_LABELS.length;
}

export interface ExportContext {
  annotations: Annotation[];
  imageWidth: number;
  imageHeight: number;
  imageFileName: string;
}

/** YOLO format: normalized 0-1, one line per object. Bbox: class x_center y_center w h. Polygon: class x1 y1 x2 y2 ... */
export function toYOLO(ctx: ExportContext): string {
  const { annotations, imageWidth, imageHeight, imageFileName } = ctx;
  if (imageWidth <= 0 || imageHeight <= 0) return '';
  const lines: string[] = [];
  for (const a of annotations) {
    const cid = labelToClassId(a.label);
    if (a.type === 'bbox') {
      const cx = (a.x + a.width / 2) / imageWidth;
      const cy = (a.y + a.height / 2) / imageHeight;
      const w = a.width / imageWidth;
      const h = a.height / imageHeight;
      lines.push(`${cid} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
    } else if (
      a.type === 'polygon' ||
      a.type === 'polyline' ||
      a.type === 'brush' ||
      a.type === 'semantic' ||
      a.type === 'magic_wand'
    ) {
      if (!a.points?.length) continue;
      const pts = a.points.flatMap((p) => [p.x / imageWidth, p.y / imageHeight]);
      lines.push(`${cid} ${pts.map((v) => v.toFixed(6)).join(' ')}`);
    } else if (a.type === 'cuboid_wire' && a.corners.length === 8) {
      const pts = a.corners.flatMap((p) => [p.x / imageWidth, p.y / imageHeight]);
      lines.push(`${cid} ${pts.map((v) => v.toFixed(6)).join(' ')}`);
    }
  }
  return lines.join('\n');
}

/** COCO instances.json format */
export function toCOCO(ctx: ExportContext): object {
  const { annotations, imageWidth, imageHeight, imageFileName } = ctx;
  const imageId = 1;
  const categories = ANNOTATION_LABELS.map((name, id) => ({ id: id + 1, name, supercategory: 'object' }));
  const cocoImages = [{ id: imageId, file_name: imageFileName, width: imageWidth, height: imageHeight }];
  const cocoAnnotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number];
    segmentation: number[][];
    area: number;
    iscrowd: 0;
  }> = [];
  let annId = 1;
  for (const a of annotations) {
    const cid = labelToClassId(a.label) + 1;
    if (a.type === 'bbox') {
      cocoAnnotations.push({
        id: annId++,
        image_id: imageId,
        category_id: cid,
        bbox: [a.x, a.y, a.width, a.height],
        segmentation: [[a.x, a.y, a.x + a.width, a.y, a.x + a.width, a.y + a.height, a.x, a.y + a.height]],
        area: a.width * a.height,
        iscrowd: 0,
      });
    } else {
      const pts =
        a.type === 'cuboid_wire' && a.corners.length === 8
          ? a.corners
          : a.type === 'polygon' ||
              a.type === 'polyline' ||
              a.type === 'brush' ||
              a.type === 'semantic' ||
              a.type === 'magic_wand'
            ? a.points
            : null;
      if (!pts?.length) continue;
      const flat = pts.flatMap((p) => [p.x, p.y]);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      let area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      area = Math.abs(area) / 2;
      cocoAnnotations.push({
        id: annId++,
        image_id: imageId,
        category_id: cid,
        bbox: [minX, minY, maxX - minX, maxY - minY],
        segmentation: [flat],
        area,
        iscrowd: 0,
      });
    }
  }
  return {
    info: { description: 'Deep Studio Export', version: '1.0' },
    images: cocoImages,
    annotations: cocoAnnotations,
    categories,
  };
}

/** Pascal VOC XML per image */
export function toPascalVOC(ctx: ExportContext): string {
  const { annotations, imageWidth, imageHeight, imageFileName } = ctx;
  const objects = annotations.flatMap((a) => {
    let xmin: number, ymin: number, xmax: number, ymax: number;
    if (a.type === 'bbox') {
      xmin = a.x;
      ymin = a.y;
      xmax = a.x + a.width;
      ymax = a.y + a.height;
    } else {
      const pts =
        a.type === 'cuboid_wire' && a.corners.length === 8
          ? a.corners
          : a.type === 'polygon' ||
              a.type === 'polyline' ||
              a.type === 'brush' ||
              a.type === 'semantic' ||
              a.type === 'magic_wand'
            ? a.points
            : null;
      if (!pts?.length) return [];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      xmin = Math.min(...xs);
      ymin = Math.min(...ys);
      xmax = Math.max(...xs);
      ymax = Math.max(...ys);
    }
    return [`<object>
    <name>${escapeXml(a.label)}</name>
    <bndbox>
      <xmin>${Math.round(xmin)}</xmin>
      <ymin>${Math.round(ymin)}</ymin>
      <xmax>${Math.round(xmax)}</xmax>
      <ymax>${Math.round(ymax)}</ymax>
    </bndbox>
  </object>`];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
  <folder>annotations</folder>
  <filename>${escapeXml(imageFileName)}</filename>
  <path>${escapeXml(imageFileName)}</path>
  <source><database>Deep Studio</database></source>
  <size>
    <width>${imageWidth}</width>
    <height>${imageHeight}</height>
    <depth>3</depth>
  </size>
  <segmented>1</segmented>
${objects.map((o) => '  ' + o.replace(/\n/g, '\n  ')).join('\n')}
</annotation>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
