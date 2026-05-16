import { supabase } from './supabase';

export const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';

/** Supabase SQL Editor'da çalıştırın (toplu duyuru + gelen kutusu için). */
export const BROADCAST_MIGRATION_HINT =
  "Supabase → SQL Editor'da şu dosyayı çalıştırın: supabase/migrations/add_broadcast_to_messages.sql";

const MESSAGE_COLUMNS_BASE =
  'id, sender_id, receiver_id, content, is_read, created_at' as const;

const MESSAGE_COLUMNS_EXTENDED =
  `${MESSAGE_COLUMNS_BASE}, subject, is_broadcast` as const;

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  subject?: string | null;
  is_broadcast?: boolean;
};

export type ProfileChatUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
};

export type ConversationPartner = ProfileChatUser & {
  lastMessageAt?: string;
  unreadCount?: number;
};

let cachedAdminId: string | null = null;
let broadcastColumnsAvailable: boolean | null = null;

export function resetAdminUserIdCache(): void {
  cachedAdminId = null;
}

function isSchemaColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('is_broadcast') || m.includes('subject') || m.includes('schema cache');
}

/** Destek mesajlarının gideceği admin — önce profiles (auth uid ile aynı). */
export async function getAdminUserId(): Promise<string | null> {
  if (cachedAdminId) return cachedAdminId;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (profile?.id) {
    cachedAdminId = profile.id;
    return cachedAdminId;
  }

  const { data: supportAdmin } = await supabase
    .from('support_admin')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (supportAdmin?.id) {
    cachedAdminId = supportAdmin.id;
    return cachedAdminId;
  }

  const envAdminId = process.env.EXPO_PUBLIC_ADMIN_USER_ID;
  if (envAdminId) {
    cachedAdminId = envAdminId;
    return envAdminId;
  }

  return null;
}

export function displayUserLabel(u: ProfileChatUser): string {
  return u.email?.trim() || u.full_name?.trim() || u.username?.trim() || u.id.slice(0, 8);
}

