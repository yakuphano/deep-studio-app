import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import { fetchAdminAccountProfiles } from '@/lib/adminAccountList';
import { normalizeProfileRole, QA_REVIEWER_KNOWN_EMAILS, type AppRole } from '@/lib/userRoles';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type User = {
  id: string;
  email: string;
  username?: string;
  role: string;
  is_admin?: boolean;
  is_blocked: boolean;
  languages?: string[];
  languages_expertise?: string[] | string | null;
  created_at?: string;
};

function displayEmail(row: User): string {
  if (row.email.trim()) return row.email;
  if (row.username?.trim()) return row.username;
  return row.id.slice(0, 8);
}

function mapProfileRow(row: Record<string, unknown>): User {
  let email = String(row.email ?? row.user_email ?? '').trim().toLowerCase();
  const usernameRaw = row.username;
  const role = String(row.role ?? 'annotator');
  if (!email) {
    const local = usernameRaw != null ? String(usernameRaw).trim().toLowerCase() : '';
    const known = QA_REVIEWER_KNOWN_EMAILS.find((e) => e.split('@')[0]?.toLowerCase() === local);
    if (known) email = known;
  }
  return {
    id: String(row.id),
    email,
    username: usernameRaw != null && String(usernameRaw).trim() ? String(usernameRaw) : undefined,
    role,
    is_admin: row.is_admin === true,
    is_blocked: row.is_blocked === true,
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : undefined,
    languages_expertise: row.languages_expertise as User['languages_expertise'],
    created_at: row.created_at != null ? String(row.created_at) : undefined,
  };
}

function sortUsersForList(a: User, b: User): number {
  const keyA = (a.email || a.username || a.id).toLowerCase();
  const keyB = (b.email || b.username || b.id).toLowerCase();
  return keyA.localeCompare(keyB);
}

function roleBadgeBackground(role: string | undefined, isAdmin?: boolean, email?: string): string {
  const key = normalizeProfileRole(role, isAdmin, email);
  if (key === 'admin') return '#ef4444';
  if (key === 'reviewer') return '#a855f7';
  return '#3b82f6';
}

