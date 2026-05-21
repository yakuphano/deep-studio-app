export type AppRole = 'admin' | 'reviewer' | 'annotator';

export function normalizeProfileRole(role: string | null | undefined, isAdminFlag: boolean | null | undefined): AppRole {
  const r = (role ?? 'user').toLowerCase();
  if (r === 'admin' || isAdminFlag === true) return 'admin';
  if (r === 'reviewer') return 'reviewer';
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
