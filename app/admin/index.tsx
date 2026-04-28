import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';

type User = {
  id: string;
  email: string;
  username?: string;
  role: string;
  is_blocked: boolean;
  languages?: string[];
  created_at: string;
};

type ExportTaskType = 'audio' | 'image' | 'video';

function getFormatOptionsForTaskType(exportTaskType: ExportTaskType) {
  if (exportTaskType === 'audio') {
    return [
      { key: 'json', label: 'JSON' },
      { key: 'csv', label: 'CSV' },
      { key: 'txt', label: 'TXT' },
      { key: 'srt', label: 'SRT' },
    ];
  }
  return [
    { key: 'yolo', label: 'YOLO' },
    { key: 'coco', label: 'COCO' },
    { key: 'pascalvoc', label: 'Pascal VOC' },
    { key: 'json', label: 'JSON' },
    { key: 'csv', label: 'CSV' },
  ];
}

function ActionCard({
  icon,
  iconColor,
  label,
  onPress,
}: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <Ionicons name={icon} size={24} color={iconColor} style={styles.actionCardIcon} />
      <Text style={styles.actionCardLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AdminPanelScreen() {
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
  
  // Export states
  const [exportTaskType, setExportTaskType] = useState<'audio' | 'image' | 'video'>('audio');
  const [exportClient, setExportClient] = useState('');
  /** Görevlerde geçen company_name listesi (yeniden eskiye); chip ile seçim */
  const [exportCompanyOptions, setExportCompanyOptions] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<string>('json');
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<'all' | 'last7' | 'last30' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  // const [showPassword, setShowPassword] = useState(false);

  const isDevAdmin = user?.email === 'yakup.hano@deepannotation.ai';
  const hasAdminAccess = isAdmin === true || isDevAdmin;
  const adminStatusLoading = isAdmin === null && !isDevAdmin;

  useEffect(() => {
    const formats = getFormatOptionsForTaskType(exportTaskType);
    setExportFormat(formats[0].key);
  }, [exportTaskType]);

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

  /** Görevlerdeki company_name değerleri: çok şirket varsa chip satırı; varsayılan en son güncellenen görev. */
  useEffect(() => {
    if (adminStatusLoading || !hasAdminAccess) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('company_name')
        .not('company_name', 'is', null)
        .neq('company_name', '')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (cancelled || error || !data?.length) return;
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const row of data) {
        const n = String((row as { company_name?: string | null }).company_name ?? '').trim();
        if (!n || seen.has(n)) continue;
        seen.add(n);
        ordered.push(n);
      }
      const maxOptions = 32;
      setExportCompanyOptions(ordered.slice(0, maxOptions));
      const latest = ordered[0];
      if (latest) setExportClient((prev) => (prev.trim() === '' ? latest : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [adminStatusLoading, hasAdminAccess]);

  if (adminStatusLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: '#f8fafc', fontSize: 16, marginTop: 16 }}>Checking admin access...</Text>
      </View>
    );
  }

  if (!hasAdminAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#ef4444', fontSize: 18 }}>Access Denied</Text>
        <Text style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>You don't have admin privileges</Text>
      </View>
    );
  }

  const languageOptions = [
    { key: 'all', label: 'All Languages' },
    { key: 'en', label: 'English' },
    { key: 'tr', label: 'Turkish' },
    { key: 'ku', label: 'Kurdish' },
    { key: 'az', label: 'Azerbaijani Turkish' },
  ];

  const handleExport = async () => {
    if (!exportClient.trim()) {
      Alert.alert('Validation Error', 'Please enter a company or client name.');
      return;
    }

    if (dateRange === 'custom' && (!customStartDate || !customEndDate)) {
      Alert.alert('Validation Error', 'Please enter both start and end dates.');
      return;
    }

    setExporting(true);
    try {
      const cols =
        'id, title, status, price, language, category, audio_url, image_url, transcription, annotation_data, created_at, updated_at, client_name, company_name, assigned_to, is_pool_task';

      let query = supabase.from('tasks').select(cols).eq('status', 'completed');

      // Filter by task type
      if (exportTaskType) {
        query = query.eq('type', exportTaskType);
      }

      // Görev oluştururken company_name; eski kayıtlar için client_name — ikisinden biri eşleşsin
      const raw = exportClient.trim();
      const q = raw.replace(/\\/g, '\\\\').replace(/,/g, '\\,');
      const pat = `%${q}%`;
      query = query.or(`client_name.ilike.${pat},company_name.ilike.${pat}`);
      
      // Filter by language (only for Audio tasks)
      if (exportTaskType === 'audio' && selectedLanguage !== 'all') {
        query = query.eq('language', selectedLanguage);
      }
      
      // Filter by date range
      if (dateRange === 'last7') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        query = query.gte('updated_at', sevenDaysAgo.toISOString());
      } else if (dateRange === 'last30') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte('updated_at', thirtyDaysAgo.toISOString());
      } else if (dateRange === 'custom') {
        query = query.gte('updated_at', `${customStartDate}T00:00:00Z`);
        query = query.lte('updated_at', `${customEndDate}T23:59:59Z`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        Alert.alert('No Data', 'No completed tasks found for selected criteria.');
        return;
      }

      // Process data based on export format
      let processedData: any;
      let fileName: string;
      let mimeType: string;

      if (exportFormat === 'yolo') {
        processedData = data.map(task => ({
          filename: task.title.replace(/[^a-zA-Z0-9]/g, '_'),
          width: 640,
          height: 480,
          class: task.category || 'object',
          xmin: 0,
          ymin: 0,
          xmax: 100,
          ymax: 100,
        }));
        fileName = `yolo_export_${exportClient}_${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
      } else if (exportFormat === 'coco') {
        processedData = {
          images: data.map((task, index) => ({
            id: index + 1,
            width: 640,
            height: 480,
            file_name: task.title.replace(/[^a-zA-Z0-9]/g, '_'),
          })),
          annotations: data.map((task, index) => ({
            id: index + 1,
            image_id: index + 1,
            category_id: 1,
            bbox: [0, 0, 100, 100],
            area: 10000,
          })),
        };
        fileName = `coco_export_${exportClient}_${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else if (exportFormat === 'pascalvoc') {
        processedData = data.map(task => {
          const xml = `<annotation>
  <folder>images</folder>
  <filename>${task.title.replace(/[^a-zA-Z0-9]/g, '_')}</filename>
  <size>
    <width>640</width>
    <height>480</height>
    <depth>3</depth>
  </size>
  <object>
    <name>${task.category || 'object'}</name>
    <pose>Unspecified</pose>
    <truncated>0</truncated>
    <difficult>0</difficult>
    <bndbox>
      <xmin>0</xmin>
      <ymin>0</ymin>
      <xmax>100</xmax>
      <ymax>100</ymax>
    </bndbox>
  </object>
</annotation>`;
          return { filename: task.title, xml };
        });
        fileName = `pascalvoc_export_${exportClient}_${new Date().toISOString().split('T')[0]}.zip`;
        mimeType = 'application/zip';
      } else if (exportFormat === 'srt') {
        processedData = data.map((task, index) => {
          const startTime = new Date(task.created_at);
          const endTime = new Date(startTime.getTime() + 5000); // 5 seconds per task
          const start = startTime.toISOString().substr(11, 12);
          const end = endTime.toISOString().substr(11, 12);
          return `${index + 1}\n${start} --> ${end}\n${task.transcription || task.title}\n\n`;
        }).join('');
        fileName = `srt_export_${exportClient}_${new Date().toISOString().split('T')[0]}.srt`;
        mimeType = 'text/plain';
      } else if (exportFormat === 'csv') {
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(task => 
          Object.values(task).map(val => `"${val}"`).join(',')
        ).join('\n');
        processedData = `${headers}\n${rows}`;
        fileName = `csv_export_${exportClient}_${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else if (exportFormat === 'txt') {
        processedData = data.map(task => 
          `${task.title}\n${task.transcription || 'No transcription available'}\n---\n`
        ).join('\n');
        fileName = `txt_export_${exportClient}_${new Date().toISOString().split('T')[0]}.txt`;
        mimeType = 'text/plain';
      } else {
        // JSON (default)
        processedData = JSON.stringify(data, null, 2);
        fileName = `json_export_${exportClient}_${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      }

      // Create download
      const blob = new Blob([processedData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('Exporting data for:', exportClient, 'Format:', exportFormat);
      Alert.alert('Success', `${data.length} tasks exported successfully as ${exportFormat.toUpperCase()}.`);

    } catch (error) {
      console.error('Export Error:', error);
      Alert.alert('Export Failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/dashboard')}>
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
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
          <ActionCard icon="add-circle" iconColor="#3b82f6" label="Create New Task" onPress={() => router.push('/admin/tasks/create')} />
          <ActionCard icon="refresh" iconColor="#10b981" label="Refresh Analytics" onPress={fetchDashboardStats} />
          <ActionCard icon="list-outline" iconColor="#8b5cf6" label="Recent Tasks" onPress={() => router.push('/admin/tasks')} />
          <ActionCard icon="download" iconColor="#f59e0b" label="Export Data" onPress={() => {}} />
        </View>

        {/* User Management Section - Always Visible */}
        <View style={styles.userManagementSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={20} color="#3b82f6" />
            <Text style={styles.sectionTitle}>User Management</Text>
          </View>
          <TouchableOpacity 
            style={styles.manageAllUsersButton} 
            onPress={() => {
              router.push('/admin/users');
            }}
          >
            <Ionicons name="people" size={20} color="#ffffff" />
            <Text style={styles.manageAllUsersButtonText}>Manage All Users</Text>
          </TouchableOpacity>
        </View>

        {/* Export Data Section */}
        <View style={styles.exportSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="download" size={20} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Export Data</Text>
          </View>
          
          <View style={styles.exportForm}>
            <Text style={styles.exportLabel}>Task Type</Text>
            <View style={styles.exportTaskTypeRow}>
              <TouchableOpacity 
                style={[styles.exportChip, exportTaskType === 'audio' && styles.exportChipActive]} 
                onPress={() => setExportTaskType('audio')}
              >
                <Text style={[styles.exportChipText, exportTaskType === 'audio' && styles.exportChipTextActive]}>Audio</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.exportChip, exportTaskType === 'image' && styles.exportChipActive]} 
                onPress={() => setExportTaskType('image')}
              >
                <Text style={[styles.exportChipText, exportTaskType === 'image' && styles.exportChipTextActive]}>Image</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.exportChip, exportTaskType === 'video' && styles.exportChipActive]} 
                onPress={() => setExportTaskType('video')}
              >
                <Text style={[styles.exportChipText, exportTaskType === 'video' && styles.exportChipTextActive]}>Video</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.exportLabel}>Export Type</Text>
            <View style={styles.exportFormatRow}>
              {getFormatOptionsForTaskType(exportTaskType).map((format) => (
                <TouchableOpacity
                  key={format.key}
                  style={[styles.formatChip, exportFormat === format.key && styles.formatChipActive]}
                  onPress={() => setExportFormat(format.key)}
                >
                  <Text style={[styles.formatChipText, exportFormat === format.key && styles.formatChipTextActive]}>
                    {format.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles.exportLabel}>Company name</Text>
            {exportCompanyOptions.length > 1 ? (
              <>
                <Text style={styles.exportHint}>
                  Kayıtlı şirketler (son aktiviteye göre). Birine dokunun veya alanı elle düzenleyin.
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.companyPickerScroll}
                  contentContainerStyle={styles.companyPickerRow}
                >
                  {exportCompanyOptions.map((name) => {
                    const active = exportClient.trim() === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.companyPickerChip, active && styles.companyPickerChipActive]}
                        onPress={() => setExportClient(name)}
                      >
                        <Text style={[styles.companyPickerChipText, active && styles.companyPickerChipTextActive]} numberOfLines={1}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
            <TextInput
              style={styles.exportInput}
              value={exportClient}
              onChangeText={setExportClient}
              placeholder="Şirket adı veya filtre metni"
              placeholderTextColor="#64748b"
            />
            
            {/* Language Filter - Only show for Audio tasks */}
            {exportTaskType === 'audio' && (
              <>
                <Text style={styles.exportLabel}>Select Language</Text>
                <View style={styles.languageFilterRow}>
                  {languageOptions.map((lang) => (
                    <TouchableOpacity
                      key={lang.key}
                      style={[styles.languageChip, selectedLanguage === lang.key && styles.languageChipActive]}
                      onPress={() => setSelectedLanguage(lang.key)}
                    >
                      <Text style={[styles.languageChipText, selectedLanguage === lang.key && styles.languageChipTextActive]}>
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            
            <Text style={styles.exportLabel}>Date Range</Text>
            <View style={styles.dateRangeRow}>
              <TouchableOpacity
                style={[styles.dateChip, dateRange === 'all' && styles.dateChipActive]}
                onPress={() => setDateRange('all')}
              >
                <Text style={[styles.dateChipText, dateRange === 'all' && styles.dateChipTextActive]}>All Time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateChip, dateRange === 'last7' && styles.dateChipActive]}
                onPress={() => setDateRange('last7')}
              >
                <Text style={[styles.dateChipText, dateRange === 'last7' && styles.dateChipTextActive]}>Last 7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateChip, dateRange === 'last30' && styles.dateChipActive]}
                onPress={() => setDateRange('last30')}
              >
                <Text style={[styles.dateChipText, dateRange === 'last30' && styles.dateChipTextActive]}>Last 30 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateChip, dateRange === 'custom' && styles.dateChipActive]}
                onPress={() => setDateRange('custom')}
              >
                <Text style={[styles.dateChipText, dateRange === 'custom' && styles.dateChipTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>
            
            {dateRange === 'custom' && (
              <View style={styles.customDateContainer}>
                <TextInput
                  style={styles.dateInput}
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                  placeholder="Start Date (YYYY-MM-DD)"
                  placeholderTextColor="#64748b"
                />
                <TextInput
                  style={styles.dateInput}
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                  placeholder="End Date (YYYY-MM-DD)"
                  placeholderTextColor="#64748b"
                />
              </View>
            )}
            
            <TouchableOpacity 
              style={[styles.exportButton, exporting && styles.exportButtonDisabled]} 
              onPress={handleExport}
              disabled={exporting}
            >
              <Text style={styles.exportButtonText}>{exporting ? 'Exporting...' : 'Export'}</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
      
      {/* Add User Modal - REMOVED - moved to /admin/users page */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a' 
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#f8fafc' 
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  typeBreakdown: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  actionCardIcon: {
    marginBottom: 8,
  },
  actionCardLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  userManagementSection: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: '#f8fafc',
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
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
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
  // Export Section Styles
  exportSection: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginTop: 24,
  },
  exportForm: {
    gap: 16,
  },
  exportLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  exportHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
    lineHeight: 16,
  },
  companyPickerScroll: {
    marginBottom: 8,
    maxHeight: 44,
  },
  companyPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  companyPickerChip: {
    maxWidth: 200,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  companyPickerChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
  },
  companyPickerChipText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500',
  },
  companyPickerChipTextActive: {
    color: '#fbbf24',
  },
  exportTaskTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  exportChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  exportChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  exportChipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  exportChipTextActive: {
    color: '#3b82f6',
  },
  exportInput: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 16,
    marginBottom: 16,
  },
  exportButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Format Selection Styles
  exportFormatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  formatChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 60,
  },
  formatChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  formatChipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  formatChipTextActive: {
    color: '#3b82f6',
  },
  // Date Range Styles
  dateRangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  dateChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dateChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  dateChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  dateChipTextActive: {
    color: '#3b82f6',
  },
  customDateContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateInput: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 14,
  },
  // Language Filter Styles
  languageFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  languageChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  languageChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3b82f6',
  },
  languageChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  languageChipTextActive: {
    color: '#3b82f6',
  },
});
