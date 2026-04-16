import React from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

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

interface TaskListTableProps {
  tasks: Task[];
  onDeleteTask: (taskId: string) => void;
  refreshing?: boolean;
}

export default function TaskListTable({ 
  tasks, 
  onDeleteTask, 
  refreshing = false 
}: TaskListTableProps) {
  
  const renderTaskItem = ({ item }: { item: Task }) => (
    <View style={styles.taskCard}>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          console.log('Delete button pressed for task:', item.id);
          onDeleteTask(item.id);
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

  if (tasks.length === 0 && !refreshing) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="folder-open" size={48} color={colors.textMuted} />
        <Text style={styles.emptyText}>No tasks found</Text>
        <Text style={styles.emptySubtext}>Create your first task to get started</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => {}} // Handled by parent
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 4,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  taskMetaContainer: {
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    minWidth: 50,
  },
  metaValue: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  taskPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentPurple,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
});