export default function AdminUsersPage() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

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

  const fetchUsers = useCallback(
    async (opts?: { isRefresh?: boolean }) => {
      try {
        if (opts?.isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const { rows: rawRows, syncError } = await fetchAdminAccountProfiles();

        const rows = rawRows.map((row) => mapProfileRow(row));
        rows.sort(sortUsersForList);
        setUsers(rows);

        const missingQa = QA_REVIEWER_KNOWN_EMAILS.filter(
          (e) => !rows.some((r) => r.email.toLowerCase() === e),
        );
        if (missingQa.length > 0) {
          const hint = syncError
            ? ` (${syncError})`
            : ' Auth kaydı var ama profiles satırı yok; Supabase’de admin_sync_missing_profiles çalıştırın.';
          console.warn('[AdminUsers] QA profil eksik:', missingQa.join(', '), hint);
        }
      } catch (error: unknown) {
        console.error('[AdminUsers] fetchUsers:', error);
        Alert.alert(
          t('login.errorTitle'),
          error instanceof Error ? error.message : String(error),
        );
        setUsers([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === 'create-reviewer') {
      setFormData((prev) => ({ ...prev, accountRole: 'reviewer' }));
    } else if (activeTab === 'create-annotator') {
      setFormData((prev) => ({ ...prev, accountRole: 'annotator' }));
    }
  }, [activeTab]);

  const formatRoleLabel = (row: User) => {
    const key = normalizeProfileRole(row.role, row.is_admin, row.email);
    if (key === 'admin') return t('adminUsers.roleAdmin');
    if (key === 'reviewer') return t('adminUsers.roleQuality');
    return t('adminUsers.roleAnnotator');
  };

  const roleLabelForAppRole = (key: AppRole) => {
    if (key === 'admin') return t('adminUsers.roleAdmin');
    if (key === 'reviewer') return t('adminUsers.roleQuality');
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
      const dbRole =
        newRole === 'admin' ? 'admin' : newRole === 'reviewer' ? 'quality_controller' : 'annotator';
      const { error } = await supabase
        .from('profiles')
        .update({ role: dbRole, is_admin: isAdmin })
        .eq('id', roleModalUser.id);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((row) =>
          row.id === roleModalUser.id ? { ...row, role: dbRole, is_admin: isAdmin } : row
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
        const role = formData.accountRole === 'reviewer' ? 'quality_controller' : 'annotator';
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
          <Text style={styles.tableText}>{displayEmail(item)}</Text>
        </View>
        <View style={styles.tableCell}>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: roleBadgeBackground(item.role, item.is_admin, item.email) },
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
            <Ionicons name="list" size={16} color={activeTab === 'list' ? themeColors.accent : themeColors.textMuted} />
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
              onRefresh={() => void fetchUsers({ isRefresh: true })}
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
              <Ionicons name="arrow-back" size={18} color={themeColors.textMuted} />
              <Text style={styles.backToListText}>{t('adminUsers.backToList')}</Text>
            </TouchableOpacity>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={formData.username}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, username: text }))}
                placeholder="Enter username"
                placeholderTextColor={themeColors.textMuted}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, email: text }))}
                placeholder="Enter email"
                placeholderTextColor={themeColors.textMuted}
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
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={themeColors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('adminUsers.accountRoleLabel')}</Text>
              <View style={styles.accountRoleRow}>
                <TouchableOpacity
                  style={[
                    styles.accountRoleChip,
                    formData.accountRole === 'annotator' && styles.accountRoleChipSelected,
                  ]}
                  onPress={() => setFormData((prev) => ({ ...prev, accountRole: 'annotator' }))}
                >
                  <Ionicons name="person" size={18} color={formData.accountRole === 'annotator' ? '#3b82f6' : themeColors.textMuted} />
                  <Text
                    style={[
                      styles.accountRoleChipText,
                      formData.accountRole === 'annotator' && styles.accountRoleChipTextSelected,
                    ]}
                  >
                    {t('adminUsers.roleAnnotator')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.accountRoleChip,
                    formData.accountRole === 'reviewer' && styles.accountRoleChipSelectedReviewer,
                  ]}
                  onPress={() => setFormData((prev) => ({ ...prev, accountRole: 'reviewer' }))}
                >
                  <Ionicons name="shield-checkmark" size={18} color={formData.accountRole === 'reviewer' ? '#a855f7' : themeColors.textMuted} />
                  <Text
                    style={[
                      styles.accountRoleChipText,
                      formData.accountRole === 'reviewer' && styles.accountRoleChipTextSelected,
                    ]}
                  >
                    {t('adminUsers.roleQuality')}
                  </Text>
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
              <Ionicons name="close" size={24} color={themeColors.textMuted} />
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
                    normalizeProfileRole(roleModalUser.role, roleModalUser.is_admin, roleModalUser.email) ===
                      r &&
                    styles.roleOptionSelected,
                ]}
                onPress={() => handleApplyRole(r)}
              >
                <Ionicons
                  name={r === 'admin' ? 'shield' : r === 'reviewer' ? 'eye' : 'person'}
                  size={20}
                  color={r === 'admin' ? '#ef4444' : r === 'reviewer' ? '#a855f7' : '#3b82f6'}
                />
                <Text style={styles.roleOptionText}>{roleLabelForAppRole(r)}</Text>
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
              <Ionicons name="close" size={24} color={themeColors.textMuted} />
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
                placeholderTextColor={themeColors.textMuted}
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
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={themeColors.textMuted}
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

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
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
    borderColor: themeColors.border,
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
    color: themeColors.textMuted,
    marginTop: 6,
    lineHeight: 17,
    backgroundColor: 'transparent',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
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
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: themeColors.accent,
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
    color: themeColors.text,
  },
  email: {
    fontSize: 14,
    color: themeColors.textMuted,
    marginBottom: 8,
  },
  userMeta: {
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: themeColors.textMuted,
    backgroundColor: 'transparent',
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
    color: themeColors.textMuted,
    fontSize: 10,
    backgroundColor: 'transparent',
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
    color: themeColors.textMuted,
    fontSize: 16,
    marginTop: 16,
    backgroundColor: 'transparent',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: themeColors.text,
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
    color: themeColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    color: themeColors.text,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    backgroundColor: themeColors.surface,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    color: themeColors.text,
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
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  languageOptionSelected: {
    backgroundColor: '#3b82f6',
  },
  languageOptionText: {
    color: themeColors.text,
    fontSize: 14,
    backgroundColor: 'transparent',
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
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: themeColors.text,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'transparent',
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
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: themeColors.accent,
  },
  userRowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: themeColors.borderLight,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: themeColors.surfaceElevated,
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
    color: themeColors.textMuted,
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
    color: themeColors.text,
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
    color: themeColors.textMuted,
    fontStyle: 'italic',
    backgroundColor: 'transparent',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: themeColors.border,
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
    backgroundColor: themeColors.border,
    opacity: 0.6,
  },
  metaHint: {
    fontSize: 13,
    color: themeColors.textMuted,
    marginTop: 4,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    marginBottom: 10,
  },
  roleOptionSelected: {
    borderColor: 'rgba(168, 85, 247, 0.6)',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
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
    borderWidth: 1.5,
    borderColor: themeColors.accent,
    backgroundColor: 'transparent',
  },
  accountRoleChipSelected: {
    borderWidth: 2,
    borderColor: themeColors.accent,
    backgroundColor: themeColors.accentMuted,
  },
  accountRoleChipSelectedReviewer: {
    borderColor: '#a855f7',
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
  },
  accountRoleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
    backgroundColor: 'transparent',
  },
  accountRoleChipTextSelected: {
    color: themeColors.accent,
    backgroundColor: 'transparent',
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
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: themeColors.accentPurple,
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: themeColors.accent,
  },
  tabPillActive: {
    backgroundColor: themeColors.accentMuted,
    borderWidth: 2,
    borderColor: themeColors.accent,
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
    color: themeColors.text,
    backgroundColor: 'transparent',
  },
  tabPillTextActive: {
    color: themeColors.accent,
    backgroundColor: 'transparent',
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
    color: themeColors.text,
    marginBottom: 8,
  },
  createScreenSubtitle: {
    fontSize: 14,
    color: themeColors.textMuted,
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
    color: themeColors.textMuted,
  },
  createActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
  },
});
}
