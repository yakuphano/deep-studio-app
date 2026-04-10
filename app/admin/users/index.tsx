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
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type User = {
  id: string;
  email: string;
  username?: string;
  role: string;
  is_blocked: boolean;
  languages?: string[];
  created_at: string;
};

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
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
  });

  const availableLanguages = [
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Turkish' },
    { code: 'ku', name: 'Kurdish' },
    { code: 'az', name: 'Azerbaijani' },
  ];

  const fetchUsers = useCallback(async () => {
    console.log('FETCH START: fetchUsers');
    let timeoutId: NodeJS.Timeout;
    
    try {
      setLoading(true);
      console.log('Fetching users from profiles table...');
      
      // Timeout safeguard
      timeoutId = setTimeout(() => {
        console.warn('FETCH TIMEOUT: fetchUsers took more than 5 seconds');
        setLoading(false);
      }, 5000);
      
      // Fix: Explicitly select languages column and languages_expertise for compatibility
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email, role, languages, languages_expertise, is_blocked');

      console.log('Fetched users:', data);
      console.log('Fetch error:', error);

      if (error) {
        console.error('Database error:', error);
        setUsers([]);
      } else {
        console.log('Users fetched successfully:', data?.length || 0);
        setUsers(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      // Clear timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // CRITICAL: Always set loading to false
      console.log('FETCH END: fetchUsers');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []); // Remove fetchUsers from dependencies to prevent infinite loop

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
        'Success',
        `User ${!isBlocked ? 'blocked' : 'unblocked'} successfully`
      );
    } catch (error) {
      console.error('Error blocking user:', error);
      Alert.alert('Error', 'Failed to update user status');
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

  const handleCreateAnnotator = async () => {
    setLoading(true);
    
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) {
        console.error(`ERROR: ${authError.message}`);
        return;
      }

      if (authData.user) {
        // GUARANTEED SUCCESS ALERT - Show immediately after auth success
        console.log('SUCCESS: User Created!');
        
        // CRITICAL: IMMEDIATELY insert into profiles table
        console.log('Inserting into profiles table...');
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            username: formData.username,
            email: formData.email,
            role: 'annotator',
            languages: formData.languages,
          });

        console.log('Profile insert result:', { profileError });

        if (profileError) {
          console.error('Profile insert failed:', profileError);
          if (typeof window !== 'undefined') {
            window.alert(`ERROR: Profile insert failed: ${profileError.message}`);
          } else {
            Alert.alert('Error', `Error: Profile insert failed: ${profileError.message}`);
          }
        } else {
          console.log('Profile inserted successfully!');
        }
        
        // Close modal immediately
        setShowModal(false);
        
        // Reset form
        setFormData({
          username: '',
          email: '',
          password: '',
          languages: [],
        });
        
        // Refresh list
        fetchUsers();
      }
    } catch (error: any) {
      console.error(`ERROR: ${error.message || error}`);
    } finally {
      setLoading(false);
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
      'Delete User',
      'Are you sure you want to delete this user? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId);

              if (error) {
                console.error('Delete error:', error);
                Alert.alert('Error', 'Failed to delete user');
              } else {
                Alert.alert('Success', 'User deleted successfully');
                fetchUsers();
              }
            } catch (error) {
              console.error('Delete user error:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.tableRow}>
      <View style={styles.tableCell}>
        <Text style={styles.tableText}>{item.username || 'N/A'}</Text>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableText}>{item.email}</Text>
      </View>
      <View style={styles.tableCell}>
        <View style={[
          styles.roleBadge,
          { backgroundColor: item.role === 'admin' ? '#ef4444' : '#3b82f6' }
        ]}>
          <Text style={styles.roleText}>{item.role || 'N/A'}</Text>
        </View>
      </View>
      <View style={styles.tableCell}>
        <Text style={styles.tableText}>
          {(() => {
            // Check languages column first, then languages_expertise
            const languagesData = item.languages || item.languages_expertise;
            console.log('Language data for user', item.username, ':', languagesData);
            
            if (languagesData && Array.isArray(languagesData) && languagesData.length > 0) {
              // Convert language codes to full names
              const languageNames = languagesData.map(code => {
                const lang = availableLanguages.find(l => l.code === code);
                return lang ? lang.name : code;
              });
              const display = languageNames.join(', ');
              console.log('Full languages for user', item.username, ':', display);
              return display;
            } else if (typeof languagesData === 'string' && languagesData.trim()) {
              // Handle case where languages are stored as JSON string
              try {
                const parsed = JSON.parse(languagesData);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const languageNames = parsed.map(code => {
                    const lang = availableLanguages.find(l => l.code === code);
                    return lang ? lang.name : code;
                  });
                  const display = languageNames.join(', ');
                  console.log('Parsed full languages for user', item.username, ':', display);
                  return display;
                }
              } catch (e) {
                console.log('Failed to parse languages for user', item.username, ':', languagesData);
                return languagesData;
              }
            }
            console.log('No languages found for user', item.username);
            return <Text style={styles.noLanguagesText}>Not Selected</Text>;
          })()}
        </Text>
      </View>
      <View style={styles.tableCell}>
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.is_blocked ? '#ef4444' : '#10b981' }
        ]}>
          <Text style={styles.statusText}>
            {item.is_blocked ? 'Blocked' : 'Active'}
          </Text>
        </View>
      </View>
      <View style={styles.tableCell}>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleResetPassword(item)}
          >
            <Ionicons name="key" size={16} color="#f59e0b" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleBlockUser(item.id, item.is_blocked)}
          >
            <Ionicons 
              name={item.is_blocked ? 'checkmark-circle' : 'close-circle'} 
              size={16} 
              color={item.is_blocked ? '#10b981' : '#ef4444'}
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleDeleteUser(item.id)}
          >
            <Ionicons name="trash" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
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
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="person-add" size={16} color="#ffffff" />
            <Text style={styles.addUserButtonText}>+ Add New Annotator</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading users...</Text>
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
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="person-add" size={16} color="#ffffff" />
          <Text style={styles.addUserButtonText}>+ Add New Annotator</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Manage Users</Text>
          <TouchableOpacity 
            style={styles.refreshButton} 
            onPress={() => {
              console.log('Manual refresh triggered for users');
              fetchUsers();
            }}
          >
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        
        {/* Table Header */}
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
          <View style={styles.tableHeaderCell}>
            <Text style={styles.tableHeaderText}>Actions</Text>
          </View>
        </View>

        {/* User List */}
        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          style={styles.tableContainer}
          refreshing={refreshing}
          onRefresh={fetchUsers}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Add User Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add New Annotator</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={formData.username}
                onChangeText={(text) => setFormData(prev => ({ ...prev, username: text }))}
                placeholder="Enter username"
                placeholderTextColor="#64748b"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
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
                  onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                  placeholder="Enter password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Languages</Text>
              <View style={styles.languagesContainer}>
                {availableLanguages.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageOption,
                      formData.languages.includes(lang.code) && styles.languageOptionSelected,
                    ]}
                    onPress={() => toggleLanguage(lang.code)}
                  >
                    <Text style={[
                      styles.languageOptionText,
                      formData.languages.includes(lang.code) && styles.languageOptionTextSelected,
                    ]}>
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowModal(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.createButton, isCreating && styles.createButtonDisabled]} 
              onPress={handleCreateAnnotator}
              disabled={isCreating}
            >
              <Text style={styles.createButtonText}>
                {isCreating ? 'Creating...' : 'Create Annotator'}
              </Text>
            </TouchableOpacity>
          </View>
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
              <Text style={styles.label}>User Email</Text>
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
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
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
  actionButtons: {
    flexDirection: 'column',
    gap: 8,
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
});
