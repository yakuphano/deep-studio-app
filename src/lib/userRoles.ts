export type AppRole = 'admin' | 'reviewer' | 'annotator';

/** Oturumdaki QA reviewer hesabı (profilde gecikme/RLS olsa bile). */
const QA_REVIEWER_FALLBACK_EMAILS = new Set(['yakuphanno@gmail.com']);

/** Panelde farklı yazılmış reviewer rolleri */
const REVIEWER_ROLE_ALIASES = new Set(['reviewer', 'qa_reviewer', 'qareviewer']);

function stripRoleString(role: string | null | undefined): string {
  return (role ?? 'user').toString().replace(/^\ufeff/, '').toLowerCase().trim();
}

function isQaReviewerFallbackEmail(email: string | null | undefined): boolean {
  const e = (email ?? '').toLowerCase().trim();
  return QA_REVIEWER_FALLBACK_EMAILS.has(e);
}

/** Supabase bazen `user.email` boş bırakıp identities içinde döner. */
export function pickAuthUserEmail(user: { email?: string | null; identities?: { identity_data?: { email?: string } }[] } | null | undefined): string | undefined {
  const direct = user?.email?.trim();
  if (direct) return direct.toLowerCase();
  const fromIdent = user?.identities?.[0]?.identity_data?.email;
  if (typeof fromIdent === 'string' && fromIdent.trim()) return fromIdent.trim().toLowerCase();
  return undefined;
}

/**
 * @param email Oturum e-postası; bilinen QA hesabı için DB gecikse bile reviewer (bkz. yakuphanno@gmail.com).
 */
export function normalizeProfileRole(
  role: string | null | undefined,
  isAdminFlag: boolean | null | undefined,
  email?: string | null
): AppRole {
  const r = stripRoleString(role).replace(/\s+/g, '_').replace(/-/g, '_');
  if (r === 'admin' || isAdminFlag === true) return 'admin';
  if (REVIEWER_ROLE_ALIASES.has(r)) return 'reviewer';

  if (isQaReviewerFallbackEmail(email)) return 'reviewer';

  return 'annotator';
}
export function canAccessReviewQueue(role: AppRole): boolean {
  return role === 'admin' || role === 'reviewer';
}

export function postLoginPathForRole(role: AppRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'reviewer') return '/review';
  return '/dashboard';
}
