import { isValidDay } from '@hibi/domain';
import { useHashRoute, useKV } from './hooks';
import { EntryScreen } from './screens/EntryScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const authed = useKV<boolean>('authed', false);
  const route = useHashRoute();

  if (authed === undefined) return null;
  if (!authed) return <LoginScreen />;

  if (route === '/historique') return <HistoryScreen />;
  if (route === '/reglages') return <SettingsScreen />;
  const m = /^\/jour\/(\d{4}-\d{2}-\d{2})$/.exec(route);
  if (m && isValidDay(m[1])) return <EntryScreen key={m[1]} day={m[1]} />;
  return <EntryScreen />;
}
