import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        const userProfile = await fetchUserProfile(newSession.user.id);
        if (userProfile) {
          setProfile(userProfile);
          setIsBlocked(userProfile.is_blocked);
          setLanguages(userProfile.languages || ['tr', 'en']);
          const isDevAdmin = newSession.user.email === 'yakup.hano@deepannotation.ai';
          setIsAdmin(userProfile.role === 'admin' || isDevAdmin);
        } else {
          setIsAdmin(false);
        }
      } else {
        setProfile(null);
        setIsBlocked(false);
        setIsAdmin(false);
        setLanguages(['tr', 'en']);
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
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, languages, profile, isBlocked, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}