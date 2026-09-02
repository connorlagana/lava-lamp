import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  accountsConfigured,
  hasStoredSession,
  restore,
  signIn as apiSignIn,
  signOut as apiSignOut,
  signUp as apiSignUp,
  type Account,
} from '@field/core';

/**
 * Who is signed in, if anyone.
 *
 * Kept deliberately separate from the board: the map works exactly the same
 * whether or not there is an account behind it, and nothing in `store/app`
 * knows this file exists.
 */

export type SessionStatus = 'unknown' | 'anonymous' | 'signed-in';

export interface SessionApi {
  status: SessionStatus;
  account: Account | null;
  /** false when the build has no Neon keys — the save button stays hidden */
  enabled: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

export const useSession = () => {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside provider');
  return v;
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  // Skip straight to 'anonymous' when there is nothing to restore, so the
  // save button never flickers through a loading state on a first visit.
  const [status, setStatus] = useState<SessionStatus>(() =>
    accountsConfigured() && hasStoredSession() ? 'unknown' : 'anonymous',
  );

  useEffect(() => {
    if (status !== 'unknown') return;
    let cancelled = false;
    restore().then((a) => {
      if (cancelled) return;
      setAccount(a);
      setStatus(a ? 'signed-in' : 'anonymous');
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const signUp = useCallback(async (email: string, password: string) => {
    const a = await apiSignUp(email.trim(), password);
    setAccount(a);
    setStatus('signed-in');
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const a = await apiSignIn(email.trim(), password);
    setAccount(a);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setAccount(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<SessionApi>(
    () => ({ status, account, enabled: accountsConfigured(), signUp, signIn, signOut }),
    [status, account, signUp, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