/** Admin: mesajlaşmış kullanıcılar (okunmamış önce, sonra en son mesaj). */
export async function fetchConversationPartners(
  adminAuthId: string
): Promise<ConversationPartner[]> {
  const { data: rows, error } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, created_at, is_read')
    .or(`sender_id.eq.${adminAuthId},receiver_id.eq.${adminAuthId}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[fetchConversationPartners]', error.message);
    return [];
  }
  if (!rows?.length) return [];

  const partnerMeta = new Map<string, { lastAt: string; unread: number }>();
  for (const m of rows) {
    const partnerId = m.sender_id === adminAuthId ? m.receiver_id : m.sender_id;
    if (!partnerId || partnerId === adminAuthId) continue;

    if (!partnerMeta.has(partnerId)) {
      partnerMeta.set(partnerId, {
        lastAt: m.created_at,
        unread: m.receiver_id === adminAuthId && !m.is_read ? 1 : 0,
      });
    } else if (m.receiver_id === adminAuthId && !m.is_read) {
      partnerMeta.get(partnerId)!.unread += 1;
    }
  }

  const ids = Array.from(partnerMeta.keys());
  if (!ids.length) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, username')
    .in('id', ids);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return ids
    .map((id) => {
      const meta = partnerMeta.get(id)!;
      const p = profileMap.get(id);
      return {
        id,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
        username: p?.username ?? null,
        lastMessageAt: meta.lastAt,
        unreadCount: meta.unread,
      };
    })
    .sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      return (
        new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
      );
    });
}

/** Admin ↔ kullanıcı 1:1 thread. */
export async function fetchThreadMessages(
  adminAuthId: string,
  partnerId: string
): Promise<MessageRow[]> {
  const { data: sent, error: sentErr } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS_BASE)
    .eq('sender_id', adminAuthId)
    .eq('receiver_id', partnerId)
    .order('created_at', { ascending: true });
  const { data: received, error: recvErr } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS_BASE)
    .eq('sender_id', partnerId)
    .eq('receiver_id', adminAuthId)
    .order('created_at', { ascending: true });

  if (sentErr) console.warn('[fetchThreadMessages sent]', sentErr.message);
  if (recvErr) console.warn('[fetchThreadMessages recv]', recvErr.message);

  return [...(sent ?? []), ...(received ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ) as MessageRow[];
}

export async function markThreadReadForAdmin(
  adminAuthId: string,
  partnerId: string
): Promise<void> {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', adminAuthId)
    .eq('sender_id', partnerId)
    .eq('is_read', false);
}

/** Admin: tüm aktif kullanıcılar (1:1 sohbet listesi + toplu gönderim). */
export async function fetchAllUsersForAdmin(adminId: string): Promise<ProfileChatUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, username, role, is_active, is_blocked')
    .neq('id', adminId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[fetchAllUsersForAdmin]', error.message);
    return [];
  }

  return (data ?? []).filter((p) => {
    if (p.is_blocked) return false;
    if (p.is_active === false) return false;
    if (p.role === 'admin') return false;
    return true;
  }) as ProfileChatUser[];
}

export interface SendMessageParams {
  senderId: string;
  content: string;
}

export async function sendMessage({ senderId, content }: SendMessageParams): Promise<{ error: Error | null }> {
  const adminId = await getAdminUserId();
  if (!adminId) {
    return {
      error: new Error(
        'Admin user not found. Please ensure yakup.hano@deepannotation.ai exists in the system.'
      ),
    };
  }

  const { error } = await supabase.from('messages').insert({
    sender_id: senderId,
    receiver_id: adminId,
    content: content.trim(),
    is_read: false,
  });
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

export async function sendMessageAsAdmin({
  adminId,
  receiverId,
  content,
}: SendMessageAsAdminParams): Promise<{ error: Error | null }> {
  if (!receiverId || receiverId === adminId) {
    return { error: new Error('Invalid receiver: must be the target user ID, not admin.') };
  }

  const { error } = await supabase.from('messages').insert({
    sender_id: adminId,
    receiver_id: receiverId,
    content: content.trim(),
    is_read: false,
  });
  return { error: error ? new Error(error.message) : null };
}

export interface SendBroadcastParams {
  adminId: string;
  subject: string;
  content: string;
  recipientIds?: string[];
}

/** Admin: tüm (veya seçili) kullanıcılara duyuru — her kullanıcıya ayrı satır (gelen kutusu). */
export async function sendBroadcastToUsers({
  adminId,
  subject,
  content,
  recipientIds,
}: SendBroadcastParams): Promise<{ sent: number; error: Error | null }> {
  if (broadcastColumnsAvailable === false) {
    return { sent: 0, error: new Error(BROADCAST_MIGRATION_HINT) };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { sent: 0, error: new Error('Mesaj metni boş olamaz.') };
  }

  let targets = recipientIds;
  if (!targets?.length) {
    const users = await fetchAllUsersForAdmin(adminId);
    targets = users.map((u) => u.id);
  }

  if (targets.length === 0) {
    return { sent: 0, error: new Error('Gönderilecek kullanıcı bulunamadı.') };
  }

  const subjectLine = subject.trim() || 'Duyuru';
  const rows = targets.map((receiverId) => ({
    sender_id: adminId,
    receiver_id: receiverId,
    content: trimmedContent,
    subject: subjectLine,
    is_read: false,
    is_broadcast: true,
  }));

  const chunkSize = 80;
  let sent = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('messages').insert(chunk);
    if (error) {
      if (isSchemaColumnError(error.message)) {
        broadcastColumnsAvailable = false;
        return { sent, error: new Error(BROADCAST_MIGRATION_HINT) };
      }
      return { sent, error: new Error(error.message) };
    }
    sent += chunk.length;
  }

  broadcastColumnsAvailable = true;
  return { sent, error: null };
}

/** Kullanıcı gelen kutusu: admin duyuruları (migration gerekir). */
export async function fetchBroadcastInbox(userId: string): Promise<MessageRow[]> {
  if (broadcastColumnsAvailable === false) {
    return [];
  }

  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS_EXTENDED)
    .eq('receiver_id', userId)
    .eq('is_broadcast', true)
    .order('created_at', { ascending: false });

  if (error) {
    if (isSchemaColumnError(error.message)) {
      broadcastColumnsAvailable = false;
      return [];
    }
    console.warn('[fetchBroadcastInbox]', error.message);
    return [];
  }

  broadcastColumnsAvailable = true;
  return (data ?? []) as MessageRow[];
}

export async function markBroadcastsRead(userId: string, messageIds: string[]): Promise<void> {
  if (!messageIds.length) return;
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('receiver_id', userId)
    .in('id', messageIds);
}

/** 1:1 destek sohbeti (broadcast hariç). */
export async function fetchDirectMessages(userId: string, _adminId: string | null): Promise<MessageRow[]> {
  const extended = broadcastColumnsAvailable !== false;

  if (extended) {
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS_EXTENDED)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: true });

    if (!error) {
      broadcastColumnsAvailable = true;
      return ((data ?? []) as MessageRow[]).filter((m) => !m.is_broadcast);
    }
    if (!isSchemaColumnError(error.message)) {
      console.warn('[fetchDirectMessages]', error.message);
      return [];
    }
    broadcastColumnsAvailable = false;
  }

  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS_BASE)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[fetchDirectMessages]', error.message);
    return [];
  }
  return (data ?? []) as MessageRow[];
}
