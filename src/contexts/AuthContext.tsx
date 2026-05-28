import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { resetAdminUserIdCache } from '../lib/messages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeProfileRole, type AppRole, pickAuthUserEmail } from '../lib/userRoles';

type UserProfile = {
  id: string;
  username: string;
  role: string;
  is_admin?: boolean;
  is_blocked: boolean;
  languages: string[];
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean | null;
  /** Profil + admin bayraklarıyla hesaplanır; QA Review gibi ekranlar bunu kullanmalı (useProfile ile yarış yok). */
  appRole: AppRole;
  languages: string[];
  profile: UserProfile | null;
  isBlocked: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['tr', 'en']);
  const [appRole, setAppRole] = useState<AppRole>('annotator');

  // DÖNGÜ KİLİT MEKANİZMASI
  const isProcessingRef = useRef(false);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      return error ? null : (data as UserProfile);
    } catch {
      return null;
    }
  };

  const syncAuth = async (newSession: Session | null) => {
    isProcessingRef.current = true;

    try {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        resetAdminUserIdCache();
        const sessionEmail = pickAuthUserEmail(newSession.user);
        const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';

        // Profil gelene kadar e-posta yedeği (yakuphanno@gmail.com → kaliteci)
        setAppRole(normalizeProfileRole(null, isDevAdmin, sessionEmail));
        setIsAdmin(isDevAdmin);

        const userProfile = await fetchUserProfile(newSession.user.id);
        if (userProfile?.is_blocked) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsBlocked(true);
          setIsAdmin(false);
          setLanguages(['tr', 'en']);
          setAppRole('annotator');
          if (typeof window !== 'undefined') {
            window.alert('Hesabınız engellenmiş. Yönetici ile iletişime geçin.');
          }
          return;
        }

        if (userProfile) {
          setProfile(userProfile);
          setIsBlocked(false);
          setLanguages(userProfile.languages || ['tr', 'en']);
          const admin =
            userProfile.role === 'admin' || userProfile.is_admin === true || isDevAdmin;
          setIsAdmin(admin);
          setAppRole(
            normalizeProfileRole(userProfile.role, userProfile.is_admin ?? admin, sessionEmail)
          );
        } else {
          setProfile(null);
          setIsBlocked(false);
          setIsAdmin(isDevAdmin);
          setLanguages(['tr', 'en']);
          setAppRole(normalizeProfileRole(null, isDevAdmin, sessionEmail));
        }
      } else {
        setProfile(null);
        setIsBlocked(false);
        setIsAdmin(false);
        setLanguages(['tr', 'en']);
        setAppRole('annotator');
      }
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAuth(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAuth(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.clear();
    setSession(null);
    setUser(null);
    setProfile(null);
    setAppRole('annotator');
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, appRole, languages, profile, isBlocked, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}