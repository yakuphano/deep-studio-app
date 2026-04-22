import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Platform,
  Pressable,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

interface Task {
  id: string;
  title: string;
  type: string;
  category?: string | null;
  status: string;
  client_name: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  price: number | null;
}

type MediaKind = 'audio' | 'image' | 'video';

/** Listede tür / kategoriye göre eşleşme (ses: transcription dahil) */
function taskMatchesMediaKind(task: Task, kind: MediaKind): boolean {
  const t = (task.type ?? '').toString().toLowerCase();
  const c = (task.category ?? '').toString().toLowerCase();
  switch (kind) {
    case 'audio':
      return t === 'audio' || t === 'transcription' || c === 'audio' || c === 'transcription';
    case 'image':
      return t === 'image' || c === 'image';
    case 'video':
      return t === 'video' || c === 'video';
  }
}

function confirmDestructive(
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>
) {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (ok) void Promise.resolve(onConfirm());
    return;
  }
  Alert.alert(title, message, [
    { text: 'İptal', style: 'cancel' },
    {
      text: 'Sil',
      style: 'destructive',
      onPress: () => void Promise.resolve(onConfirm()),
    },
  ]);
}

export default function AdminTasksPage() {
  const router = useRouter();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);

  const fetchTasks = useCallback(async () => {
    console.log('FETCH START: fetchTasks');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      setLoading(true);

      timeoutId = setTimeout(() => {
        console.warn('FETCH TIMEOUT: fetchTasks took more than 5 seconds');
        setLoading(false);
        setRefreshing(false);
      }, 5000);

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error:', error);
        setTasks([]);
        if (Platform.OS === 'web') {
          window.alert('Görevler yüklenemedi: ' + error.message);
        } else {
          Alert.alert('Hata', error.message);
        }
      } else {
        console.log('Tasks fetched successfully:', data?.length || 0);
        setTasks((data as Task[]) || []);
      }
    } catch (error: unknown) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      console.log('FETCH END: fetchTasks');
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === tasks.length && tasks.length > 0) return new Set();
      return new Set(tasks.map((t) => t.id));
    });
  }, [tasks]);

  const selectByMediaKind = useCallback(
    (kind: MediaKind) => {
      const ids = tasks.filter((t) => taskMatchesMediaKind(t, kind)).map((t) => t.id);
      setSelectedIds(new Set(ids));
      setSelectionMenuOpen(false);
    },
    [tasks]
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const DELETE_CHUNK = 150;

  const deleteTasksByIds = useCallback(
    async (ids: string[]): Promise<{ ok: boolean; message: string }> => {
      if (!ids.length) return { ok: false, message: 'Silinecek görev seçilmedi.' };
      const unique = [...new Set(ids)];

      let totalDeleted = 0;
      for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
        const chunk = unique.slice(i, i + DELETE_CHUNK);
        const { data, error } = await supabase.from('tasks').delete().in('id', chunk).select('id');

        if (error) {
          console.error('Silme hatası:', error);
          return {
            ok: false,
            message:
              error.message ||
              `Supabase silme hatası (${totalDeleted} görev silindi, işlem yarıda kesildi). RLS DELETE iznini kontrol edin.`,
          };
        }
        totalDeleted += data?.length ?? 0;
      }

      if (totalDeleted === 0) {
        return {
          ok: false,
          message:
            'Hiçbir satır silinmedi. Kayıt bulunamadı veya Row Level Security DELETE iznini reddediyor olabilir. Supabase Dashboard → tasks → RLS politikalarını kontrol edin.',
        };
      }

      await fetchTasks();
      clearSelection();
      return { ok: true, message: `${totalDeleted} görev silindi.` };
    },
    [fetchTasks, clearSelection]
  );

  const handleDeleteTask = (taskId: string) => {
    confirmDestructive(
      'Görevi sil',
      'Bu görevi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      async () => {
        setDeleting(true);
        try {
          const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select('id');
          if (error) {
            console.error('Silme hatası:', error);
            const msg =
              error.message ||
              'Görev silinemedi. RLS: authenticated admin kullanıcılarına DELETE izni verildiğinden emin olun.';
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Hata', msg);
            return;
          }
          if (!data?.length) {
            const msg =
              'Kayıt silinmedi (0 satır). ID eşleşmedi veya RLS politikası DELETE engelliyor olabilir.';
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Uyarı', msg);
            return;
          }
          await fetchTasks();
          clearSelection();
          if (Platform.OS === 'web') window.alert('Görev silindi.');
          else Alert.alert('Başarılı', 'Görev silindi.');
        } finally {
          setDeleting(false);
        }
      }
    );
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) {
      if (Platform.OS === 'web') window.alert('Önce listeden görev seçin.');
      else Alert.alert('Uyarı', 'Önce listeden görev seçin.');
      return;
    }
    confirmDestructive(
      'Toplu sil',
      `${ids.length} görevi kalıcı olarak silmek istediğinize emin misiniz?`,
      async () => {
        setDeleting(true);
        try {
          const result = await deleteTasksByIds(ids);
          if (Platform.OS === 'web') window.alert(result.message);
          else Alert.alert(result.ok ? 'Tamam' : 'Hata', result.message);
        } finally {
          setDeleting(false);
        }
      }
    );
  };

  const renderTaskItem = ({ item }: { item: Task }) => {
    const checked = selectedIds.has(item.id);
    return (
      <View style={styles.taskCard}>
        <Pressable
          style={styles.checkboxWrap}
          onPress={() => toggleSelect(item.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
        </Pressable>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteTask(item.id)}
          disabled={deleting}
        >
          <Ionicons name="trash" size={16} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.taskContent}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <View style={styles.taskMetaContainer}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Type:</Text>
              <Text style={styles.metaValue}>{item.type}</Text>
            </View>
            {item.category ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Category:</Text>
                <Text style={styles.metaValue}>{item.category}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status:</Text>
              <Text style={styles.metaValue}>{item.status}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Client:</Text>
              <Text style={styles.metaValue}>{item.client_name}</Text>
            </View>
            {item.price != null && item.price > 0 && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Price:</Text>
                <Text style={styles.taskPrice}>${item.price}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#3b82f6" />
          <Text style={styles.backButtonText}>Back to Admin</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Recent Tasks</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => {
              setRefreshing(true);
              fetchTasks();
            }}
          >
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bulkBar}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={() => setSelectionMenuOpen(true)}
            accessibilityLabel="Seçim menüsü"
          >
            <Ionicons name="menu" size={24} color="#f1f5f9" />
          </TouchableOpacity>
          <View style={styles.selectionSummaryWrap}>
            <Text style={styles.selectionSummary} numberOfLines={1}>
              {selectedIds.size > 0
                ? `${selectedIds.size} görev seçili`
                : 'Seçim için menüyü açın'}
            </Text>
          </View>
          {selectedIds.size > 0 ? (
            <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete} disabled={deleting}>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.bulkDeleteText}>Seçilenleri sil ({selectedIds.size})</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Modal
          visible={selectionMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectionMenuOpen(false)}
        >
          <View style={styles.menuModalRoot}>
            <Pressable
              style={styles.menuBackdrop}
              onPress={() => setSelectionMenuOpen(false)}
              accessibilityLabel="Menüyü kapat"
            />
            <View style={styles.menuSheetWrap} pointerEvents="box-none">
              <View style={styles.menuCard}>
                <View style={styles.menuCardHeader}>
                  <Text style={styles.menuCardTitle}>Seçim</Text>
                  <TouchableOpacity onPress={() => setSelectionMenuOpen(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.menuHint}>Yalnızca bu listedeki görevler seçilir.</Text>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    selectAll();
                    setSelectionMenuOpen(false);
                  }}
                >
                  <Ionicons name="checkbox-outline" size={20} color="#3b82f6" />
                  <Text style={styles.menuItemText}>
                    {selectedIds.size === tasks.length && tasks.length > 0 ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => selectByMediaKind('audio')}>
                  <Ionicons name="musical-notes-outline" size={20} color="#fb7185" />
                  <Text style={styles.menuItemText}>Ses görevlerini seç</Text>
                  <Text style={styles.menuItemBadge}>
                    {tasks.filter((t) => taskMatchesMediaKind(t, 'audio')).length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => selectByMediaKind('image')}>
                  <Ionicons name="image-outline" size={20} color="#4ade80" />
                  <Text style={styles.menuItemText}>Görüntü görevlerini seç</Text>
                  <Text style={styles.menuItemBadge}>
                    {tasks.filter((t) => taskMatchesMediaKind(t, 'image')).length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => selectByMediaKind('video')}>
                  <Ionicons name="videocam-outline" size={20} color="#60a5fa" />
                  <Text style={styles.menuItemText}>Video görevlerini seç</Text>
                  <Text style={styles.menuItemBadge}>
                    {tasks.filter((t) => taskMatchesMediaKind(t, 'video')).length}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemLast]}
                  onPress={() => {
                    clearSelection();
                    setSelectionMenuOpen(false);
                  }}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#94a3b8" />
                  <Text style={[styles.menuItemText, styles.menuItemMuted]}>Tüm seçimleri temizle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <FlatList
          data={tasks}
          renderItem={renderTaskItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchTasks();
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text" size={48} color="#64748b" />
              <Text style={styles.emptyText}>No tasks found</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  bulkBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  bulkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  bulkBtnText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  bulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#b91c1c',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  bulkDeleteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  menuModalRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
  },
  menuSheetWrap: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  menuCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 8,
    maxWidth: 420,
    width: '100%',
  },
  menuItemMuted: {
    color: '#94a3b8',
  },
  menuCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  menuCardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  menuHint: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.6)',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemBadge: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    paddingBottom: 20,
  },
  taskCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    padding: 16,
    paddingLeft: 48,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  checkboxWrap: {
    position: 'absolute',
    left: 12,
    top: 16,
    zIndex: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  deleteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#ef4444',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  taskContent: {
    paddingTop: 8,
    paddingRight: 40,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 12,
  },
  taskMetaContainer: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    minWidth: 60,
  },
  metaValue: {
    fontSize: 14,
    color: '#94a3b8',
    flex: 1,
  },
  taskPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#f8fafc',
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 16,
  },
});
