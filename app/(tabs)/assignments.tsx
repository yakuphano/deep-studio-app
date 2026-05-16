import { Redirect } from 'expo-router';

/** Eski assignments panosu kaldırıldı — görev dashboard'una yönlendir. */
export default function AssignmentsRedirect() {
  return <Redirect href="/dashboard" />;
}
