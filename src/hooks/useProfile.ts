import { useState, useEffect, useLayoutEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { normalizeProfileRole, type AppRole, pickAuthUserEmail } from '../lib/userRoles';

type UserProfile = {
  id: string;
  username: string;
  role: string;
  is_blocked: boolean;
  languages: string[];
};

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [languages, setLanguages] = useState<string[]>(['tr', 'en']);
  const [loading, setLoading] = useState(false);
  const [appRole, setAppRole] = useState<AppRole>('annotator');

  /**
   * Yeni mount veya user değişiminde, async fetch başlamadan önce loading=true olsun.
   * Aksi halde (ör. /review) ilk frame'de appRole hâlâ annotator iken useEffect yanlış redirect tetikler.
   */
  useLayoutEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [user?.id]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (data && !error) {
            setProfile(data);
            setIsBlocked(data.is_blocked);
            setLanguages(data.languages || ['tr', 'en']);
            
            const sessionEmail = pickAuthUserEmail(user);
            const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';
            const admin = data.role === 'admin' || isDevAdmin;
            setIsAdmin(admin);
            setAppRole(normalizeProfileRole(data.role, admin, sessionEmail));
          } else {
            setProfile(null);
            setIsBlocked(false);
            const sessionEmail = pickAuthUserEmail(user);
            const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';
            setIsAdmin(isDevAdmin);
            setAppRole(normalizeProfileRole(null, isDevAdmin, sessionEmail));
            setLanguages(['tr', 'en']);
          }
        } catch (error) {
          console.error('Profile fetch error:', error);
          setProfile(null);
          setIsBlocked(false);
          const sessionEmail = pickAuthUserEmail(user);
          const isDevAdmin = sessionEmail === 'yakup.hano@deepannotation.ai';
          setIsAdmin(isDevAdmin);
          setAppRole(normalizeProfileRole(null, isDevAdmin, sessionEmail));
          setLanguages(['tr', 'en']);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setIsBlocked(false);
        setIsAdmin(false);
        setAppRole('annotator');
        setLanguages(['tr', 'en']);
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const isReviewer = appRole === 'reviewer';

  return {
    profile,
    isAdmin,
    isReviewer,
    appRole,
    isBlocked,
    languages,
    loading,
  };
}
