/**
 * What the core needs from whichever app is hosting it.
 *
 * The browser reads these from `import.meta.env` at build time and keeps the
 * refresh token in localStorage; the phone reads them from Expo's config and
 * keeps the token in the system keychain. Neither of those exists in the
 * other's world, so the core asks to be told rather than reaching for a global.
 *
 * All of it is optional. With nothing configured the account and the library
 * simply switch off, and Field is what it has always been: a sheet of paper
 * in one place.
 */

/**
 * Where the refresh token lives.
 *
 * `read` is synchronous because the token is wanted in the middle of a fetch,
 * and a phone's keychain is not. Mobile hydrates the keychain into memory once
 * at startup and answers from there; the browser answers from localStorage,
 * which is synchronous already.
 */
export interface TokenStore {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

export interface FieldConfig {
  stackProjectId?: string;
  stackPublishableKey?: string;
  dataApiUrl?: string;
  /** Where a sign-up verification link should send someone back to. */
  verificationCallbackUrl?: string;
  tokenStore?: TokenStore;
  /**
   * Whether this device has asked for no motion. The browser knows from a
   * media query and the phone from an accessibility setting, and neither
   * question can be asked from here.
   */
  reducedMotion?: () => boolean;
}

/** A store that forgets on reload. The fallback when nobody supplies one. */
const memoryStore = (): TokenStore => {
  let held: string | null = null;
  return {
    read: () => held,
    write: (t) => { held = t; },
    clear: () => { held = null; },
  };
};

let current: Required<Pick<FieldConfig, 'tokenStore'>> & FieldConfig = {
  tokenStore: memoryStore(),
};

export function configure(next: FieldConfig): void {
  current = { ...current, ...next, tokenStore: next.tokenStore ?? current.tokenStore };
}

export const config = (): FieldConfig & { tokenStore: TokenStore } => current;

/** Accounts are optional. Without keys the app is exactly what it was before. */
export const accountsConfigured = (): boolean =>
  Boolean(current.stackProjectId && current.stackPublishableKey);

export const libraryConfigured = (): boolean => Boolean(current.dataApiUrl);

export const prefersReducedMotion = (): boolean => current.reducedMotion?.() ?? false;
