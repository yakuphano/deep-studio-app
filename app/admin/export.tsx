import React, { useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import AdminExportPanel from '@/components/admin/AdminExportPanel';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

export default function AdminExportScreen() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useProfile();

  const isDevAdmin = user?.email === 'yakup.hano@deepannotation.ai';
  const hasAdminAccess = isAdmin === true || isDevAdmin;
  const adminStatusLoading = isAdmin === null && !isDevAdmin;

  if (adminStatusLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={styles.loadingText}>Checking admin access...</Text>
      </View>
    );
  }

  if (!hasAdminAccess) {
    return (
      <View style={styles.centered}>
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.deniedSub}>You don't have admin privileges</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Export Data</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AdminExportPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background },
    loadingText: { color: themeColors.text, fontSize: 14, marginTop: 10 },
    deniedTitle: { color: '#ef4444', fontSize: 16 },
    deniedSub: { color: themeColors.textMuted, fontSize: 13, marginTop: 6 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: themeColors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    backButtonText: { color: themeColors.text, fontSize: 14, fontWeight: '600' },
    pageTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: themeColors.text },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      flexGrow: 1,
      maxWidth: 720,
      width: '100%',
      alignSelf: 'center',
    },
  });
}
