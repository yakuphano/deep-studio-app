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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  client_name: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  price: number | null;
}

export default function AdminTasksPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = useCallback(async () => {
    console.log('FETCH START: fetchTasks');
    let timeoutId: NodeJS.Timeout;
    
    try {
      setLoading(true);
      
      // Timeout safeguard
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
      } else {
        console.log('Tasks fetched successfully:', data?.length || 0);
        setTasks(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      // Clear timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // CRITICAL: Always set loading to false
      console.log('FETCH END: fetchTasks');
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, []); // Empty dependency - run once only

  const handleDeleteTask = async (taskId: string) => {
    console.log('Attempting to delete task with ID:', taskId);
    
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Calling supabase.from(tasks).delete().eq(id, taskId)...');
              
              const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);

              console.log('Delete operation completed. Error:', error);

              if (error) {
                console.error('Delete failed:', error);
                window.alert(`Delete failed: ${error.message}`);
              } else {
                console.log('Delete successful, updating UI state...');
                
                // Instant UI update - remove task from local state
                setTasks(prev => {
                  console.log('Filtering tasks, current count:', prev.length);
                  const filtered = prev.filter(t => t.id !== taskId);
                  console.log('After filter, count:', filtered.length);
                  return filtered;
                });
                
                window.alert('Task deleted successfully');
              }
            } catch (error: any) {
              console.error('Delete error:', error);
              window.alert(`Delete failed: ${error.message || error}`);
            }
          },
        },
      ]
    );
  };

  const renderTaskItem = ({ item }: { item: Task }) => (
    <View style={styles.taskCard}>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          console.log('Delete button pressed for task:', item.id);
          handleDeleteTask(item.id);
        }}
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
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Status:</Text>
            <Text style={styles.metaValue}>{item.status}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Client:</Text>
            <Text style={styles.metaValue}>{item.client_name}</Text>
          </View>
          {item.price && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Price:</Text>
              <Text style={styles.taskPrice}>${item.price}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

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
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#3b82f6" />
          <Text style={styles.backButtonText}>Back to Admin</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Manage Tasks</Text>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={() => {
              console.log('Manual refresh triggered');
              fetchTasks();
            }}
          >
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        
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
    backgroundColor: '#0f172a' 
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
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
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
