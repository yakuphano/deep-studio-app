/**
 * Admin panel — tamamlanmış görevleri dışa aktarma (audio, image, video, medical, lidar).
 */
import JSZip from 'jszip';
import {
  toYOLO,
  toCOCO,
  toPascalVOC,
  inferImageDimensions,
} from '@/lib/annotationExports';
import { ANNOTATION_LABELS, MEDICAL_ANNOTATION_LABELS } from '@/constants/annotationLabels';
import type { Annotation } from '@/types/annotations';
import type { LidarCuboidAnnotation } from '@/types/lidarAnnotation';
import type { VideoAnnotation } from '@/types/video';

export type ExportTaskType = 'audio' | 'image' | 'video' | 'medical' | 'lidar';
export type ExportFormatKey = 'json' | 'csv' | 'txt' | 'srt' | 'yolo' | 'coco' | 'pascalvoc';

export type ExportTaskRow = {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  language?: string | null;
  category?: string | null;
  type?: string | null;
  audio_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  transcription?: string | null;
  annotation_data?: unknown;
  created_at: string;
  updated_at?: string;
  client_name?: string | null;
  company_name?: string | null;
  assigned_to?: string | null;
  is_pool_task?: boolean | null;
};

const LIDAR_LABELS = ['Car', 'Truck', 'Pedestrian', 'Cyclist', 'Sign', 'Other'] as const;

export function getFormatOptionsForTaskType(
  exportTaskType: ExportTaskType
): { key: ExportFormatKey; label: string }[] {
  if (exportTaskType === 'audio') {
    return [
      { key: 'json', label: 'JSON' },
      { key: 'csv', label: 'CSV' },
      { key: 'txt', label: 'TXT' },
      { key: 'srt', label: 'SRT' },
    ];
  }
  return [
    { key: 'yolo', label: 'YOLO' },
    { key: 'coco', label: 'COCO' },
    { key: 'pascalvoc', label: 'Pascal VOC' },
    { key: 'json', label: 'JSON' },
    { key: 'csv', label: 'CSV' },
    { key: 'txt', label: 'TXT' },
  ];
}

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'task';
}

function parseImageAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a && typeof a === 'object') as Annotation[];
}

function parseLidarCuboids(raw: unknown): LidarCuboidAnnotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof (c as LidarCuboidAnnotation).cx === 'number' &&
      typeof (c as LidarCuboidAnnotation).label === 'string'
  ) as LidarCuboidAnnotation[];
}

function parseVideoFrames(raw: unknown): VideoAnnotation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f) => f && typeof f === 'object' && Array.isArray((f as VideoAnnotation).annotations)
  ) as VideoAnnotation[];
}

function labelListForTaskType(taskType: ExportTaskType): readonly string[] {
  if (taskType === 'medical') return MEDICAL_ANNOTATION_LABELS;
  if (taskType === 'lidar') return LIDAR_LABELS;
  return ANNOTATION_LABELS;
}

function lidarLabelToId(label: string): number {
  const idx = LIDAR_LABELS.findIndex((l) => l.toLowerCase() === label.trim().toLowerCase());
  return idx >= 0 ? idx : LIDAR_LABELS.length;
}

type BEVBounds = { minX: number; minZ: number; spanX: number; spanZ: number };

function lidarSceneBounds(cuboids: LidarCuboidAnnotation[]): BEVBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of cuboids) {
    minX = Math.min(minX, c.cx - c.width / 2);
    maxX = Math.max(maxX, c.cx + c.width / 2);
    minZ = Math.min(minZ, c.cz - c.depth / 2);
    maxZ = Math.max(maxZ, c.cz + c.depth / 2);
  }
  if (!Number.isFinite(minX)) {
    return { minX: -50, minZ: -50, spanX: 100, spanZ: 100 };
  }
  return {
    minX,
    minZ,
    spanX: Math.max(maxX - minX, 1),
    spanZ: Math.max(maxZ - minZ, 1),
  };
}

function lidarToBEVYolo(cuboids: LidarCuboidAnnotation[]): string {
  const { minX, minZ, spanX, spanZ } = lidarSceneBounds(cuboids);
  return cuboids
    .map((c) => {
      const cid = lidarLabelToId(c.label);
      const cx = (c.cx - minX) / spanX;
      const cy = (c.cz - minZ) / spanZ;
      const w = c.width / spanX;
      const h = c.depth / spanZ;
      return `${cid} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`;
    })
    .join('\n');
}

