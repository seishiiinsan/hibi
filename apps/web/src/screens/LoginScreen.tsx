import { useState } from 'react';
import { login } from '../api';
import { useSyncInfo } from '../hooks';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending } = useSyncInfo();

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    const res = await login(username, password);
    setBusy(false);
    if (!res.ok) setError(res.message);
  };

  return (
    <div className="screen login">
      <h1>Hibi</h1>
      {pending > 0 && (
        <p className="muted">
          {pending} journée(s) en attente : elles seront envoyées après la connexion.
        </p>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Identifiant
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
