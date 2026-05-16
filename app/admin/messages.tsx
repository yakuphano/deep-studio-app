import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  sendMessageAsAdmin,
  sendBroadcastToUsers,
  fetchAllUsersForAdmin,
  fetchConversationPartners,
  fetchThreadMessages,
  markThreadReadForAdmin,
  displayUserLabel,
  type ConversationPartner,
} from '@/lib/messages';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

type ChatUser = ConversationPartner;
type AdminMode = 'chat' | 'broadcast';

export default function AdminMessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [mode, setMode] = useState<AdminMode>('chat');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const didAutoSelectUser = useRef(false);

  const adminAuthId = user?.id ?? '';
  const filteredUsers = users.filter((u) => {
    const label = displayUserLabel(u).toLowerCase();
    const q = searchQuery.toLowerCase();
    return label.includes(q) || u.id.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin]);

  const loadUsers = useCallback(async () => {
    if (!adminAuthId) return;
    const [partners, allUsers] = await Promise.all([
      fetchConversationPartners(adminAuthId),
      fetchAllUsersForAdmin(adminAuthId),
    ]);
    const partnerIds = new Set(partners.map((p) => p.id));
    const rest = allUsers.filter((u) => !partnerIds.has(u.id));
    const merged = [...partners, ...rest];
    setUsers(merged);
    setUserCount(allUsers.length);

    if (!didAutoSelectUser.current && merged.length > 0) {
      didAutoSelectUser.current = true;
      const firstUnread = partners.find((p) => (p.unreadCount ?? 0) > 0);
      setSelectedUser(firstUnread ?? merged[0]);
    }

    setLoading(false);
  }, [adminAuthId]);

  useEffect(() => {
    if (adminAuthId) loadUsers();
  }, [adminAuthId, loadUsers]);

  const fetchMessages = useCallback(async () => {
    if (!selectedUser?.id || !adminAuthId) return;
    const thread = await fetchThreadMessages(adminAuthId, selectedUser.id);
    setMessages(thread as Message[]);
    await markThreadReadForAdmin(adminAuthId, selectedUser.id);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id ? { ...u, unreadCount: 0 } : u
      )
    );
  }, [selectedUser?.id, adminAuthId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!selectedUser?.id || !adminAuthId) return;
    const channel = supabase
      .channel('admin-messages-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          fetchMessages();
          loadUsers();
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [selectedUser?.id, adminAuthId, fetchMessages, loadUsers]);

  const handleBroadcast = async () => {
    const content = broadcastContent.trim();
    if (!adminAuthId || !content || broadcastSending) return;

    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(t('admin.broadcastConfirm', { count: userCount }))
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              t('admin.broadcastTitle'),
              t('admin.broadcastConfirm', { count: userCount }),
              [
                { text: t('login.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('admin.broadcastSend'), onPress: () => resolve(true) },
              ]
            );
          });
    if (!confirmed) return;

    setBroadcastSending(true);
    try {
      const { sent, error } = await sendBroadcastToUsers({
        adminId: adminAuthId,
        subject: broadcastSubject,
        content,
      });
      if (error) throw error;
      setBroadcastSubject('');
      setBroadcastContent('');
      Alert.alert(t('admin.broadcastTitle'), t('admin.broadcastSuccess', { count: sent }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('login.errorTitle') || 'Hata', msg);
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !adminAuthId || !selectedUser?.id || sending) return;

    setSending(true);
    try {
      const { error } = await sendMessageAsAdmin({
        adminId: adminAuthId,
        receiverId: selectedUser.id,
        content: text,
      });
      if (error) throw error;
      setInput('');
      fetchMessages();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(t('login.errorTitle') || 'Hata', msg);
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

  const isFromCurrentUser = (m: Message) => m.sender_id === adminAuthId;

  if (!user || !isAdmin) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        <Text style={styles.backBtnText}>{t('admin.userList')}</Text>
      </TouchableOpacity>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'chat' && styles.modeBtnActive]}
          onPress={() => setMode('chat')}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={mode === 'chat' ? '#fff' : '#94a3b8'} />
          <Text style={[styles.modeBtnText, mode === 'chat' && styles.modeBtnTextActive]}>
            {t('admin.messagesChatMode')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'broadcast' && styles.modeBtnActive]}
          onPress={() => setMode('broadcast')}
        >
          <Ionicons name="megaphone-outline" size={18} color={mode === 'broadcast' ? '#fff' : '#94a3b8'} />
          <Text style={[styles.modeBtnText, mode === 'broadcast' && styles.modeBtnTextActive]}>
            {t('admin.messagesBroadcastMode')}
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'broadcast' ? (
        <ScrollView style={styles.broadcastPanel} contentContainerStyle={styles.broadcastContent}>
          <Text style={styles.broadcastHeading}>{t('admin.broadcastTitle')}</Text>
          <Text style={styles.broadcastHint}>
            {t('admin.broadcastHint', { count: userCount })}
          </Text>
          <Text style={styles.fieldLabel}>{t('admin.broadcastSubjectLabel')}</Text>
          <TextInput
            style={styles.broadcastInput}
            placeholder={t('admin.broadcastSubjectPlaceholder')}
            placeholderTextColor="#64748b"
            value={broadcastSubject}
            onChangeText={setBroadcastSubject}
            maxLength={200}
          />
          <Text style={styles.fieldLabel}>{t('admin.broadcastBodyLabel')}</Text>
          <TextInput
            style={[styles.broadcastInput, styles.broadcastBody]}
            placeholder={t('messages.placeholder')}
            placeholderTextColor="#64748b"
            value={broadcastContent}
            onChangeText={setBroadcastContent}
            multiline
            maxLength={5000}
          />
          <TouchableOpacity
            style={[styles.broadcastSendBtn, broadcastSending && styles.sendBtnDisabled]}
            onPress={handleBroadcast}
            disabled={broadcastSending || !broadcastContent.trim() || userCount === 0}
          >
            {broadcastSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.broadcastSendText}>{t('admin.broadcastSend')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
      <View style={styles.main}>
        <View style={styles.userList}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('admin.searchEmployeePlaceholder')}
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <Text style={styles.userListTitle}>{t('admin.userList')}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 20 }} />
          ) : users.length === 0 ? (
            <Text style={styles.emptyUsers}>{t('admin.userListEmpty')}</Text>
          ) : searchQuery && filteredUsers.length === 0 ? (
            <Text style={styles.emptyUsers}>{t('admin.noEmailFound')}</Text>
          ) : (
            <ScrollView style={styles.userScroll}>
              {filteredUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userItem, selectedUser?.id === u.id && styles.userItemActive]}
                  onPress={() => setSelectedUser(u)}
                >
                  <View style={styles.userItemRow}>
                    <Text style={styles.userItemText} numberOfLines={1}>
                      {displayUserLabel(u)}
                    </Text>
                    {(u.unreadCount ?? 0) > 0 && (
                      <View style={styles.unreadDot}>
                        <Text style={styles.unreadDotText}>
                          {(u.unreadCount ?? 0) > 9 ? '9+' : u.unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.chatArea}>
          {!selectedUser ? (
            <View style={styles.placeholder}>
              <Ionicons name="chatbubbles-outline" size={64} color="#475569" />
              <Text style={styles.placeholderText}>{t('admin.messagesSelectUser')}</Text>
            </View>
          ) : (
            <KeyboardAvoidingView style={styles.chatFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatHeaderTitle}>{selectedUser.email || selectedUser.full_name || selectedUser.id}</Text>
              </View>
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                  const fromMe = isFromCurrentUser(item);
                  return (
                    <View style={[styles.bubbleWrap, fromMe ? styles.bubbleRight : styles.bubbleLeft]}>
                      <View style={[styles.bubble, fromMe ? styles.bubbleUser : styles.bubbleAdmin]}>
                        <Text style={styles.bubbleText}>{item.content}</Text>
                        <Text style={styles.bubbleTime}>{formatTime(item.created_at)}</Text>
                      </View>
                    </View>
                  );
                }}
              />
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder={t('messages.placeholder')}
                  placeholderTextColor="#64748b"
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
            </KeyboardAvoidingView>
          )}
        </View>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 8 },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  main: { flex: 1, flexDirection: 'row' },
  userList: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 15,
    margin: 10,
    marginBottom: 12,
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 14,
    color: '#ffffff',
  },
  userListTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 12 },
  userScroll: { flex: 1 },
  userItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  userItemActive: { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  userItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userItemText: { fontSize: 14, color: '#f1f5f9', flex: 1 },
  unreadDot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadDotText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  emptyUsers: { fontSize: 14, color: '#64748b', marginTop: 20 },
  chatArea: { flex: 1 },
  chatFlex: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  placeholderText: { fontSize: 16, color: '#64748b', marginTop: 16 },
  chatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  chatHeaderTitle: { fontSize: 16, fontWeight: '600', color: '#f8fafc' },
  list: { padding: 16, paddingBottom: 24 },
  bubbleWrap: { marginBottom: 12 },
  bubbleLeft: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 16,
  },
  bubbleAdmin: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bubbleText: { fontSize: 15, color: '#f1f5f9', lineHeight: 22 },
  bubbleTime: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    paddingBottom: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: '#f1f5f9',
    maxHeight: 120,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1e293b',
  },
  modeBtnActive: { backgroundColor: '#3b82f6' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  modeBtnTextActive: { color: '#fff' },
  broadcastPanel: { flex: 1 },
  broadcastContent: { padding: 20, paddingBottom: 40, maxWidth: 720, alignSelf: 'center', width: '100%' },
  broadcastHeading: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 8 },
  broadcastHint: { fontSize: 14, color: '#94a3b8', marginBottom: 20, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 8 },
  broadcastInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  broadcastBody: { minHeight: 160, textAlignVertical: 'top' },
  broadcastSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  broadcastSendText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
