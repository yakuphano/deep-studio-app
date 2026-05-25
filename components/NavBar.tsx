import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
const navItems = [
  { href: '/dashboard', labelKey: 'nav.dashboard' },
  { href: '/earnings/daily', labelKey: 'nav.earnings' },
  { href: '/messages', labelKey: 'nav.messages' },
  { href: '/faq', labelKey: 'nav.faq' },
  { href: '/profile', labelKey: 'nav.profile' },
  { href: '/admin', labelKey: 'nav.management' },
];

export default function NavBar() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const unreadCount = useUnreadMessagesCount(user?.id);

  const navigate = (href: string) => {
    router.push(href as any);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deep Studio</Text>
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          pathname?.startsWith(item.href + '/') ||
          (item.href === '/earnings/daily' && pathname?.includes('earnings')) ||
          (item.href === '/dashboard' && Boolean(pathname?.includes('video-tasks')));
        return (
          <TouchableOpacity
            key={item.href}
            style={[styles.item, isActive && styles.itemActive]}
            onPress={() => navigate(item.href)}
          >
            <View style={styles.itemInner}>
              <Text style={[styles.itemText, isActive && styles.itemTextActive]}>
                {t(item.labelKey)}
              </Text>
              {item.href === '/messages' && unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => signOut().then(() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = '/';
        } else {
          router.replace('/');
        }
      })}
      >
        <Text style={styles.logoutText}>{t('nav.logout')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
    paddingTop: 48,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: themeColors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  itemInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  itemActive: {
    backgroundColor: themeColors.accentMuted,
    borderLeftWidth: 3,
    borderLeftColor: themeColors.accent,
  },
  itemText: {
    fontSize: 16,
    color: themeColors.textMuted,
  },
  itemTextActive: {
    color: themeColors.accent,
    fontWeight: '600',
  },
  logoutBtn: {
    marginTop: 'auto',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  logoutText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '600',
  },
});
}
