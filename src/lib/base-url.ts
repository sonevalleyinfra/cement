/**
 * Works out the public URL of the app.
 *
 * 1. BETTER_AUTH_URL, if you set it.
 * 2. Otherwise COOLIFY_URL, which Coolify sets on every deployment
 *    (including preview deployments, where it is the preview URL).
 *
 * COOLIFY_URL can hold several comma-separated URLs when the app has more
 * than one domain, and older Coolify setups put a bare host name in it
 * (no "https://"), so both cases are handled here.
 */
export function parseUrlList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/^https?:\/\//i.test(part) ? part : `https://${part}`))
    .map((part) => new URL(part).origin);
}

export function resolveBaseUrl(
  betterAuthUrl: string | undefined,
  coolifyUrl: string | undefined,
): string | undefined {
  if (betterAuthUrl) return new URL(betterAuthUrl).origin;
  return parseUrlList(coolifyUrl)[0];
}

/** Every origin the app is reachable on (used as Better Auth trusted origins). */
export function resolveTrustedOrigins(
  betterAuthUrl: string | undefined,
  coolifyUrl: string | undefined,
): string[] {
  const origins = parseUrlList(coolifyUrl);
  if (betterAuthUrl) origins.unshift(new URL(betterAuthUrl).origin);
  return [...new Set(origins)];
}
