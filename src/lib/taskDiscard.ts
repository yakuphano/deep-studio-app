import { supabase } from '@/lib/supabase';

export async function setTaskDiscardInDb(
  taskId: string,
  discarded: boolean,
  userId: string
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('tasks')
    .update(
      discarded
        ? { discarded_at: now, discarded_by: userId, updated_at: now }
        : { discarded_at: null, discarded_by: null, updated_at: now }
    )
    .eq('id', taskId);
  return { error: error?.message ?? null };
}
