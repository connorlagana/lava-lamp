import { AccessibilityInfo, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { configure } from '@field/core';

/**
 * The phone's half of the core's configuration.
 *
 * Two things differ from the browser. The refresh token goes into the system
 * keychain rather than localStorage, because on a phone there is somewhere
 * better than "next to the data" to put it. And the keychain is asynchronous
 * while the core wants a synchronous read in the middle of a fetch, so it is
 * hydrated into memory once at startup — `hydrateSession` below — and answered
 * from there.
 */

const KEY = 'field.refresh';
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | null>;

let cached: string | null = null;

/** Pull the stored token out of the keychain. Must finish before the first render. */
export async function hydrateSession(): Promise<void> {
  try {
    cached = await SecureStore.getItemAsync(KEY);
  } catch {
    // A locked or unavailable keychain is a signed-out user, not a crash.
    cached = null;
  }
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => { reduceMotion = on; })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => { reduceMotion = on; });

configure({
  stackProjectId: extra.stackProjectId ?? undefined,
  stackPublishableKey: extra.stackPublishableKey ?? undefined,
  dataApiUrl: extra.dataApiUrl ?? undefined,
  // Sign-up verification has nowhere to land in an app the way it does on a
  // site, so it comes back through the app's own scheme.
  verificationCallbackUrl: Platform.select({ default: 'field://verify' }),
  reducedMotion: () => reduceMotion,
  tokenStore: {
    read: () => cached,
    write: (token) => {
      cached = token;
      SecureStore.setItemAsync(KEY, token).catch(() => undefined);
    },
    clear: () => {
      cached = null;
      SecureStore.deleteItemAsync(KEY).catch(() => undefined);
    },
  },
});
