import React from 'react';
import { Redirect } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function TabsIndex() {
  const { user, loading, isBlocked, signOut, isAdmin } = useAuth();
  
  if (loading) return null;
  
  // Check if user is blocked
  if (isBlocked) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="lock-closed" size={80} color="#ef4444" />
          <Text style={styles.title}>Account Suspended</Text>
          <Text style={styles.message}>
            Your account is suspended. Please contact admin.
          </Text>
          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  
  // Admin users go to assignments board
  if (isAdmin) {
    return <Redirect href="/assignments" />;
  }
  
  // Regular users get UserView with grid layout
  return <UserView user={user} />;
}

// UserView component for regular users
function UserView({ user }: { user: any }) {
  const [tasks, setTasks] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    const fetchTasks = async () => {
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        setTasks(data || []);
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  if (loading) {
    return (
      <View style={userStyles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={userStyles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={userStyles.container} contentContainerStyle={userStyles.scrollContent}>
      <View style={userStyles.header}>
        <Text style={userStyles.headerTitle}>Dashboard</Text>
        <Text style={userStyles.headerSubtitle}>Choose a task to get started</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10 }}>
  {tasks.map((item) => (
    <TouchableOpacity 
      key={item.id} 
      onPress={() => item.id ? router.push({ pathname: '/task/[id]', params: { id: item.id } }) : alert('ID Yok')}
      style={{ width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 15, marginBottom: 15, elevation: 3 }}>
       <Text style={{ textAlign: 'center', fontSize: 24 }}>{item.type === 'audio' ? '🎵' : item.type === 'image' ? '🖼️' : '🎥'}</Text>
       <Text style={{ fontWeight: 'bold', textAlign: 'center', marginTop: 10 }}>{item.title}</Text>
       <Text style={{ color: 'green', marginVertical: 5 }}>{item.price} TL</Text>
       <View style={{ backgroundColor: item.type === 'audio' ? '#3b82f6' : item.type === 'image' ? '#ec4899' : '#10b981', padding: 8, borderRadius: 6 }}>
         <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>Start Task</Text>
       </View>
    </TouchableOpacity>
  ))}
</View>
    </ScrollView>
  );
}

const userStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748b',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  signOutButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signOutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
