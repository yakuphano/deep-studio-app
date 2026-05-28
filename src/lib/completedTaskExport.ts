import { supabase } from '@/lib/supabase';
import {
  buildAdminExportFile,
  downloadExportBlob,
  type ExportFormatKey,
  type ExportTaskRow,
  type ExportTaskType,
} from '@/lib/adminTaskExport';

export type CompletedExportDateRange = 'all' | 'last7' | 'last30' | 'custom';

export type CompletedExportFilters = {
  taskType: ExportTaskType;
  companyClient: string;
  format: ExportFormatKey;
  dateRange: CompletedExportDateRange;
  customStartDate?: string;
  customEndDate?: string;
  language?: string;
};

const EXPORT_COLS =
  'id, title, type, status, price, language, category, audio_url, image_url, video_url, transcription, annotation_data, created_at, updated_at, client_name, company_name, assigned_to, is_pool_task';

export function buildCompletedTasksQuery(filters: CompletedExportFilters) {
  let query = supabase.from('tasks').select(EXPORT_COLS).eq('status', 'completed');

  if (filters.taskType) {
    query = query.eq('type', filters.taskType);
  }

  const raw = filters.companyClient.trim();
  const q = raw.replace(/\\/g, '\\\\').replace(/,/g, '\\,');
  const pat = `%${q}%`;
  query = query.or(`client_name.ilike.${pat},company_name.ilike.${pat}`);

  if (filters.taskType === 'audio' && filters.language && filters.language !== 'all') {
    query = query.eq('language', filters.language);
  }

  if (filters.dateRange === 'last7') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    query = query.gte('updated_at', d.toISOString());
  } else if (filters.dateRange === 'last30') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    query = query.gte('updated_at', d.toISOString());
  } else if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
    query = query
      .gte('updated_at', `${filters.customStartDate}T00:00:00Z`)
      .lte('updated_at', `${filters.customEndDate}T23:59:59Z`);
  }

  return query;
}

export async function fetchCompletedTasks(
  filters: CompletedExportFilters
): Promise<{ data: ExportTaskRow[]; error: string | null }> {
  const { data, error } = await buildCompletedTasksQuery(filters);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ExportTaskRow[], error: null };
}

export async function exportCompletedTasks(
  filters: CompletedExportFilters
): Promise<{ ok: true; count: number; fileName: string } | { ok: false; error: string }> {
  const company = filters.companyClient.trim();
  if (!company) {
    return { ok: false, error: 'COMPANY_REQUIRED' };
  }
  if (filters.dateRange === 'custom' && (!filters.customStartDate || !filters.customEndDate)) {
    return { ok: false, error: 'DATES_REQUIRED' };
  }

  const { data, error } = await fetchCompletedTasks(filters);
  if (error) return { ok: false, error };
  if (!data.length) return { ok: false, error: 'NO_DATA' };

  const { blob, fileName } = await buildAdminExportFile(
    data,
    filters.taskType,
    filters.format,
    company
  );
  downloadExportBlob(blob, fileName);
  return { ok: true, count: data.length, fileName };
}
