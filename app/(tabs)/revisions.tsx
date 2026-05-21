import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkbenchPathForTask } from '@/lib/taskWorkbenchPath';

type Row = {
  id: string;
  title: string;
  type: string | null;
  category?: string | null;
  status: string;
  qa_comment?: string | null;
  updated_at: string;
};

export default function RevisionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, qa_comment, updated_at')
        .eq('assigned_to', user.id)
        .eq('status', 'rejected')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) load();
    }, [user?.id, load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('revisions.title')}</Text>
      <Text style={styles.subtitle}>{t('revisions.subtitle')}</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#3b82f6" />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('revisions.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.type}>{item.type ?? '—'}</Text>
              {item.qa_comment ? (
                <View style={styles.feedback}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fbbf24" />
                  <Text style={styles.feedbackText}>{item.qa_comment}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.btn}
                onPress={() => router.push(getWorkbenchPathForTask(item as unknown as Record<string, unknown>) as any)}
              >
                <Text style={styles.btnText}>{t('revisions.openTask')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#f8fafc' },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 8, marginBottom: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 40 },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#f1f5f9' },
  type: { fontSize: 13, color: '#64748b', marginTop: 4 },
  feedback: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-start' },
  feedbackText: { flex: 1, fontSize: 14, color: '#fde68a', lineHeight: 20 },
  btn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 48, fontSize: 15 },
});
