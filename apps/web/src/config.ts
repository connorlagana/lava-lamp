import { configure } from '@field/core';

/**
 * The browser's half of the core's configuration.
 *
 * These are publishable client credentials compiled into the bundle by design;
 * the row-level security policies on `maps` are what actually keep maps
 * private. Without them the core switches the account off by itself.
 */
configure({
  stackProjectId: import.meta.env.VITE_STACK_PROJECT_ID,
  stackPublishableKey: import.meta.env.VITE_STACK_PUBLISHABLE_KEY,
  dataApiUrl: import.meta.env.VITE_NEON_DATA_API_URL,
  verificationCallbackUrl: `${location.origin}/`,
  tokenStore: {
    read: () => localStorage.getItem('field:refresh'),
    write: (t) => localStorage.setItem('field:refresh', t),
    clear: () => localStorage.removeItem('field:refresh'),
  },
});
