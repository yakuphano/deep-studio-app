import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  lightPalette,
  darkPalette,
  type AppColors,
  type ThemePreference,
} from '@/theme/palettes';

const STORAGE_KEY = 'deep_studio_theme';

type ThemeContextValue = {
  theme: ThemePreference;
  colors: AppColors;
  setTheme: (t: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (raw === 'light' || raw === 'dark')) {
          setThemeState(raw);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    void AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemePreference = prev === 'light' ? 'dark' : 'light';
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const colors = useMemo(() => (theme === 'dark' ? darkPalette : lightPalette), [theme]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = colors.background;
    document.documentElement.style.backgroundColor = colors.background;
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }, [colors.background, theme]);

  const value = useMemo(
    () => ({
      theme,
      colors,
      setTheme,
      toggleTheme,
    }),
    [theme, colors, setTheme, toggleTheme]
  );

  // Avoid flash: optional — still render children with light until hydrated if desired
  void hydrated;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: 'light',
      colors: lightPalette,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

/** Sadece palet — stillerde kullanın. */
export function useThemeColors(): AppColors {
  return useAppTheme().colors;
}
