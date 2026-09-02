/**
 * The account, spoken to directly over HTTP.
 *
 * Neon Auth is Stack Auth, and Stack Auth ships a JavaScript SDK. We do not
 * use it: it pulls in a session recorder, a table library, a QR encoder and a
 * TypeScript runner in order to render an email field, which is a strange
 * thing to hand a user who came here to think. The five endpoints below are
 * the whole of what this app needs, and writing them out keeps the dependency
 * list at React and nothing else — and the sign-in sheet in the app's own
 * voice rather than someone else's component library.
 *
 * The refresh token is the credential worth protecting. It lives in
 * localStorage, which is the same place the map lives; anyone who can read one
 * can read the other, so there is no new exposure here. Access tokens are held
 * in memory only and re-minted on demand.
 */

import { accountsConfigured, config } from '../config';


const API = 'https://api.stack-auth.com/api/v1';

export interface Account {
  id: string;
  email: string | null;
}

/** Anything the user should be shown rather than a stack trace. */
export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  EMAIL_PASSWORD_MISMATCH: 'That email and password do not match.',
  USER_EMAIL_ALREADY_EXISTS: 'There is already an account with that email. Try signing in.',
  PASSWORD_TOO_SHORT: 'That password is too short — eight characters or more.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  PASSWORD_REQUIRES_SPECIAL_CHAR: 'That password needs a symbol in it.',
  PASSWORD_REQUIRES_NUMERIC_CHAR: 'That password needs a number in it.',
  PASSWORD_REQUIRES_LOWERCASE_CHAR: 'That password needs a lowercase letter in it.',
  PASSWORD_REQUIRES_UPPERCASE_CHAR: 'That password needs a capital letter in it.',
  SIGN_UP_NOT_ENABLED: 'New accounts are not being taken right now.',
  PASSWORD_AUTHENTICATION_NOT_ENABLED: 'Passwords are not enabled for this project.',
  VERIFICATION_CODE_NOT_FOUND: 'That link has already been used.',
  REFRESH_TOKEN_NOT_FOUND_OR_EXPIRED: 'That session has expired. Sign in again.',
};

const headers = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  'X-Stack-Access-Type': 'client',
  'X-Stack-Project-Id': config().stackProjectId ?? '',
  'X-Stack-Publishable-Client-Key': config().stackPublishableKey ?? '',
  ...extra,
});

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch {
    throw new AuthError('OFFLINE', 'Could not reach the account service. Check your connection.');
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = String(body.code ?? `HTTP_${res.status}`);
    throw new AuthError(code, MESSAGES[code] ?? 'Something went wrong signing you in.');
  }
  return body as T;
}

// ---- the session ----------------------------------------------------------

let refreshToken: string | null = null;
let accessToken: string | null = null;
/** epoch ms; access tokens last an hour, we re-mint a minute early */
let accessExpiry = 0;
let inflight: Promise<string> | null = null;

function readStoredRefresh(): string | null {
  if (refreshToken) return refreshToken;
  try {
    refreshToken = config().tokenStore.read();
  } catch {
    refreshToken = null;
  }
  return refreshToken;
}

function keep(tokens: { refresh_token?: string; access_token?: string }) {
  if (tokens.refresh_token) {
    refreshToken = tokens.refresh_token;
    try { config().tokenStore.write(tokens.refresh_token); } catch { /* private mode, locked keychain */ }
  }
  if (tokens.access_token) setAccess(tokens.access_token);
}

function setAccess(token: string) {
  accessToken = token;
  const claims = decode(token);
  accessExpiry = claims?.exp ? claims.exp * 1000 - 60_000 : Date.now() + 50 * 60_000;
}

function forget() {
  refreshToken = null;
  accessToken = null;
  accessExpiry = 0;
  try { config().tokenStore.clear(); } catch { /* private mode, locked keychain */ }
}

interface Claims { sub?: string; email?: string; exp?: number }

