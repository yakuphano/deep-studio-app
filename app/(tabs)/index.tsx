import { Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function TabsIndex() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Redirect href="/tasks" />;
}