function lidarToCOCO(task: ExportTaskRow, cuboids: LidarCuboidAnnotation[]): object {
  const { minX, minZ, spanX, spanZ } = lidarSceneBounds(cuboids);
  const fileName = safeFileName(task.title);
  const categories = LIDAR_LABELS.map((name, id) => ({ id: id + 1, name, supercategory: 'object' }));
  const images = [{ id: 1, file_name: `${fileName}_bev.png`, width: Math.ceil(spanX), height: Math.ceil(spanZ) }];
  const annotations = cuboids.map((c, i) => {
    const xmin = c.cx - c.width / 2 - minX;
    const ymin = c.cz - c.depth / 2 - minZ;
    return {
      id: i + 1,
      image_id: 1,
      category_id: lidarLabelToId(c.label) + 1,
      bbox: [xmin, ymin, c.width, c.depth],
      area: c.width * c.depth,
      iscrowd: 0,
      attributes: {
        cx: c.cx,
        cy: c.cy,
        cz: c.cz,
        height: c.height,
        yaw: c.yaw,
        name: c.name ?? '',
      },
    };
  });
  return {
    info: { description: 'Deep Studio LiDAR BEV Export', version: '1.0', task_id: task.id },
    images,
    annotations,
    categories,
  };
}

function lidarToPascalVOC(task: ExportTaskRow, cuboids: LidarCuboidAnnotation[]): string {
  const { minX, minZ } = lidarSceneBounds(cuboids);
  const fileName = safeFileName(task.title);
  const objects = cuboids
    .map((c) => {
      const xmin = Math.round(c.cx - c.width / 2 - minX);
      const ymin = Math.round(c.cz - c.depth / 2 - minZ);
      const xmax = Math.round(c.cx + c.width / 2 - minX);
      const ymax = Math.round(c.cz + c.depth / 2 - minZ);
      return `<object>
    <name>${c.label}</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficult>0</difficult>
    <bndbox>
      <xmin>${xmin}</xmin>
      <ymin>${ymin}</ymin>
      <xmax>${xmax}</xmax>
      <ymax>${ymax}</ymax>
    </bndbox>
    <cuboid_3d>
      <cx>${c.cx}</cx><cy>${c.cy}</cy><cz>${c.cz}</cz>
      <width>${c.width}</width><height>${c.height}</height><depth>${c.depth}</depth>
      <yaw>${c.yaw}</yaw>
    </cuboid_3d>
  </object>`;
    })
    .join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
  <folder>lidar</folder>
  <filename>${fileName}</filename>
  <size><width>1</width><height>1</height><depth>3</depth></size>
  ${objects}
</annotation>`;
}

function tasksToCsv(tasks: ExportTaskRow[]): string {
  const headers = [
    'id',
    'title',
    'type',
    'category',
    'status',
    'language',
    'transcription',
    'company_name',
    'client_name',
    'created_at',
    'updated_at',
    'annotation_summary',
  ];
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = tasks.map((task) => {
    let summary = '';
    if (Array.isArray(task.annotation_data)) {
      summary = `${task.annotation_data.length} items`;
    } else if (task.annotation_data) {
      summary = 'object';
    }
    return [
      task.id,
      task.title,
      task.type,
      task.category,
      task.status,
      task.language,
      task.transcription,
      task.company_name,
      task.client_name,
      task.created_at,
      task.updated_at,
      summary,
    ]
      .map(escape)
      .join(',');
  });
  return `${headers.join(',')}\n${rows.join('\n')}`;
}

function flattenVideoAnnotations(frames: VideoAnnotation[]): Annotation[] {
  const out: Annotation[] = [];
  for (const frame of frames) {
    const anns = frame.annotations as Annotation[];
    if (!Array.isArray(anns)) continue;
    for (const a of anns) {
      out.push({
        ...a,
        id: `${frame.frameNumber}_${a.id}`,
        label: a.label ? `${a.label}@f${frame.frameNumber}` : `obj@f${frame.frameNumber}`,
      });
    }
  }
  return out;
}

export type ExportBuildResult = {
  blob: Blob;
  fileName: string;
};

export async function buildAdminExportFile(
  tasks: ExportTaskRow[],
  exportTaskType: ExportTaskType,
  exportFormat: ExportFormatKey,
  clientSlug: string
): Promise<ExportBuildResult> {
  const date = new Date().toISOString().split('T')[0];
  const slug = safeFileName(clientSlug);

  if (exportFormat === 'json') {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    return { blob, fileName: `${exportTaskType}_export_${slug}_${date}.json` };
  }

  if (exportFormat === 'csv') {
    const blob = new Blob([tasksToCsv(tasks)], { type: 'text/csv' });
    return { blob, fileName: `${exportTaskType}_export_${slug}_${date}.csv` };
  }

  if (exportTaskType === 'audio') {
    if (exportFormat === 'srt') {
      const srt = tasks
        .map((task, index) => {
          const startTime = new Date(task.created_at);
          const endTime = new Date(startTime.getTime() + 5000);
          const start = startTime.toISOString().substr(11, 12).replace('.', ',');
          const end = endTime.toISOString().substr(11, 12).replace('.', ',');
          return `${index + 1}\n${start} --> ${end}\n${task.transcription || task.title}\n`;
        })
        .join('\n');
      return {
        blob: new Blob([srt], { type: 'text/plain' }),
        fileName: `audio_srt_${slug}_${date}.srt`,
      };
    }
    const txt = tasks
      .map(
        (task) =>
          `# ${task.title}\n${task.transcription || 'No transcription'}\n---\n`
      )
      .join('\n');
    return {
      blob: new Blob([txt], { type: 'text/plain' }),
      fileName: `audio_txt_${slug}_${date}.txt`,
    };
  }

  const labelNames = labelListForTaskType(exportTaskType);
  const isLidar = exportTaskType === 'lidar';
  const isVideo = exportTaskType === 'video';

  if (exportFormat === 'yolo') {
    const parts: string[] = [];
    for (const task of tasks) {
      if (isLidar) {
        const cuboids = parseLidarCuboids(task.annotation_data);
        parts.push(`# ${task.title} (${task.id})\n${lidarToBEVYolo(cuboids)}`);
      } else {
        const anns = isVideo
          ? flattenVideoAnnotations(parseVideoFrames(task.annotation_data))
          : parseImageAnnotations(task.annotation_data);
        const dims = inferImageDimensions(anns);
        const yolo = toYOLO({
          annotations: anns,
          imageWidth: dims.width,
          imageHeight: dims.height,
          imageFileName: safeFileName(task.title),
          labelNames,
        });
        parts.push(`# ${task.title} (${task.id})\n${yolo}`);
      }
    }
    return {
      blob: new Blob([parts.join('\n\n')], { type: 'text/plain' }),
      fileName: `${exportTaskType}_yolo_${slug}_${date}.txt`,
    };
  }

  if (exportFormat === 'coco') {
    if (isLidar) {
      const payload = tasks.map((task) => ({
        task_id: task.id,
        title: task.title,
        coco: lidarToCOCO(task, parseLidarCuboids(task.annotation_data)),
      }));
      return {
        blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        fileName: `lidar_coco_${slug}_${date}.json`,
      };
    }

    const allImages: object[] = [];
    const allAnnotations: object[] = [];
    const categoryMap = new Map<string, number>();
    labelNames.forEach((name, i) => categoryMap.set(name, i + 1));
    let imageId = 1;
    let annId = 1;

    for (const task of tasks) {
      const anns = isVideo
        ? flattenVideoAnnotations(parseVideoFrames(task.annotation_data))
        : parseImageAnnotations(task.annotation_data);
      const dims = inferImageDimensions(anns);
      const fileName = safeFileName(task.title);
      const single = toCOCO({
        annotations: anns,
        imageWidth: dims.width,
        imageHeight: dims.height,
        imageFileName: fileName,
        labelNames,
      }) as {
        images: { id: number; file_name: string; width: number; height: number }[];
        annotations: {
          id: number;
          image_id: number;
          category_id: number;
          bbox: [number, number, number, number];
          segmentation: number[][];
          area: number;
          iscrowd: 0;
        }[];
      };

      allImages.push({ ...single.images[0], id: imageId, file_name: fileName });
      for (const a of single.annotations) {
        allAnnotations.push({ ...a, id: annId++, image_id: imageId });
      }
      imageId++;
    }

    const categories = labelNames.map((name, id) => ({ id: id + 1, name, supercategory: 'object' }));
    const payload = {
      info: { description: 'Deep Studio Export', version: '1.0' },
      images: allImages,
      annotations: allAnnotations,
      categories,
    };
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      fileName: `${exportTaskType}_coco_${slug}_${date}.json`,
    };
  }

  if (exportFormat === 'pascalvoc') {
    const zip = new JSZip();
    for (const task of tasks) {
      const base = safeFileName(task.title);
      if (isLidar) {
        zip.file(`${base}.xml`, lidarToPascalVOC(task, parseLidarCuboids(task.annotation_data)));
      } else {
        const anns = isVideo
          ? flattenVideoAnnotations(parseVideoFrames(task.annotation_data))
          : parseImageAnnotations(task.annotation_data);
        const dims = inferImageDimensions(anns);
        zip.file(
          `${base}.xml`,
          toPascalVOC({
            annotations: anns,
            imageWidth: dims.width,
            imageHeight: dims.height,
            imageFileName: base,
            labelNames,
          })
        );
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, fileName: `${exportTaskType}_pascalvoc_${slug}_${date}.zip` };
  }

  // txt for annotation types
  const txtParts = tasks.map((task) => {
    if (isLidar) {
      const cuboids = parseLidarCuboids(task.annotation_data);
      return `# ${task.title}\n${JSON.stringify(cuboids, null, 2)}\n---`;
    }
    if (isVideo) {
      return `# ${task.title}\n${JSON.stringify(parseVideoFrames(task.annotation_data), null, 2)}\n---`;
    }
    const anns = parseImageAnnotations(task.annotation_data);
    return `# ${task.title}\n${JSON.stringify(anns, null, 2)}\n---`;
  });
  return {
    blob: new Blob([txtParts.join('\n\n')], { type: 'text/plain' }),
    fileName: `${exportTaskType}_txt_${slug}_${date}.txt`,
  };
}

/** Web: indirme tetikle */
export function downloadExportBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
