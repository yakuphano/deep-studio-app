import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import { supabase } from '@/lib/supabase';
import { canAccessReviewQueue, postLoginPathForRole } from '@/lib/userRoles';
import type { AppColors } from '@/theme/palettes';
import { useAppTheme } from '@/contexts/ThemeContext';

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav.dashboard' },
  { href: '/earnings/daily', labelKey: 'nav.earnings' },
  { href: '/messages', labelKey: 'nav.messages' },
  { href: '/faq', labelKey: 'nav.faq' },
  { href: '/profile', labelKey: 'nav.profile' },
];

export default function TopNavbar() {
  const { theme, colors: themeColors, setTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user, session, signOut, isAdmin, appRole } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const isMobile = width < 768;
  const currentLang = (i18n.language || 'tr').split('-')[0];
  const unreadCount = useUnreadMessagesCount(user?.id);

  // Fallback admin check - force show Management button for specific email
  const isFallbackAdmin = user?.email === 'yakup.hano@deepannotation.ai';
  // While isAdmin is still null, do not show admin link yet (avoids flash + keeps hooks stable)
  const showAdminLink = Boolean(isAdmin) || isFallbackAdmin;

  const navLinks = useMemo(() => {
    const [dash, ...rest] = NAV_ITEMS;
    const out: { href: string; labelKey: string; isAdminLink?: boolean }[] = [
      { ...dash },
      ...(canAccessReviewQueue(appRole)
        ? [{ href: '/review', labelKey: 'nav.qaReview' }]
        : []),
      { href: '/revisions', labelKey: 'nav.revisions' },
      ...rest.map((x) => ({ ...x })),
    ];
    if (showAdminLink) {
      out.push({ href: '/admin', labelKey: 'nav.management', isAdminLink: true });
    }
    return out;
  }, [showAdminLink, appRole]);

  const setLang = (lang: 'tr' | 'en') => {
    i18n.changeLanguage(lang);
    setLangDropdownOpen(false);
  };

  const navigate = (href: string) => {
    router.push(href as any);
    setMenuOpen(false);
    setLangDropdownOpen(false);
  };

  // Show loading state while admin status is being determined (must be after all hooks)
  if (isAdmin === null) {
    return (
      <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb, { paddingTop: insets.top + 8 }]}>
        <View style={styles.inner}>
          <View style={styles.brand}>
            <Text style={styles.brandText}>Deep Studio</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.accent} />
            <Text style={styles.loadingText}>Checking access...</Text>
          </View>
        </View>
      </View>
    );
  }

  const handleLogout = async () => {
    console.log('Emergency logout initiated');
    try {
      await supabase.auth.signOut();
      
      // Clear everything and hard redirect
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect anyway
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    }
  };

  const goHome = () => {
    if (session) {
      try {
        navigate(postLoginPathForRole(appRole));
      } catch (_) {}
    }
  };

  if (!user || !session) return null;

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb, { paddingTop: insets.top + 8 }]}>
      <View style={styles.inner}>
        <TouchableOpacity style={styles.brand} onPress={goHome} activeOpacity={0.8}>
          <Text style={styles.brandText}>Deep Studio</Text>
        </TouchableOpacity>

        {isMobile ? (
          <View style={styles.mobileRow}>
            <View style={styles.langDropdownWrap}>
              <TouchableOpacity style={styles.langBtn} onPress={() => setLangDropdownOpen(!langDropdownOpen)} activeOpacity={0.8}>
                <Text style={styles.langText}>{currentLang === 'tr' ? 'TR' : 'EN'}</Text>
                <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={styles.langChevron} />
              </TouchableOpacity>
              {langDropdownOpen && (
                <View style={styles.langDropdown}>
                  <TouchableOpacity style={[styles.langOption, currentLang === 'tr' && styles.langOptionActive]} onPress={() => setLang('tr')}>
                    <Text style={[styles.langOptionText, currentLang === 'tr' && styles.langOptionTextActive]}>TR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.langOption, currentLang === 'en' && styles.langOptionActive]} onPress={() => setLang('en')}>
                    <Text style={[styles.langOptionText, currentLang === 'en' && styles.langOptionTextActive]}>EN</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.mobileRowSpacer} />
            <TouchableOpacity style={styles.menuBtn} onPress={() => { setMenuOpen(!menuOpen); setLangDropdownOpen(false); }}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
            <View style={styles.themeToggleWrap}>
              <TouchableOpacity
                style={[styles.themeToggleBtn, theme === 'light' && styles.themeToggleBtnActive]}
                onPress={() => setTheme('light')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('profile.themeLight')}
                accessibilityState={{ selected: theme === 'light' }}
              >
                <Ionicons
                  name="sunny"
                  size={18}
                  color={theme === 'light' ? themeColors.onAccent : themeColors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeToggleBtn, theme === 'dark' && styles.themeToggleBtnActive]}
                onPress={() => setTheme('dark')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('profile.themeDark')}
                accessibilityState={{ selected: theme === 'dark' }}
              >
                <Ionicons
                  name="moon"
                  size={18}
                  color={theme === 'dark' ? themeColors.onAccent : themeColors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.navRow}>
            {navLinks.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname?.startsWith(item.href + '/') ||
                (item.href === '/earnings/total' && pathname?.includes('earnings/total')) ||
                (item.href === '/dashboard' && Boolean(pathname?.includes('video-tasks'))) ||
                (item.href === '/review' && pathname?.startsWith('/review')) ||
                (item.href === '/revisions' && pathname?.startsWith('/revisions'));
              const isAdminLink = (item as any).isAdminLink;
              return (
                <TouchableOpacity
                  key={item.href}
                  style={[
                    styles.navItem,
                    isActive && styles.navItemActive,
                    isAdminLink && styles.navItemAdmin,
                    isAdminLink && isActive && styles.navItemAdminActive,
                  ]}
                  onPress={() => navigate(item.href)}
                  activeOpacity={0.8}
                >
                  <View style={styles.navItemInner}>
                    <Text style={[styles.navText, isAdminLink && styles.navTextAdmin, isAdminLink && isActive && styles.navTextAdminActive]}>
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
            <View style={styles.rightGroup}>
              <View style={styles.langDropdownWrap}>
                <TouchableOpacity style={styles.langBtn} onPress={() => setLangDropdownOpen(!langDropdownOpen)} activeOpacity={0.8}>
                  <Text style={styles.langText}>{currentLang === 'tr' ? 'TR' : 'EN'}</Text>
                  <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={styles.langChevron} />
                </TouchableOpacity>
                {langDropdownOpen && (
                  <View style={styles.langDropdown}>
                    <TouchableOpacity style={[styles.langOption, currentLang === 'tr' && styles.langOptionActive]} onPress={() => setLang('tr')}>
                      <Text style={[styles.langOptionText, currentLang === 'tr' && styles.langOptionTextActive]}>TR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.langOption, currentLang === 'en' && styles.langOptionActive]} onPress={() => setLang('en')}>
                      <Text style={[styles.langOptionText, currentLang === 'en' && styles.langOptionTextActive]}>EN</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutText}>{t('nav.logout')}</Text>
              </TouchableOpacity>
              <View style={styles.themeToggleWrap}>
                <TouchableOpacity
                  style={[styles.themeToggleBtn, theme === 'light' && styles.themeToggleBtnActive]}
                  onPress={() => setTheme('light')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.themeLight')}
                  accessibilityState={{ selected: theme === 'light' }}
                >
                  <Ionicons
                    name="sunny"
                    size={18}
                    color={theme === 'light' ? themeColors.onAccent : themeColors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.themeToggleBtn, theme === 'dark' && styles.themeToggleBtnActive]}
                  onPress={() => setTheme('dark')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.themeDark')}
                  accessibilityState={{ selected: theme === 'dark' }}
                >
                  <Ionicons
                    name="moon"
                    size={18}
                    color={theme === 'dark' ? themeColors.onAccent : themeColors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>

      {isMobile && menuOpen && (
        <View style={styles.dropdown}>
          {navLinks.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname?.startsWith(item.href + '/') ||
              (item.href === '/earnings/daily' && pathname?.includes('earnings')) ||
              (item.href === '/dashboard' && Boolean(pathname?.includes('video-tasks'))) ||
              (item.href === '/review' && pathname?.startsWith('/review')) ||
              (item.href === '/revisions' && pathname?.startsWith('/revisions'));
            const isAdminLink = (item as any).isAdminLink;
            return (
              <TouchableOpacity
                key={item.href}
                style={[
                  styles.dropdownItem,
                  isActive && styles.dropdownItemActive,
                  isAdminLink && styles.dropdownItemAdmin,
                ]}
                onPress={() => navigate(item.href)}
              >
                <View style={styles.dropdownItemInner}>
                  <Text style={[styles.dropdownText, isActive && styles.dropdownTextActive, isAdminLink && styles.dropdownTextAdmin]}>{t(item.labelKey)}</Text>
                  {item.href === '/messages' && unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.dropdownItem} onPress={handleLogout}>
            <Text style={styles.logoutText}>{t('nav.logout')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: themeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    paddingBottom: 8,
    shadowColor: '#0f2744',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  containerWeb: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  themeToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
    overflow: 'hidden',
  },
  themeToggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    backgroundColor: themeColors.surfaceElevated,
  },
  themeToggleBtnActive: {
    backgroundColor: themeColors.accent,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingLeft: 20,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  brand: {
    paddingVertical: 6,
    paddingRight: 20,
    paddingLeft: 0,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '800',
    color: themeColors.text,
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: themeColors.textMuted,
    fontSize: 14,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    marginHorizontal: 24,
  },
  navItem: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: themeColors.accentMuted,
  },
  navItemAdmin: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  navItemAdminActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
  },
  navItemInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '500',
  },
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
  dropdownItemInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTextActive: {
    color: themeColors.accent,
    fontWeight: '600',
  },
  navTextAdmin: {
    color: '#ef4444',
    fontWeight: '600',
  },
  navTextAdminActive: {
    color: themeColors.onAccent,
    fontWeight: '700',
  },
  langDropdownWrap: {
    position: 'relative',
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  langText: {
    fontSize: 14,
    fontWeight: '500',
    color: themeColors.textSecondary,
  },
  langChevron: {
    marginLeft: 4,
  },
  langDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    minWidth: 72,
    backgroundColor: themeColors.surface,
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: themeColors.border,
    zIndex: 1001,
    shadowColor: '#0f2744',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  langOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  langOptionActive: {
    backgroundColor: themeColors.accentMuted,
  },
  langOptionText: {
    fontSize: 15,
    color: themeColors.textMuted,
    fontWeight: '500',
  },
  langOptionTextActive: {
    color: themeColors.accent,
    fontWeight: '600',
  },
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  logoutText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  mobileRowSpacer: {
    flex: 1,
    minWidth: 4,
  },
  menuBtn: {
    padding: 10,
  },
  menuIcon: {
    fontSize: 22,
    color: themeColors.text,
    fontWeight: '600',
  },
  dropdown: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dropdownItemActive: {
    backgroundColor: themeColors.accentMuted,
  },
  dropdownText: {
    fontSize: 16,
    color: themeColors.text,
  },
  dropdownTextActive: {
    color: themeColors.accent,
    fontWeight: '600',
  },
  dropdownItemAdmin: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  dropdownTextAdmin: {
    color: '#ef4444',
    fontWeight: '600',
  },
});
}
