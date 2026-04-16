import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // Start as null, not false
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['tr', 'en']); // Test için varsayılan diller

  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching user profile for admin check:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Profile fetch error:', error.message);
        // 500 hatas\u0131 veya infinite recursion durumunda null d\u00f6nd\u00fcr
        if (error.code === 'PGRST116' || error.message?.includes('infinite recursion')) {
          console.log('Profile fetch failed due to RLS issues, proceeding with limited permissions');
          return null;
        }
        return null;
      }
      
      console.log('Profile data received:', data);
      return data as UserProfile;
    } catch (error) {
      console.error('Profile fetch error:', (error as Error).message);
      return null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('AuthContext - Auth state changed:', _event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false); // Ensure loading is set to false
      
      if (session?.user) {
        console.log('AuthContext - Fetching profile for user:', session.user.id);
        const userProfile = await fetchUserProfile(session.user.id);
        console.log('AuthContext - Fetched profile:', userProfile);
        
        if (userProfile) {
          console.log('Setting profile data:', userProfile);
          setProfile(userProfile);
          setIsBlocked(userProfile.is_blocked);
          
          // Bypass for dev - always set admin for specific email
          const isDevAdmin = session.user.email === 'yakup.hano@deepannotation.ai';
          const shouldBeAdmin = userProfile.role === 'admin' || isDevAdmin;
          
          console.log('Admin check:', {
            email: session.user.email,
            profileRole: userProfile.role,
            isDevAdmin,
            shouldBeAdmin
          });
          
          setIsAdmin(shouldBeAdmin);
          setLanguages(userProfile.languages || []);
        } else {
          console.log('No profile data found, setting isAdmin to false');
          setIsAdmin(false);
        }
      } else {
        console.log('AuthContext - No session, clearing profile');
        setProfile(null);
        setIsBlocked(false);
        setLanguages(['tr', 'en']);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const ADMIN_EMAIL = 'yakup.hano@deepannotation.ai';
  const EMPLOYEE_EMAIL = 'yakup2122@gmail.com';

  useEffect(() => {
    console.log('AuthContext - Profile:', profile);
    console.log('AuthContext - Profile role:', profile?.role);
    
    if (!profile) {
      console.log('AuthContext - No profile found, setting isAdmin to false');
      setIsAdmin(false);
      return;
    }
    
    const isAdminRole = profile.role === 'admin';
    console.log('AuthContext - Setting isAdmin to:', isAdminRole);
    setIsAdmin(isAdminRole);
  }, [profile]);

  const signOut = async () => {
    console.log('Emergency logout initiated');
    try {
      await supabase.auth.signOut();
      await AsyncStorage.clear();
      
      // Clear everything and hard redirect
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Force redirect anyway
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, languages, profile, isBlocked, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

