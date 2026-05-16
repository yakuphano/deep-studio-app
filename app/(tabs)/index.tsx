import { Redirect } from 'expo-router';

/** Eski grid dashboard kaldırıldı — görev hub'ına yönlendir. */
export default function TabsIndex() {
  return <Redirect href="/dashboard" />;
}
