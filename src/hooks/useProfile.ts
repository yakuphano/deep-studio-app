import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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
            
            // Admin kontrolü
            const isDevAdmin = user.email === 'yakup.hano@deepannotation.ai';
            setIsAdmin(data.role === 'admin' || isDevAdmin);
          } else {
            setProfile(null);
            setIsBlocked(false);
            setIsAdmin(false);
            setLanguages(['tr', 'en']);
          }
        } catch (error) {
          console.error('Profile fetch error:', error);
          setProfile(null);
          setIsBlocked(false);
          setIsAdmin(false);
          setLanguages(['tr', 'en']);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setIsBlocked(false);
        setIsAdmin(false);
        setLanguages(['tr', 'en']);
      }
    };

    fetchProfile();
  }, [user]);

  return {
    profile,
    isAdmin,
    isBlocked,
    languages,
    loading
  };
}
