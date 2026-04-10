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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sendMessage, sendMessageAsAdmin, getAdminUserId, isAdminSender, ADMIN_EMAIL } from '@/lib/messages';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

type ChatUser = { id: string; email?: string; full_name?: string };

export default function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, { email?: string; full_name?: string }>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false); // Start with false
  const [adminId, setAdminId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const navigatorReady = rootNavigationState?.key != null;
  const filteredUsers = users.filter((u) =>
    (u.email ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const userId = user?.id ?? '';

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);

  useEffect(() => {
    getAdminUserId().then(setAdminId);
  }, []);

  const fetchSenderProfiles = useCallback(async (msgList: Message[]) => {
    const ids = [...new Set(msgList.map((m) => m.sender_id).filter(Boolean))];
    if (ids.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, email, full_name').in('id', ids);
    const map: Record<string, { email?: string; full_name?: string }> = {};
    (data ?? []).forEach((p) => {
      map[p.id] = { email: p.email, full_name: p.full_name };
    });
    setSenderProfiles((prev) => ({ ...prev, ...map }));
  }, []);

  const fetchMessagesUser = useCallback(async () => {
    if (!userId) {
      console.log('No user ID, showing dummy data');
      setMessages([]);
      return;
    }
    
    try {
      console.log('Safe fetch attempt for messages');
      
      // Check if table exists and fetch data
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: true })
        .limit(20); // Limit to prevent long fetches

      if (error) {
        console.error('Database error or table missing:', error);
        setMessages([]);
        return;
      }

      const list = (data ?? []) as Message[];
      setMessages(list);
      fetchSenderProfiles(list);
    } catch (error: any) {
      console.error('Critical error in messages fetch:', error);
      setMessages([]);
    }
  }, [userId, fetchSenderProfiles]);

  const fetchConversationUsers = useCallback(async () => {
    if (!adminId) {
      console.log('No admin ID, showing dummy data');
      setUsers([]);
      return;
    }
    
    try {
      console.log('Safe fetch attempt for conversation users');
      
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .limit(50); // Limit to prevent long fetches
      
      if (error) {
        console.error('Database error or table missing:', error);
        setUsers([]);
        return;
      }
      
      const ids = new Set<string>();
      (data ?? []).forEach((m) => {
        if (m.sender_id && m.sender_id !== adminId) ids.add(m.sender_id);
        if (m.receiver_id && m.receiver_id !== adminId) ids.add(m.receiver_id);
      });
      
      if (ids.size === 0) {
        console.log('No conversation users found');
        setUsers([]);
        return;
      }
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', Array.from(ids));
        
      if (profilesError) {
        console.error('Database error fetching profiles:', profilesError);
        setUsers([]);
        return;
      }
      
      setUsers((profiles ?? []) as ChatUser[]);
    } catch (error: any) {
      console.error('Critical error in conversation users fetch:', error);
      setUsers([]);
    }
  }, [adminId]);

  const fetchMessagesAdmin = useCallback(async () => {
    if (!selectedUser?.id || !adminId) return;
    try {
      console.log('Fetching messages for admin:', adminId);
      const { data: sent, error: sentError } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .eq('sender_id', adminId)
        .eq('receiver_id', selectedUser.id)
        .order('created_at', { ascending: true });
      
      if (sentError) {
        console.error('Database error fetching sent messages:', sentError);
        setMessages([]);
        return;
      }
      
      const { data: received, error: receivedError } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .eq('sender_id', selectedUser.id)
        .eq('receiver_id', adminId)
        .order('created_at', { ascending: true });
        
      if (receivedError) {
        console.error('Database error fetching received messages:', receivedError);
        setMessages([]);
        return;
      }
      
      const merged = [...(sent ?? []), ...(received ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      setMessages(merged as Message[]);
      fetchSenderProfiles(merged as Message[]);
    } catch (error: any) {
      console.error('Error fetching messages for admin:', error);
      setMessages([]);
    } finally {
      // CRITICAL: Always set loading to false
      console.log('FETCH END: messages for admin');
      setLoading(false);
    }
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
    fetchSenderProfiles(merged as Message[]);
  }, [selectedUser?.id, adminId, fetchSenderProfiles]);

  useEffect(() => {
    if (isAdmin && adminId) {
      fetchConversationUsers();
    } else if (!isAdmin) {
      fetchMessagesUser();
    }
  }, [isAdmin, adminId, fetchConversationUsers, fetchMessagesUser]);

  useEffect(() => {
    if (isAdmin && selectedUser?.id && adminId) {
      fetchMessagesAdmin();
    }
  }, [isAdmin, selectedUser?.id, adminId]); // Remove fetchMessagesAdmin to prevent loop

  // Removed realtime subscription to prevent loops

  useEffect(() => {
    if (!userId || messages.length === 0 || isAdmin) return;
    const unreadIds = messages.filter((m) => m.receiver_id === userId && !m.is_read).map((m) => m.id);
    if (unreadIds.length > 0) {
      supabase.from('messages').update({ is_read: true }).in('id', unreadIds).then(() => {});
    }
  }, [userId, messages, isAdmin]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !userId || sending) return;

    setSending(true);
    try {
      if (isAdmin) {
        if (!selectedUser?.id || !adminId) {
          throw new Error(t('admin.messagesSelectUser'));
        }
        const { error } = await sendMessageAsAdmin({
          adminId,
          receiverId: selectedUser.id,
          content: text,
        });
        if (error) throw error;
        fetchMessagesAdmin();
      } else {
        const { error } = await sendMessage({ senderId: userId, content: text });
        if (error) throw error;
        fetchMessagesUser();
      }
      setInput('');
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

  const getSenderLabel = (senderId: string) => {
    if (senderId === adminId) return t('messages.supportTeam');
    if (selectedUser?.id === senderId) return selectedUser.email || selectedUser.full_name || senderId?.slice(0, 8);
    const p = senderProfiles[senderId];
    if (p?.email) return p.email;
    if (p?.full_name) return p.full_name;
    return senderId?.slice(0, 8) || '?';
  };

  const isFromCurrentUser = (m: Message) => m.sender_id === userId;
  const isFromAdmin = (m: Message) => isAdminSender(m.sender_id, adminId);

  if (!user) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (isAdmin) {
    if (!adminId) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <View style={styles.main}>
          <View style={styles.sidebar}>
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
            <Text style={styles.sidebarTitle}>{t('messages.chatList')}</Text>
            {users.length === 0 ? (
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
            <View style={styles.centerWrapper}>
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
                          <Text style={styles.senderLabel}>{getSenderLabel(item.sender_id)}</Text>
                          {fromMe ? (
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
                      placeholderTextColor="#64748b"
                      value={input}
                      onChangeText={setInput}
                      multiline
                      maxLength={2000}
                      editable={!sending}
                    />
                    <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={handleSend} disabled={sending || !input.trim()}>
                      <Ionicons name="send" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <LinearGradient colors={['#0f172a', '#0f172a']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.centerWrapper}>
        <View style={styles.header}>
          <View style={styles.avatarBox}>
            <View style={styles.avatar}>
              <Ionicons name="headset" size={24} color="#fff" />
            </View>
            <View>
              <Text style={styles.headerTitle}>{t('messages.supportTeam')}</Text>
              <Text style={styles.headerAdmin}>{t('messages.supportAdmin')}</Text>
              <Text style={styles.headerEmail}>{ADMIN_EMAIL}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const fromUser = isFromCurrentUser(item);
              const fromAdmin = isFromAdmin(item);
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
        )}

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
          <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={handleSend} disabled={sending || !input.trim()}>
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centerWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    backgroundColor: '#1e293b',
  },
  main: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 15,
    margin: 10,
    marginBottom: 8,
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
  sidebarTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 12 },
  userScroll: { flex: 1 },
  userItem: { padding: 12, borderRadius: 8, marginBottom: 4 },
  userItemActive: { backgroundColor: 'rgba(59, 130, 246, 0.2)' },
  userItemText: { fontSize: 14, color: '#f1f5f9' },
  emptyUsers: { fontSize: 14, color: '#64748b', marginTop: 20 },
  chatArea: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center' },
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
  senderLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  avatarBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  headerAdmin: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  headerEmail: { fontSize: 12, color: '#64748b', marginTop: 2 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    padding: 16,
    paddingBottom: 100,
    width: '100%',
  },
  bubbleWrap: { width: '100%', marginBottom: 10 },
  bubbleLeft: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubbleLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8', marginBottom: 4 },
  bubble: {
    maxWidth: '70%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopLeftRadius: 18,
    alignSelf: 'flex-end',
    marginRight: 10,
  },
  bubbleAdmin: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  bubbleTextUser: { fontSize: 15, color: '#ffffff', lineHeight: 22 },
  bubbleTextAdmin: { fontSize: 15, color: '#e2e8f0', lineHeight: 22 },
  bubbleTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  inputRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    marginLeft: 10,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
