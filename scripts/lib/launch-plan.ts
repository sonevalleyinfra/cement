/**
 * Plain rules used by `pnpm new-app` and `pnpm launch`.
 * No network, no files: everything here is easy to test.
 */
import { randomInt } from "node:crypto";

/** Returns an error message, or null when the name is fine. */
export function validateAppName(name: string | undefined): string | null {
  if (!name) return "Give the app a name, e.g. pnpm new-app my-shop";
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(name) || name.includes("--")) {
    return (
      `"${name}" is not a valid app name. Use 3-40 lowercase letters, digits and single hyphens, ` +
      "starting with a letter (it becomes the GitHub repo name and the web address)."
    );
  }
  return null;
}

/**
 * The admin login for the launched app: --admin-email if given, otherwise your git email.
 * Returns an error message instead when the email cannot receive mail (e.g. GitHub's
 * "noreply" address), because password-reset emails would never arrive.
 */
export function pickAdminEmail(flag: string | undefined, gitEmail: string): { email: string } | { error: string } {
  const email = (flag ?? gitEmail).trim();
  const fix = "Run: pnpm launch --admin-email you@example.com";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: `No valid admin email found. ${fix}` };
  if (/noreply/i.test(email)) return { error: `${email} cannot receive email, so it cannot be the admin login. ${fix}` };
  return { email };
}

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Cryptographically random letters and digits. Safe inside URLs and .env files. */
export function randomSecret(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHANUMERIC[randomInt(ALPHANUMERIC.length)];
  return out;
}

export function postgresUrl(parts: {
  user: string;
  password: string;
  host: string;
  port?: number;
  database: string;
}): string {
  const user = encodeURIComponent(parts.user);
  const password = encodeURIComponent(parts.password);
  return `postgres://${user}:${password}@${parts.host}:${parts.port ?? 5432}/${parts.database}`;
}

/**
 * The production web address: <name>.<server wildcard domain>.
 * Returns undefined when the server has no wildcard domain (Coolify then makes one up).
 */
export function appDomain(name: string, wildcardDomain: string | null | undefined): string | undefined {
  if (!wildcardDomain) return undefined;
  const withScheme = /^https?:\/\//i.test(wildcardDomain) ? wildcardDomain : `https://${wildcardDomain}`;
  const url = new URL(withScheme);
  return `${url.protocol}//${name}.${url.host}`;
}

/**
 * The domain emails are sent from (noreply@<domain>). It must be the domain verified in Resend.
 * Uses ~/.config/coolify/email_domain.txt when set, otherwise the app's parent domain
 * (https://my-shop.buildcity.cloud → buildcity.cloud).
 */
export function pickEmailDomain(configured: string | undefined, appUrl: string | undefined, appName: string): string {
  const cleaned = configured?.trim().toLowerCase().replace(/^.*@/, "");
  if (cleaned) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned)) throw new Error(`"${configured}" in email_domain.txt is not a domain.`);
    return cleaned;
  }
  if (appUrl) return new URL(appUrl).host.slice(appName.length + 1);
  return "example.com";
}

/** A daily cron expression in UTC (the server's clock) for a time of day in India (IST, UTC+5:30). */
export function dailyCronAtIST(hour: number, minute: number): string {
  const utcMinutes = (((hour * 60 + minute - 330) % 1440) + 1440) % 1440;
  return `${utcMinutes % 60} ${Math.floor(utcMinutes / 60)} * * *`;
}

export type CoolifyEnvVar = {
  key: string;
  value: string;
  is_preview: boolean;
  /** Use the value exactly as written. */
  is_literal: true;
  /** Values with line breaks (e.g. a private key). */
  is_multiline: boolean;
  /** Only give it to the running container, never to `docker build` (keeps secrets out of the image). */
  is_buildtime: false;
  is_runtime: true;
};

/** Coolify variables for one set (production or previews), runtime only, used exactly as written. */
export function toCoolifyEnvVars(values: Record<string, string>, isPreview: boolean): CoolifyEnvVar[] {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value,
    is_preview: isPreview,
    is_literal: true,
    is_multiline: value.includes("\n"),
    is_buildtime: false,
    is_runtime: true,
  }));
}

/**
 * Environment variables for one Coolify app: one set for production and a separate set for
 * pull request previews. Previews get their own database and their own secrets, so a pull request
 * can never touch production data.
 * BETTER_AUTH_URL is left out on purpose: Coolify sets COOLIFY_URL on every deployment
 * (the preview URL for previews), and src/lib/base-url.ts uses that.
 */
export function buildAppEnvVars(input: {
  appName: string;
  emailDomain: string;
  adminEmail: string;
  productionDatabaseUrl: string;
  previewDatabaseUrl: string;
  /** With a Resend key, production sends real email and previews only email the admin. */
  resendApiKey?: string;
}): { production: CoolifyEnvVar[]; preview: CoolifyEnvVar[] } {
  const email = (isPreview: boolean): Record<string, string> => {
    // Without a key nothing is sent: emails are only printed in the app's logs.
    if (!input.resendApiKey) return { EMAIL_MODE: "log" };
    return isPreview
      ? { EMAIL_MODE: "allowlist", EMAIL_ALLOWLIST: input.adminEmail, RESEND_API_KEY: input.resendApiKey }
      : { EMAIL_MODE: "live", RESEND_API_KEY: input.resendApiKey };
  };

  const make = (isPreview: boolean, databaseUrl: string): CoolifyEnvVar[] =>
    toCoolifyEnvVars(
      {
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomSecret(48),
        ...email(isPreview),
        EMAIL_FROM: `${input.appName} <noreply@${input.emailDomain}>`,
        SEED_ADMIN_EMAIL: input.adminEmail,
        SEED_ADMIN_PASSWORD: randomSecret(24),
      },
      isPreview,
    );

  return {
    production: make(false, input.productionDatabaseUrl),
    preview: make(true, input.previewDatabaseUrl),
  };
}

/**
 * Was a database backup really saved? Coolify marks a backup "success" even when the copy to
 * S3/R2 failed (it only adds a warning to the message, and sends no failure alert), so check both.
 */
export function checkBackup(
  execution: { status?: string; message?: string | null } | undefined,
  savesToS3: boolean,
): { ok: true } | { ok: false; problem: string } {
  if (!execution) return { ok: false, problem: "no backup ran" };
  if (execution.status !== "success") {
    return { ok: false, problem: `backup ${execution.status ?? "unknown"}: ${execution.message ?? "no details"}` };
  }
  if (savesToS3 && /S3 upload failed/i.test(execution.message ?? "")) {
    return { ok: false, problem: `saved on the server, but the off-site copy failed: ${execution.message}` };
  }
  return { ok: true };
}

/** Sets KEY=value in the text of a .env file: replaces the existing line or adds one at the end. */
export function setEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, () => line);
  return `${content.replace(/\n*$/, "")}\n${line}\n`;
}