/**
 * Reads the payload of our own access token. This is not verification — the
 * Data API verifies the signature on every request, which is the only place it
 * matters. Here it only saves a round trip to find out whose name to show.
 */
function decode(token: string): Claims | null {
  try {
    return JSON.parse(utf8(base64url(token.split('.')[1]))) as Claims;
  } catch {
    return null;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * base64url -> bytes, written out rather than reached for.
 *
 * `atob` is a browser API that Hermes only grew recently, and `escape` — the
 * usual partner for getting UTF-8 back out of it — is deprecated everywhere
 * and absent on some engines. Twenty lines is cheaper than finding out which
 * of the two is missing on somebody's phone.
 */
function base64url(input: string): Uint8Array {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const out = new Uint8Array((padded.length / 4) * 3);
  let n = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const a = B64.indexOf(padded[i]);
    const b = B64.indexOf(padded[i + 1]);
    const c = B64.indexOf(padded[i + 2]);
    const d = B64.indexOf(padded[i + 3]);
    const chunk = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    out[n++] = (chunk >> 16) & 0xff;
    if (padded[i + 2] !== '=') out[n++] = (chunk >> 8) & 0xff;
    if (padded[i + 3] !== '=') out[n++] = chunk & 0xff;
  }
  return out.subarray(0, n);
}

/** Bytes -> string. An email with an accent in it is not a rare thing. */
function utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b < 0xf0)
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      const cp =
        ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

export const hasStoredSession = () => accountsConfigured() && !!readStoredRefresh();

/** A valid access token, minting a new one if the old one is spent. */
export async function getAccessToken(): Promise<string | null> {
  if (!accountsConfigured()) return null;
  if (accessToken && Date.now() < accessExpiry) return accessToken;
  const rt = readStoredRefresh();
  if (!rt) return null;
  // A burst of saves must not become a burst of refreshes.
  if (!inflight) {
    inflight = call<{ access_token: string }>('/auth/sessions/current/refresh', {
      method: 'POST',
      headers: headers({ 'X-Stack-Refresh-Token': rt }),
      body: '{}',
    })
      .then((r) => {
        setAccess(r.access_token);
        return r.access_token;
      })
      .catch((err) => {
        // An expired or revoked refresh token is a signed-out user, not a bug.
        forget();
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  try {
    return await inflight;
  } catch {
    return null;
  }
}

const accountFrom = (token: string, fallbackId?: string): Account => {
  const c = decode(token);
  return { id: c?.sub ?? fallbackId ?? '', email: c?.email ?? null };
};

export async function signUp(email: string, password: string): Promise<Account> {
  const r = await call<{ access_token: string; refresh_token: string; user_id: string }>(
    '/auth/password/sign-up',
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        email,
        password,
        verification_callback_url: config().verificationCallbackUrl ?? '',
      }),
    },
  );
  keep(r);
  return accountFrom(r.access_token, r.user_id);
}

export async function signIn(email: string, password: string): Promise<Account> {
  const r = await call<{ access_token: string; refresh_token: string; user_id: string }>(
    '/auth/password/sign-in',
    { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) },
  );
  keep(r);
  return accountFrom(r.access_token, r.user_id);
}

export async function signOut(): Promise<void> {
  const rt = readStoredRefresh();
  const at = accessToken;
  forget();
  if (!rt) return;
  // Best effort: the session is already gone as far as this browser cares.
  try {
    await fetch(`${API}/auth/sessions/current`, {
      method: 'DELETE',
      headers: headers({
        'X-Stack-Refresh-Token': rt,
        ...(at ? { 'X-Stack-Access-Token': at } : {}),
      }),
    });
  } catch { /* nothing left to clean up locally */ }
}

/** Who the stored session belongs to, or null if there isn't one. */
export async function restore(): Promise<Account | null> {
  const token = await getAccessToken();
  return token ? accountFrom(token) : null;
}
