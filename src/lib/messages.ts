import { supabase } from './supabase';

export const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';

let cachedAdminId: string | null = null;

/**
 * Fetches the admin user's UUID from profiles by email.
 * Falls back to auth.users if profiles doesn't have email.
 */
export async function getAdminUserId(): Promise<string | null> {
  if (cachedAdminId) return cachedAdminId;

  const { data: supportAdmin } = await supabase
    .from('support_admin')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (supportAdmin?.id) {
    cachedAdminId = supportAdmin.id;
    return cachedAdminId;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (profile?.id) {
    cachedAdminId = profile.id;
    return cachedAdminId;
  }

  const envAdminId = process.env.EXPO_PUBLIC_ADMIN_USER_ID;
  if (envAdminId) {
    cachedAdminId = envAdminId;
    return envAdminId;
  }

  return null;
}

export interface SendMessageParams {
  senderId: string;
  content: string;
}

/**
 * Sends a message from the current user to the admin.
 * receiver_id is set to the admin's UUID from profiles.
 */
export async function sendMessage({ senderId, content }: SendMessageParams): Promise<{ error: Error | null }> {
  const adminId = await getAdminUserId();
  if (!adminId) {
    return { error: new Error('Admin user not found. Please ensure yakup.hano@deepannotation.ai exists in the system.') };
  }

  const messageData = {
    sender_id: senderId,
    receiver_id: adminId,
    content: content.trim(),
    is_read: false,
  };

  console.log('Mesaj Gönderiliyor:', messageData);

  const { error } = await supabase.from('messages').insert(messageData);
  return { error: error ? new Error(error.message) : null };
}

export function isAdminSender(senderId: string, adminId: string | null): boolean {
  return !!adminId && senderId === adminId;
}

export interface SendMessageAsAdminParams {
  adminId: string;
  receiverId: string;
  content: string;
}

/**
 * Admin sends a message to a user. sender_id = admin, receiver_id = target user.
 * CRITICAL: receiver_id must be the user's UUID, never admin.
 */
export async function sendMessageAsAdmin({ adminId, receiverId, content }: SendMessageAsAdminParams): Promise<{ error: Error | null }> {
  if (!receiverId || receiverId === adminId) {
    return { error: new Error('Invalid receiver: must be the target user ID, not admin.') };
  }

  const messageData = {
    sender_id: adminId,
    receiver_id: receiverId,
    content: content.trim(),
    is_read: false,
  };

  console.log('Admin Mesaj Gönderiliyor:', messageData);

  const { error } = await supabase.from('messages').insert(messageData);
  return { error: error ? new Error(error.message) : null };
}
