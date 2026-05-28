import { supabase } from '@/lib/supabase';
import { DB_REVIEWER_ROLES, QA_REVIEWER_KNOWN_EMAILS } from '@/lib/userRoles';

function mergeProfiles(
  target: Map<string, Record<string, unknown>>,
  rows: Record<string, unknown>[] | null | undefined
) {
  for (const row of rows ?? []) {
    if (row?.id == null) continue;
    target.set(String(row.id), row);
  }
}

function hasEmailInMap(map: Map<string, Record<string, unknown>>, email: string): boolean {
  const want = email.toLowerCase().trim();
  return [...map.values()].some((r) => String(r.email ?? '').toLowerCase().trim() === want);
}

/**
 * Admin hesap listesi: tüm profiller + kaliteci rolleri + bilinen QA e-postaları.
 * Önce admin_sync_missing_profiles (auth → profiles) çağrılır.
 */
export async function fetchAdminAccountProfiles(): Promise<{
  rows: Record<string, unknown>[];
  syncError?: string;
}> {
  const { error: syncError } = await supabase.rpc('admin_sync_missing_profiles');
  if (syncError) {
    console.warn('[fetchAdminAccountProfiles] sync:', syncError.message);
  }

  const byId = new Map<string, Record<string, unknown>>();

  const { data: allProfiles, error: allError } = await supabase.from('profiles').select('*');
  if (allError) throw allError;
  mergeProfiles(byId, allProfiles as Record<string, unknown>[]);

  const { data: reviewerProfiles, error: reviewerError } = await supabase
    .from('profiles')
    .select('*')
    .in('role', [...DB_REVIEWER_ROLES]);
  if (reviewerError) {
    console.warn('[fetchAdminAccountProfiles] reviewer roles:', reviewerError.message);
  } else {
    mergeProfiles(byId, reviewerProfiles as Record<string, unknown>[]);
  }

  for (const email of QA_REVIEWER_KNOWN_EMAILS) {
    if (hasEmailInMap(byId, email)) continue;

    const { data: byEmail } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (byEmail) {
      mergeProfiles(byId, [byEmail as Record<string, unknown>]);
      continue;
    }

    const localPart = email.split('@')[0] ?? '';
    if (localPart) {
      const { data: byUsername } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', localPart)
        .maybeSingle();
      if (byUsername) {
        const row = { ...(byUsername as Record<string, unknown>), email };
        mergeProfiles(byId, [row]);
      }
    }
  }

  return {
    rows: [...byId.values()],
    syncError: syncError?.message,
  };
}
