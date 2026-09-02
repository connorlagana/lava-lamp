/**
 * The three publishable account values, kept out of the repository.
 *
 * `app.json` holds everything about this app that is worth reading in a diff.
 * These three are not: they are the same Neon credentials the web build takes
 * from its own `.env`, and while every one of them is publishable by design —
 * they are compiled into the browser bundle, and the row-level security on
 * `maps` is what actually keeps a map private — there is no reason for the two
 * halves of one app to keep the same secret in two different ways.
 *
 * So they come from `apps/mobile/.env`, which git ignores, and Expo folds them
 * into `extra` here. Left unset, `accountsConfigured()` in the core returns
 * false, the account row and the welcome screen both disappear, and the app is
 * a sheet of paper on one phone — which is the only thing it ever depends on
 * being. See `.env.example`.
 */

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    stackProjectId: process.env.FIELD_STACK_PROJECT_ID ?? null,
    stackPublishableKey: process.env.FIELD_STACK_PUBLISHABLE_KEY ?? null,
    dataApiUrl: process.env.FIELD_DATA_API_URL ?? null,
  },
});
