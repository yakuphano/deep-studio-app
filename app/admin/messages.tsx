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
import { sendMessageAsAdmin, getAdminUserId } from '@/lib/messages';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

type ChatUser = { id: string; email?: string; full_name?: string };

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
  const [adminId, setAdminId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const userId = user?.id ?? '';
  const filteredUsers = users.filter((u) =>
    (u.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (user && !isAdmin) router.replace('/tasks');
  }, [user, isAdmin]);

  useEffect(() => {
    getAdminUserId().then(setAdminId);
  }, []);

  const fetchConversationUsers = useCallback(async () => {
    if (!adminId) return;
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id');
    const ids = new Set<string>();
    (data ?? []).forEach((m) => {
      if (m.sender_id && m.sender_id !== adminId) ids.add(m.sender_id);
      if (m.receiver_id && m.receiver_id !== adminId) ids.add(m.receiver_id);
    });
    if (ids.size === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', Array.from(ids));
    setUsers((profiles ?? []).map((p) => ({ id: p.id, email: p.email, full_name: p.full_name })));
    setLoading(false);
  }, [adminId]);

  useEffect(() => {
    if (adminId) fetchConversationUsers();
  }, [adminId, fetchConversationUsers]);

  const fetchMessages = useCallback(async () => {
    if (!selectedUser?.id || !adminId) return;
    const { data: sent } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, content, is_read, created_at')
      .eq('sender_id', adminId)
      .eq('receiver_id', selectedUser.id)
      .order('created_at', { ascending: true });
    const { data: received } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, content, is_read, created_at')
      .eq('sender_id', selectedUser.id)
      .eq('receiver_id', adminId)
      .order('created_at', { ascending: true });
    const merged = [...(sent ?? []), ...(received ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setMessages(merged as Message[]);
  }, [selectedUser?.id, adminId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!selectedUser?.id || !adminId) return;
    const channel = supabase
      .channel('admin-messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchMessages()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [selectedUser?.id, adminId, fetchMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !adminId || !selectedUser?.id || sending) return;

    setSending(true);
    try {
      const { error } = await sendMessageAsAdmin({
        adminId,
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

  const isFromCurrentUser = (m: Message) => m.sender_id === userId;

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
                  <Text style={styles.userItemText} numberOfLines={1}>
                    {u.email || u.full_name || u.id}
                  </Text>
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
  userItemText: { fontSize: 14, color: '#f1f5f9' },
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
});
