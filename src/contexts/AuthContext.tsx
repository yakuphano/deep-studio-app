import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  languages: string[];
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['tr', 'en']); // Test için varsayılan diller

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';
  const EMPLOYEE_EMAIL = 'yakup2122@gmail.com';

  useEffect(() => {
    if (!user?.email) {
      setIsAdmin(false);
      return;
    }
    const email = user.email.toLowerCase().trim();
    if (email === ADMIN_EMAIL.toLowerCase()) {
      setIsAdmin(true);
    } else if (email === EMPLOYEE_EMAIL.toLowerCase()) {
      setIsAdmin(false);
    } else {
      setIsAdmin(false);
    }
  }, [user?.email]);

  const signOut = async () => {
    await supabase.auth.signOut();
    await AsyncStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, languages, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
