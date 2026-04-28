import React, { useState } from 'react';
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

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav.dashboard' },
  { href: '/earnings/daily', labelKey: 'nav.earnings' },
  { href: '/messages', labelKey: 'nav.messages' },
  { href: '/faq', labelKey: 'nav.faq' },
  { href: '/profile', labelKey: 'nav.profile' },
];

export default function TopNavbar() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user, session, signOut, isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const isMobile = width < 768;
  const currentLang = (i18n.language || 'tr').split('-')[0];
  const unreadCount = useUnreadMessagesCount(user?.id);

  const setLang = (lang: 'tr' | 'en') => {
    i18n.changeLanguage(lang);
    setLangDropdownOpen(false);
  };

  const navigate = (href: string) => {
    router.push(href as any);
    setMenuOpen(false);
    setLangDropdownOpen(false);
  };

  // Fallback admin check - force show Management button for specific email
  const isFallbackAdmin = user?.email === 'yakup.hano@deepannotation.ai';

  // Show loading state while admin status is being determined
  if (isAdmin === null) {
    return (
      <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb, { paddingTop: insets.top + 8 }]}>
        <View style={styles.inner}>
          <View style={styles.brand}>
            <Text style={styles.brandText}>Deep Studio</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.loadingText}>Checking access...</Text>
          </View>
        </View>
      </View>
    );
  }
  
  const showAdminLink = isAdmin || isFallbackAdmin;

  const navLinks = [
    ...NAV_ITEMS,
    ...(showAdminLink ? [{ href: '/admin', labelKey: 'nav.management', isAdminLink: true }] : []),
  ].map((x) => ({ ...x, isAdminLink: (x as { isAdminLink?: boolean }).isAdminLink ?? false }));

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
        navigate(isAdmin ? '/admin' : '/dashboard');
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
            <TouchableOpacity style={styles.menuBtn} onPress={() => { setMenuOpen(!menuOpen); setLangDropdownOpen(false); }}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.navRow}>
            {navLinks.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname?.startsWith(item.href + '/') ||
                (item.href === '/earnings/total' && pathname?.includes('earnings/total')) ||
                (item.href === '/dashboard' && Boolean(pathname?.includes('video-tasks')));
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
              (item.href === '/dashboard' && Boolean(pathname?.includes('video-tasks')));
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 8,
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#94a3b8',
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
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
    fontWeight: '600',
  },
  navTextAdmin: {
    color: '#ef4444',
    fontWeight: '600',
  },
  navTextAdminActive: {
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(30, 41, 59, 0.98)',
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 1001,
  },
  langOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  langOptionActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  langOptionText: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
  langOptionTextActive: {
    color: '#f8fafc',
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
  },
  menuBtn: {
    padding: 10,
  },
  menuIcon: {
    fontSize: 22,
    color: '#f8fafc',
    fontWeight: '600',
  },
  dropdown: {
    marginTop: 12,
    marginHorizontal: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  dropdownText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  dropdownTextActive: {
    color: '#60a5fa',
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
