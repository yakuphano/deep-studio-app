import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import {
  sendMessage,
  getAdminUserId,
  isAdminSender,
  ADMIN_EMAIL,
  fetchBroadcastInbox,
  fetchDirectMessages,
  markBroadcastsRead,
  type MessageRow,
} from '@/lib/messages';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type TabKey = 'inbox' | 'support';

export default function MessagesScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useProfile();

  const [tab, setTab] = useState<TabKey>('inbox');
  const [inbox, setInbox] = useState<MessageRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const userId = user?.id ?? '';

  useEffect(() => {
    if (isAdmin === true) {
      router.replace('/admin/messages');
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin && userId) {
      setTab('support');
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    getAdminUserId().then(setAdminId);
  }, []);

  const loadInbox = useCallback(async () => {
    if (!userId) return;
    const rows = await fetchBroadcastInbox(userId);
    setInbox(rows);
  }, [userId]);

  const loadSupport = useCallback(async () => {
    if (!userId) return;
    const rows = await fetchDirectMessages(userId, adminId);
    setMessages(rows);
  }, [userId, adminId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await Promise.all([loadInbox(), loadSupport()]);
    setLoading(false);
  }, [userId, loadInbox, loadSupport]);

  useEffect(() => {
    if (!userId || isAdmin) return;
    refresh();
  }, [userId, isAdmin, refresh]);

  useEffect(() => {
    if (!userId || isAdmin) return;
    const channel = supabase
      .channel('user-messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadInbox();
        loadSupport();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isAdmin, loadInbox, loadSupport]);

  useEffect(() => {
    if (tab !== 'support' || !userId || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.receiver_id === userId && !m.is_read)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      supabase.from('messages').update({ is_read: true }).in('id', unreadIds).then(() => {});
    }
  }, [tab, userId, messages]);

  const handleOpenInboxItem = async (item: MessageRow) => {
    setExpandedId(expandedId === item.id ? null : item.id);
    if (!item.is_read) {
      await markBroadcastsRead(userId, [item.id]);
      setInbox((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_read: true } : m)));
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !userId || sending) return;

    setSending(true);
    try {
      const { error } = await sendMessage({ senderId: userId, content: text });
      if (error) throw error;
      setInput('');
      await loadSupport();
      setTab('support');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('login.errorTitle') || 'Hata', msg);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return t('messages.timeNow');
    if (diff < 86400000) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const unreadInbox = inbox.filter((m) => !m.is_read).length;

  if (!user || isAdmin === true) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={themeColors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <LinearGradient colors={[themeColors.background, themeColors.background]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={styles.centerWrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('messages.subtitle')}</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'inbox' && styles.tabBtnActive]}
              onPress={() => setTab('inbox')}
            >
              <Ionicons name="mail-outline" size={18} color={tab === 'inbox' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.tabBtnText, tab === 'inbox' && styles.tabBtnTextActive]}>
                {t('messages.inboxTab')}
              </Text>
              {unreadInbox > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadInbox > 9 ? '9+' : unreadInbox}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'support' && styles.tabBtnActive]}
              onPress={() => setTab('support')}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={tab === 'support' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.tabBtnText, tab === 'support' && styles.tabBtnTextActive]}>
                {t('messages.supportTab')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={themeColors.accent} />
          </View>
        ) : tab === 'inbox' ? (
          <FlatList
            data={inbox}
            keyExtractor={(item) => item.id}
            contentContainerStyle={inbox.length === 0 ? styles.emptyList : styles.inboxList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="mail-open-outline" size={48} color={themeColors.textMuted} />
                <Text style={styles.emptyTitle}>{t('messages.inboxEmpty')}</Text>
                <Text style={styles.emptyHint}>{t('messages.inboxEmptyHint')}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const open = expandedId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.inboxCard, !item.is_read && styles.inboxCardUnread]}
                  onPress={() => handleOpenInboxItem(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.inboxCardHead}>
                    <View style={styles.inboxIcon}>
                      <Ionicons name="megaphone-outline" size={20} color="#60a5fa" />
                    </View>
                    <View style={styles.inboxMeta}>
                      <Text style={styles.inboxSubject} numberOfLines={1}>
                        {item.subject || t('messages.broadcastDefaultSubject')}
                      </Text>
                      <Text style={styles.inboxFrom}>{t('messages.supportTeam')}</Text>
                    </View>
                    <Text style={styles.inboxTime}>{formatTime(item.created_at)}</Text>
                  </View>
                  <Text style={styles.inboxPreview} numberOfLines={open ? undefined : 2}>
                    {item.content}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <>
            <View style={styles.supportBanner}>
              <View style={styles.avatar}>
                <Ionicons name="headset" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportTitle}>{t('messages.supportTeam')}</Text>
                <Text style={styles.supportEmail}>{ADMIN_EMAIL}</Text>
              </View>
            </View>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <Text style={styles.emptyChat}>{t('messages.supportEmpty')}</Text>
              }
              renderItem={({ item }) => {
                const fromUser = item.sender_id === userId;
                const fromAdmin = isAdminSender(item.sender_id, adminId);
                return (
                  <View style={[styles.bubbleWrap, fromUser ? styles.bubbleRight : styles.bubbleLeft]}>
                    {fromAdmin && <Text style={styles.bubbleLabel}>{t('messages.supportTeam')}</Text>}
                    {fromUser ? (
                      <LinearGradient
                        colors={['#3b82f6', '#2563eb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.bubble, styles.bubbleUser]}
                      >
                        <Text style={styles.bubbleTextUser}>{item.content}</Text>
                        <Text style={styles.bubbleTime}>{formatTime(item.created_at)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.bubble, styles.bubbleAdmin]}>
                        <Text style={styles.bubbleTextAdmin}>{item.content}</Text>
                        <Text style={styles.bubbleTime}>{formatTime(item.created_at)}</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={t('messages.placeholder')}
                placeholderTextColor={themeColors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                editable={!sending}
              />
              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sending || !input.trim()}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  centerWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    backgroundColor: themeColors.surface,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.surfaceElevated,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: themeColors.textMuted, marginBottom: 12 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  tabBtnActive: { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: themeColors.textMuted },
  tabBtnTextActive: { color: '#fff' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inboxList: { padding: 12, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: themeColors.textMuted, marginTop: 8 },
  emptyHint: { fontSize: 14, color: themeColors.textMuted, textAlign: 'center' },
  inboxCard: {
    backgroundColor: themeColors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  inboxCardUnread: { borderColor: 'rgba(59, 130, 246, 0.45)', backgroundColor: themeColors.accentMuted },
  inboxCardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  inboxIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxMeta: { flex: 1 },
  inboxSubject: { fontSize: 15, fontWeight: '700', color: themeColors.text },
  inboxFrom: { fontSize: 12, color: themeColors.textMuted, marginTop: 2 },
  inboxTime: { fontSize: 11, color: themeColors.textMuted },
  inboxPreview: { fontSize: 14, color: themeColors.textSecondary, lineHeight: 20 },
  supportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTitle: { fontSize: 16, fontWeight: '700', color: themeColors.text },
  supportEmail: { fontSize: 12, color: themeColors.textMuted, marginTop: 2 },
  list: { padding: 16, paddingBottom: 100 },
  emptyChat: { textAlign: 'center', color: themeColors.textMuted, marginTop: 40, fontSize: 14 },
  bubbleWrap: { width: '100%', marginBottom: 10 },
  bubbleLeft: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubbleLabel: { fontSize: 11, fontWeight: '600', color: themeColors.textMuted, marginBottom: 4 },
  bubble: {
    maxWidth: '70%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAdmin: {
    backgroundColor: themeColors.surfaceElevated,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: { fontSize: 15, color: '#ffffff', lineHeight: 22 },
  bubbleTextAdmin: { fontSize: 15, color: themeColors.text, lineHeight: 22 },
  bubbleTime: { fontSize: 10, color: themeColors.textMuted, marginTop: 6, alignSelf: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: themeColors.surface,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  input: {
    flex: 1,
    backgroundColor: themeColors.background,
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 15,
    color: themeColors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: themeColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
}
