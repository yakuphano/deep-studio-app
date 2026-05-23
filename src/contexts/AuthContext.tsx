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
        .single();
      return error ? null : (data as UserProfile);
    } catch {
      return null;
    }
  };

  const syncAuth = async (newSession: Session | null) => {
    // İşlem zaten devam ediyorsa veya aynı session ise tetikleme
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        resetAdminUserIdCache();
        const userProfile = await fetchUserProfile(newSession.user.id);
        if (userProfile) {
          setProfile(userProfile);
          setIsBlocked(userProfile.is_blocked);
          setLanguages(userProfile.languages || ['tr', 'en']);
          const sessionEmail = pickAuthUserEmail(newSession.user);
          const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';
          const admin = userProfile.role === 'admin' || isDevAdmin;
          setIsAdmin(admin);
          setAppRole(normalizeProfileRole(userProfile.role, admin, sessionEmail));
        } else {
          setProfile(null);
          setIsBlocked(false);
          const sessionEmail = pickAuthUserEmail(newSession.user);
          const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';
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