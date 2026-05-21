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
  TextInput,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type User = {
  id: string;
  email: string;
  username?: string;
  role: string;
  is_admin?: boolean;
  is_blocked: boolean;
  languages?: string[];
  languages_expertise?: string[] | string | null;
  created_at: string;
};

function roleBadgeBackground(role: string | undefined, isAdmin?: boolean): string {
  const r = (role ?? '').toLowerCase();
  if (r === 'admin' || isAdmin === true) return '#ef4444';
  if (r === 'reviewer') return '#a855f7';
  return '#3b82f6';
}

function canonicalAccountRole(role: string | undefined, isAdmin?: boolean): 'admin' | 'reviewer' | 'annotator' {
  const r = (role ?? '').toLowerCase();
  if (r === 'admin' || isAdmin === true) return 'admin';
  if (r === 'reviewer') return 'reviewer';
  return 'annotator';
}

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();
  const tabParam = Array.isArray(tab) ? tab[0] : tab;
  const activeTab: 'list' | 'create-annotator' | 'create-reviewer' =
    tabParam === 'create-annotator' || tabParam === 'create-reviewer' ? tabParam : 'list';

  const goTab = useCallback(
    (next: 'list' | 'create-annotator' | 'create-reviewer') => {
      if (next === 'list') {
        router.replace('/admin/users' as any);
      } else {
        router.replace(`/admin/users?tab=${next}` as any);
      }
    },
    [router],
  );

  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const { width } = useWindowDimensions();

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    languages: [] as string[],
    accountRole: 'annotator' as 'annotator' | 'reviewer',
  });

  const availableLanguages = [
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Turkish' },
    { code: 'ku', name: 'Kurdish' },
    { code: 'az', name: 'Azerbaijani' },
  ];

  const fetchUsers = useCallback(async () => {
    console.log('FETCH START: fetchUsers');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    try {
      setLoading(true);
      console.log('Fetching users from profiles table...');
      
      // Timeout safeguard
      timeoutId = setTimeout(() => {
        console.warn('FETCH TIMEOUT: fetchUsers took more than 5 seconds');
        setLoading(false);
      }, 5000);
      
      // CRITICAL: Check if profiles table exists and fetch all users
      console.log('Executing Supabase query on profiles table...');
      const { data, error } = await supabase
        .from('profiles')
        .select('*'); // Select all columns to see what's available

      console.log('RAW DATA FROM SUPABASE:', { data, error });
      console.log('Data type:', typeof data);
      console.log('Data length:', data?.length || 0);
      console.log('Data sample:', data?.slice(0, 2));

      if (error) {
        console.error('Database error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        setUsers([]);
      } else {
        console.log('Users fetched successfully:', data?.length || 0);
        console.log('Sample users:', data?.slice(0, 3));
        
        // CRITICAL: Set users data FIRST, then clear loading
        setUsers(data || []);
      }
    } catch (error: any) {
      console.error('Critical error in fetchUsers:', {
        message: error.message,
        stack: error.stack
      });
      setUsers([]);
    } finally {
      // Clear timeout
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      
      // CRITICAL: Always set loading to false AFTER data is set
      console.log('FETCH END: fetchUsers');
      setLoading(false);
    }
  }, []); // Empty dependency - run once only

  useEffect(() => {
    fetchUsers();
  }, []); // Remove fetchUsers from dependencies to prevent infinite loop

  useEffect(() => {
    if (activeTab === 'create-reviewer') {
      setFormData((prev) => ({ ...prev, accountRole: 'reviewer' }));
    } else if (activeTab === 'create-annotator') {
      setFormData((prev) => ({ ...prev, accountRole: 'annotator' }));
    }
  }, [activeTab]);

  const formatRoleLabel = (row: User) => {
    const key = canonicalAccountRole(row.role, row.is_admin);
    if (key === 'admin') return t('adminUsers.roleAdmin');
    if (key === 'reviewer') return t('adminUsers.roleReviewer');
    return t('adminUsers.roleAnnotator');
  };

  const handleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_blocked: !isBlocked })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, is_blocked: !isBlocked } : user
      ));

      Alert.alert(
        t('adminUsers.statusUpdated'),
        !isBlocked ? t('adminUsers.annotatorBlocked') : t('adminUsers.annotatorUnblocked')
      );
    } catch (error) {
      console.error('Error blocking user:', error);
      Alert.alert(t('login.errorTitle'), t('adminUsers.statusUpdateError'));
    }
  };

  const handleOpenRoleModal = (u: User) => {
    if (u.id === user?.id) {
      Alert.alert(t('adminUsers.changeRoleTitle'), t('adminUsers.cannotChangeOwnRole'));
      return;
    }
    setRoleModalUser(u);
    setShowRoleModal(true);
  };

  const handleApplyRole = async (newRole: 'admin' | 'reviewer' | 'annotator') => {
    if (!roleModalUser) return;
    try {
      const isAdmin = newRole === 'admin';
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, is_admin: isAdmin })
        .eq('id', roleModalUser.id);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((row) =>
          row.id === roleModalUser.id ? { ...row, role: newRole, is_admin: isAdmin } : row
        )
      );
      Alert.alert(t('adminUsers.roleUpdated'));
      setShowRoleModal(false);
      setRoleModalUser(null);
    } catch (error) {
      console.error('Error updating role:', error);
      Alert.alert(
        t('adminUsers.roleUpdateError'),
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setShowNewPassword(false);
    setShowResetPasswordModal(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!selectedUser || !newPassword) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }

    try {
      const { error } = await supabase.auth.admin.updateUserById(
        selectedUser.id,
        { password: newPassword }
      );

      if (error) throw error;

      Alert.alert('Success', 'Password reset successfully');
      setShowResetPasswordModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      Alert.alert('Error', 'Failed to reset password');
    }
  };

  const handleCreateAccount = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        console.error(`ERROR: ${authError.message}`);
        Alert.alert(t('login.errorTitle'), authError.message);
        return;
      }

      if (authData.user) {
        const role = formData.accountRole === 'reviewer' ? 'reviewer' : 'annotator';
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          username: formData.username,
          email: formData.email,
          role,
          is_admin: false,
          languages: formData.languages,
        });

        if (profileError) {
          console.error('Profile insert failed:', profileError);
          Alert.alert(t('login.errorTitle'), profileError.message);
        } else {
          goTab('list');
          setFormData({
            username: '',
            email: '',
            password: '',
            languages: [],
            accountRole: 'annotator',
          });
          fetchUsers();
        }
      }
    } catch (error: unknown) {
      console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
      Alert.alert(t('login.errorTitle'), error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreating(false);
    }
  };

  const toggleLanguage = (langCode: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(langCode)
        ? prev.languages.filter(l => l !== langCode)
        : [...prev.languages, langCode],
    }));
  };

  const handleDeleteUser = async (userId: string) => {
    Alert.alert(
      t('adminUsers.deleteAccountTitle'),
      t('adminUsers.deleteAccountConfirm'),
      [
        { text: t('login.cancel'), style: 'cancel' },
        {
          text: t('adminUsers.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId);

              if (error) {
                console.error('Delete error:', error);
                Alert.alert(t('login.errorTitle'), t('adminUsers.roleUpdateError'));
              } else {
                Alert.alert(t('adminUsers.statusUpdated'));
                fetchUsers();
              }
            } catch (error) {
              console.error('Delete user error:', error);
              Alert.alert(t('login.errorTitle'), t('adminUsers.roleUpdateError'));
            }
          },
        },
      ]
    );
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.userRowWrap}>
      <View style={styles.tableRow}>
        <View style={styles.tableCell}>
          <Text style={styles.tableText}>{item.username || 'N/A'}</Text>
        </View>
        <View style={styles.tableCell}>
          <Text style={styles.tableText}>{item.email}</Text>
        </View>
        <View style={styles.tableCell}>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: roleBadgeBackground(item.role, item.is_admin) },
            ]}
          >
            <Text style={styles.roleText}>{formatRoleLabel(item)}</Text>
          </View>
        </View>
        <View style={styles.tableCell}>
          <Text style={styles.tableText}>
            {(() => {
              const languagesData = item.languages || item.languages_expertise;

              if (languagesData && Array.isArray(languagesData) && languagesData.length > 0) {
                const languageNames = languagesData.map((code) => {
                  const lang = availableLanguages.find((l) => l.code === code);
                  return lang ? lang.name : code;
                });
                return languageNames.join(', ');
              }
              if (typeof languagesData === 'string' && languagesData.trim()) {
                try {
                  const parsed = JSON.parse(languagesData);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    const languageNames = parsed.map((code: string) => {
                      const lang = availableLanguages.find((l) => l.code === code);
                      return lang ? lang.name : code;
                    });
                    return languageNames.join(', ');
                  }
                } catch {
                  return languagesData;
                }
              }
              return <Text style={styles.noLanguagesText}>{t('adminUsers.languagesNone')}</Text>;
            })()}
          </Text>
        </View>
        <View style={styles.tableCell}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.is_blocked ? '#ef4444' : '#10b981' },
            ]}
          >
            <Text style={styles.statusText}>
              {item.is_blocked ? 'Blocked' : 'Active'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.actionToolbar}>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => handleOpenRoleModal(item)}
          accessibilityLabel={t('adminUsers.changeRole')}
        >
          <Ionicons name="shield-checkmark" size={18} color="#e9d5ff" />
          <Text style={styles.toolbarBtnText}>{t('adminUsers.changeRole')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleResetPassword(item)}>
          <Ionicons name="key" size={18} color="#fde68a" />
          <Text style={styles.toolbarBtnText}>{t('adminUsers.toolbarPassword')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolbarBtn}
          onPress={() => handleBlockUser(item.id, item.is_blocked)}
        >
          <Ionicons
            name={item.is_blocked ? 'checkmark-circle' : 'close-circle'}
            size={18}
            color={item.is_blocked ? '#86efac' : '#fecaca'}
          />
          <Text style={styles.toolbarBtnText}>
            {item.is_blocked ? t('adminUsers.toolbarUnblock') : t('adminUsers.toolbarBlock')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleDeleteUser(item.id)}>
          <Ionicons name="trash" size={18} color="#fecaca" />
          <Text style={styles.toolbarBtnText}>{t('adminUsers.deleteConfirm')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
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
          
          <TouchableOpacity
            style={styles.addUserButton}
            onPress={() => goTab('create-annotator')}
          >
            <Ionicons name="person-add" size={16} color="#ffffff" />
            <Text style={styles.addUserButtonText}>+ {t('adminUsers.addAccount')}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>{t('adminUsers.loadingAccounts')}</Text>
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
        
        <TouchableOpacity
          style={styles.addUserButton}
          onPress={() => goTab('create-annotator')}
        >
          <Ionicons name="person-add" size={16} color="#ffffff" />
          <Text style={styles.addUserButtonText}>+ {t('adminUsers.addAccount')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>{t('adminUsers.pageTitle')}</Text>
            {activeTab === 'list' ? (
              <Text style={styles.pageHint}>{t('adminUsers.roleToolbarHint')}</Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={() => fetchUsers()}>
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'list' && styles.tabPillActive]}
            onPress={() => goTab('list')}
          >
            <Ionicons name="list" size={16} color={activeTab === 'list' ? '#e0f2fe' : '#64748b'} />
            <Text style={[styles.tabPillText, activeTab === 'list' && styles.tabPillTextActive]}>
              {t('adminUsers.tabList')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabPill,
              styles.tabPillAnnotator,
              activeTab === 'create-annotator' && styles.tabPillAnnotatorActive,
            ]}
            onPress={() => goTab('create-annotator')}
          >
            <Ionicons
              name="person-add"
              size={16}
              color={activeTab === 'create-annotator' ? '#fff' : '#93c5fd'}
            />
            <Text
              style={[
                styles.tabPillText,
                activeTab === 'create-annotator' && styles.tabPillTextOnAccent,
              ]}
            >
              {t('adminUsers.tabCreateAnnotator')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabPill,
              styles.tabPillReviewer,
              activeTab === 'create-reviewer' && styles.tabPillReviewerActive,
            ]}
            onPress={() => goTab('create-reviewer')}
          >
            <Ionicons
              name="shield-checkmark"
              size={16}
              color={activeTab === 'create-reviewer' ? '#fff' : '#e9d5ff'}
            />
            <Text
              style={[
                styles.tabPillText,
                activeTab === 'create-reviewer' && styles.tabPillTextOnAccent,
              ]}
            >
              {t('adminUsers.tabCreateReviewer')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'list' ? (
          <>
            <View style={styles.tableHeader}>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>Username</Text>
              </View>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>Email</Text>
              </View>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>Role</Text>
              </View>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>Languages</Text>
              </View>
              <View style={styles.tableHeaderCell}>
                <Text style={styles.tableHeaderText}>Status</Text>
              </View>
            </View>

            <FlatList
              data={users}
              renderItem={renderUserItem}
              keyExtractor={(item) => item.id}
              style={styles.tableContainer}
              refreshing={refreshing}
              onRefresh={fetchUsers}
              showsVerticalScrollIndicator={false}
            />
          </>
        ) : (
          <ScrollView
            style={styles.createScroll}
            contentContainerStyle={styles.createScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={
                activeTab === 'create-annotator'
                  ? styles.createRoleBannerAnnotator
                  : styles.createRoleBannerReviewer
              }
            >
              <Text style={styles.createScreenTitle}>
                {activeTab === 'create-annotator'
                  ? t('adminUsers.createAnnotatorTitle')
                  : t('adminUsers.createReviewerTitle')}
              </Text>
              <Text style={styles.createScreenSubtitle}>{t('adminUsers.createScreenHint')}</Text>
            </View>

            <TouchableOpacity style={styles.backToListBtn} onPress={() => goTab('list')}>
              <Ionicons name="arrow-back" size={18} color="#94a3b8" />
              <Text style={styles.backToListText}>{t('adminUsers.backToList')}</Text>
            </TouchableOpacity>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={formData.username}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, username: text }))}
                placeholder="Enter username"
                placeholderTextColor="#64748b"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="Enter email"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={formData.password}
                  onChangeText={(text) => setFormData((prev) => ({ ...prev, password: text }))}
                  placeholder="Enter password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Languages</Text>
              <View style={styles.languagesContainer}>
                {availableLanguages.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageOption,
                      formData.languages.includes(lang.code) && styles.languageOptionSelected,
                    ]}
                    onPress={() => toggleLanguage(lang.code)}
                  >
                    <Text
                      style={[
                        styles.languageOptionText,
                        formData.languages.includes(lang.code) && styles.languageOptionTextSelected,
                      ]}
                    >
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.createActionsRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => goTab('list')}>
                <Text style={styles.cancelButtonText}>{t('login.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                onPress={handleCreateAccount}
                disabled={isCreating}
              >
                <Text style={styles.createButtonText}>
                  {isCreating ? t('adminUsers.creatingAccount') : t('adminUsers.createAccount')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={showRoleModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowRoleModal(false);
                setRoleModalUser(null);
              }}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t('adminUsers.changeRoleTitle')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{roleModalUser?.email}</Text>
              <Text style={styles.metaHint}>
                {(roleModalUser?.username || '—') +
                  ' · ' +
                  (roleModalUser ? formatRoleLabel(roleModalUser) : '—')}
              </Text>
            </View>
            {(['admin', 'reviewer', 'annotator'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.roleOption,
                  roleModalUser &&
                    canonicalAccountRole(roleModalUser.role, roleModalUser.is_admin) === r &&
                    styles.roleOptionSelected,
                ]}
                onPress={() => handleApplyRole(r)}
              >
                <Ionicons
                  name={r === 'admin' ? 'shield' : r === 'reviewer' ? 'eye' : 'person'}
                  size={20}
                  color={r === 'admin' ? '#ef4444' : r === 'reviewer' ? '#a855f7' : '#3b82f6'}
                />
                <Text style={styles.roleOptionText}>
                  {r === 'admin'
                    ? t('adminUsers.roleAdmin')
                    : r === 'reviewer'
                      ? t('adminUsers.roleReviewer')
                      : t('adminUsers.roleAnnotator')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        visible={showResetPasswordModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowResetPasswordModal(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('adminUsers.emailLabel')}</Text>
              <TextInput
                style={styles.input}
                value={selectedUser?.email || ''}
                editable={false}
                placeholderTextColor="#64748b"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowResetPasswordModal(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createButton} onPress={handleConfirmResetPassword}>
              <Text style={styles.createButtonText}>Reset Password</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  pageHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 17,
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
  actionsContainer: {
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    gap: 16,
  },
  userCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  email: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  userMeta: {
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  languageText: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '600',
  },
  moreLanguagesText: {
    color: '#64748b',
    fontSize: 10,
  },
  resetPasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f59e0b',
  },
  resetPasswordButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  blockButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748b',
    fontSize: 16,
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f8fafc',
  },
  passwordToggle: {
    marginLeft: 8,
    padding: 8,
  },
  languagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  languageOptionSelected: {
    backgroundColor: '#3b82f6',
  },
  languageOptionText: {
    color: '#64748b',
    fontSize: 14,
  },
  languageOptionTextSelected: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  cancelButton: {
    backgroundColor: '#64748b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Table Styles
  tableContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userRowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tableHeaderCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tableCell: {
    flex: 1,
    alignItems: 'flex-start',
  },
  tableText: {
    fontSize: 14,
    color: '#f8fafc',
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  noLanguagesText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  addUserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  addUserButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  createButtonDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  metaHint: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 10,
  },
  roleOptionSelected: {
    borderColor: 'rgba(168, 85, 247, 0.6)',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  accountRoleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accountRoleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
  },
  accountRoleChipSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  accountRoleChipSelectedReviewer: {
    borderColor: '#a855f7',
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
  },
  accountRoleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  accountRoleChipTextSelected: {
    color: '#f8fafc',
  },
  actionToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 0,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e9d5ff',
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tabPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.35)',
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
  tabPillAnnotator: {
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  tabPillAnnotatorActive: {
    backgroundColor: '#2563eb',
    borderColor: '#3b82f6',
  },
  tabPillReviewer: {
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  tabPillReviewerActive: {
    backgroundColor: '#a855f7',
    borderColor: '#c084fc',
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabPillTextActive: {
    color: '#e0f2fe',
  },
  tabPillTextOnAccent: {
    color: '#ffffff',
  },
  createScroll: {
    flex: 1,
    minHeight: 200,
  },
  createScrollContent: {
    paddingBottom: 32,
  },
  createRoleBannerAnnotator: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  createRoleBannerReviewer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(168, 85, 247, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.5)',
  },
  createScreenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 8,
  },
  createScreenSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  backToListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backToListText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  createActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
  },
});
