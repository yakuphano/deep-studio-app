import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginRedirect() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Redirect href="/" />;
}
