import { useEffect, useRef, useState } from 'react';
import { useSession } from '../account/session';
import { AuthError } from '@field/core';
import { useLibrary } from '../library/library';

/**
 * The only screen in the app that asks for anything.
 *
 * It appears when someone reaches for the save button without an account, so
 * it opens on "create an account" and treats signing in as the other case,
 * rather than the other way around. It never blocks the map: the sheet closes
 * on Escape and the board is exactly where it was.
 */

export function AccountSheet() {
  const session = useSession();
  const lib = useLibrary();
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const open = lib.sheet === 'account';

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = window.setTimeout(() => emailRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        lib.openSheet('none');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, lib]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') await session.signUp(email, password);
      else await session.signIn(email, password);
      // Straight on to what they were trying to do in the first place.
      lib.openSheet('name');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const creating = mode === 'create';

  return (
    <div className="gate-scrim" onPointerDown={() => lib.openSheet('none')}>
      <form className="gate" onSubmit={submit} onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="gate-title">{creating ? 'Keep this map' : 'Welcome back'}</h2>
        <p className="gate-sub">
          {creating
            ? 'An account gives your maps somewhere to live besides this browser.'
            : 'Sign in and your maps come back with you.'}
        </p>

        <label className="gate-field">
          <span>Email</span>
          <input
            ref={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="gate-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={creating ? 'at least eight characters' : ''}
          />
        </label>

        {error && <p className="gate-error">{error}</p>}

        <button className="gate-go" type="submit" disabled={busy}>
          {busy ? 'One moment…' : creating ? 'Create account and save' : 'Sign in'}
        </button>

        <p className="gate-alt">
          {creating ? 'Already have one?' : 'New here?'}{' '}
          <button type="button" onClick={() => { setMode(creating ? 'signin' : 'create'); setError(null); }}>
            {creating ? 'Sign in instead' : 'Create an account'}
          </button>
        </p>
        <p className="gate-foot">
          Your map is already saved in this browser. An account is only so it
          follows you to the next one.
        </p>
      </form>
    </div>
  );
}
