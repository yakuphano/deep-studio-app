import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type User = {
  id: string;
  email: string;
  username?: string;
  role: string;
  is_blocked: boolean;
  languages?: string[];
  created_at: string;
};

function ActionCard({
  icon,
  iconColor,
  label,
  onPress,
  styles,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <Ionicons name={icon} size={24} color={iconColor} style={styles.actionCardIcon} />
      <Text style={styles.actionCardLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AdminPanelScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useProfile();

  // KRITIK: Tüm useState hook'ları en başta tanımla - hooks order violation'ı engelle
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    activeTasks: 0,
    activeTasksTypeBreakdown: {} as Record<string, number>,
    pendingPayments: 0,
    monthlyRevenue: 0,
    completionRate: 0,
    completedTasks: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  
  // Modal states - removed Add New Annotator modal (moved to users page)
  // const [showModal, setShowModal] = useState(false);
  // const [formData, setFormData] = useState({
  //   username: '',
  //   email: '',
  //   password: '',
  //   languages: [] as string[],
  // });
  
  const isDevAdmin = user?.email === 'yakup.hano@deepannotation.ai';
  const hasAdminAccess = isAdmin === true || isDevAdmin;
  const adminStatusLoading = isAdmin === null && !isDevAdmin;

  const fetchDashboardStats = useCallback(async () => {
    console.log('FETCH START: fetchDashboardStats');
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      setStatsLoading(true);
      
      // Timeout safeguard
      timeoutId = setTimeout(() => {
        console.warn('FETCH TIMEOUT: fetchDashboardStats took more than 5 seconds');
        setStatsLoading(false);
      }, 5000);
      
      // 1. Total Users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      // 2. Active Tasks
      const { data: activeTasksData, count: activeTasks } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, created_at, updated_at', { count: 'exact' })
        .eq('status', 'pending')
        .eq('is_pool_task', true)
        .order('created_at', { ascending: false });
      
      const activeTasksTypeBreakdown = activeTasksData?.reduce((acc, task) => {
        const type = task.type || task.category || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      // 3. Pending Payments
      let pendingPayments = 0;
      try {
        const { count: paymentsCount } = await supabase
          .from('payout_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        pendingPayments = paymentsCount || 0;
      } catch (e) {
        pendingPayments = 0;
      }
      
      // 4. Monthly Revenue — ay sonu takvim günü yerine bir sonraki ayın 1’i (Nisan → 2026-05-01)
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [yStr, mStr] = currentMonth.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const nextMonthStart =
        m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('price')
        .eq('status', 'completed') // Simple .eq() instead of .in()
        .eq('is_pool_task', true)
        .gte('updated_at', `${currentMonth}-01`)
        .lt('updated_at', nextMonthStart);
      
      const monthlyRevenue = completedTasks?.reduce((sum, task) => sum + (task.price || 0), 0) || 0;
      
      // 5. Completion Rate - FIXED: Remove problematic .in() query
      const { count: totalTasks } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_pool_task', true);
      
      const { count: completedTasksCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed') // Simple .eq() instead of .in()
        .eq('is_pool_task', true);
      
      const completionRate = totalTasks && totalTasks > 0 && completedTasksCount
        ? Math.round((completedTasksCount / totalTasks) * 100)
        : 0;
      
      // 6. Completed Tasks - FIXED: Remove problematic .in() query
      const { count: completedTasksForModal } = await supabase
        .from('tasks')
        .select('id, title, type, category, status, updated_at', { count: 'exact' })
        .eq('status', 'completed') // Simple .eq() instead of .in()
        .eq('is_pool_task', true)
        .order('updated_at', { ascending: false });
      
      setDashboardStats({
        totalUsers: totalUsers || 0,
        activeTasks: activeTasks || 0,
        activeTasksTypeBreakdown,
        pendingPayments,
        monthlyRevenue,
        completionRate,
        completedTasks: completedTasksForModal || 0,
      });
    } catch (error: any) {
      console.error('Error fetching dashboard stats:', error);
      window.alert(`Dashboard fetch error: ${error.message || error}`);
    } finally {
      // Clear timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // CRITICAL: Always set loading to false
      console.log('FETCH END: fetchDashboardStats');
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminStatusLoading || !hasAdminAccess) return;
    void fetchDashboardStats();
  }, [adminStatusLoading, hasAdminAccess, fetchDashboardStats]);

  if (adminStatusLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: themeColors.text, fontSize: 16, marginTop: 16 }}>Checking admin access...</Text>
      </View>
    );
  }

  if (!hasAdminAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: themeColors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#ef4444', fontSize: 18 }}>Access Denied</Text>
        <Text style={{ color: themeColors.textMuted, fontSize: 14, marginTop: 8 }}>You don't have admin privileges</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/dashboard')}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
          <Text style={styles.backButtonText}>Back to Tasks</Text>
        </TouchableOpacity>

        <Text style={styles.pageTitle}>Admin Dashboard</Text>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={18} color="#60a5fa" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.totalUsers}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.totalUsers')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="document-text" size={18} color="#22c55e" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.activeTasks}</Text>
            <Text style={styles.statLabel}>{t('admin.stats.activeTasks')}</Text>
            {!statsLoading && Object.keys(dashboardStats.activeTasksTypeBreakdown).length > 0 && (
              <Text style={styles.typeBreakdown}>
                {Object.entries(dashboardStats.activeTasksTypeBreakdown)
                  .map(([type, count]) => `${count} ${type}`)
                  .join(', ')}
              </Text>
            )}
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.completedTasks}</Text>
            <Text style={styles.statLabel}>Completed Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="wallet" size={18} color="#8b5cf6" />
            <Text style={styles.statValue}>{statsLoading ? '...' : dashboardStats.monthlyRevenue} TL</Text>
            <Text style={styles.statLabel}>{t('admin.stats.monthlyRevenue')}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <ActionCard
            styles={styles}
            icon="add-circle"
            iconColor="#3b82f6"
            label="Create New Task"
            onPress={() => router.push('/admin/tasks/create')}
          />
          <ActionCard
            styles={styles}
            icon="mail"
            iconColor="#06b6d4"
            label={t('admin.messagesAction')}
            onPress={() => router.push('/admin/messages')}
          />
          <ActionCard
            styles={styles}
            icon="shield-checkmark"
            iconColor="#38bdf8"
            label={t('admin.qaReviewAction')}
            onPress={() => router.push('/review')}
          />
          <ActionCard
            styles={styles}
            icon="refresh"
            iconColor="#10b981"
            label="Refresh Analytics"
            onPress={fetchDashboardStats}
          />
          <ActionCard
            styles={styles}
            icon="list-outline"
            iconColor="#8b5cf6"
            label="Recent Tasks"
            onPress={() => router.push('/admin/tasks')}
          />
          <ActionCard
            styles={styles}
            icon="archive-outline"
            iconColor="#f59e0b"
            label="Export Data"
            onPress={() => router.push('/admin/export')}
          />
        </View>

        {/* User Management Section - Always Visible */}
        <View style={styles.userManagementSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={20} color="#3b82f6" />
            <Text style={styles.sectionTitle}>{t('admin.userManagement')}</Text>
          </View>
          <Text style={styles.userManagementHintText}>{t('admin.userManagementHint')}</Text>
          <View style={styles.userManagementActions}>
            <TouchableOpacity
              style={styles.manageAllUsersButton}
              onPress={() => {
                router.push('/admin/users' as any);
              }}
            >
              <Ionicons name="list" size={20} color="#ffffff" />
              <Text style={styles.manageAllUsersButtonText}>{t('adminUsers.openList')}</Text>
            </TouchableOpacity>
            <View style={styles.userActionsRow}>
              <TouchableOpacity
                style={[styles.userManagementButton, styles.userManagementButtonAnnotator]}
                onPress={() => router.push('/admin/users?tab=create-annotator' as any)}
              >
                <Ionicons name="person-add" size={18} color="#ffffff" />
                <Text style={styles.userManagementButtonText}>{t('adminUsers.addAnnotator')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.userManagementButton, styles.userManagementButtonReviewer]}
                onPress={() => router.push('/admin/users?tab=create-reviewer' as any)}
              >
                <Ionicons name="shield-checkmark" size={18} color="#ffffff" />
                <Text style={styles.userManagementButtonText}>{t('adminUsers.addReviewer')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </ScrollView>
      
      {/* Add User Modal - REMOVED - moved to /admin/users page */}
    </SafeAreaView>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: themeColors.background 
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
    backgroundColor: 'transparent',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: themeColors.accent,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    marginVertical: 8,
    backgroundColor: 'transparent',
  },
  statLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  typeBreakdown: {
    fontSize: 10,
    color: themeColors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: themeColors.accent,
    alignItems: 'center',
  },
  actionCardIcon: {
    marginBottom: 8,
  },
  actionCardLabel: {
    fontSize: 12,
    color: themeColors.text,
    textAlign: 'center',
    backgroundColor: 'transparent',
  },
  userManagementSection: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: themeColors.accent,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: themeColors.text,
    backgroundColor: 'transparent',
  },
  userManagementHintText: {
    fontSize: 13,
    color: themeColors.textMuted,
    lineHeight: 18,
    marginBottom: 14,
    backgroundColor: 'transparent',
  },
  userManagementActions: {
    gap: 12,
  },
  userActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  userManagementButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  userManagementButtonAnnotator: {
    backgroundColor: '#2563eb',
  },
  userManagementButtonReviewer: {
    backgroundColor: '#a855f7',
  },
  userManagementButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  manageAllUsersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 12,
    width: '100%',
  },
  manageAllUsersButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
}
