import { z } from "zod";
import { resolveBaseUrl, resolveTrustedOrigins } from "@/lib/base-url";

// The rules for every environment variable. Used by src/env.ts.
// Kept separate so tests can check the rules without a real environment.

const emailList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.email("EMAIL_ALLOWLIST must be comma-separated email addresses")));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: "DATABASE_URL must look like postgres://user:password@host:5432/dbname",
    }),

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (run: openssl rand -base64 32)"),
    BETTER_AUTH_URL: z.url().optional(),
    // Set automatically by Coolify. Only used when BETTER_AUTH_URL is not set.
    COOLIFY_URL: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().min(3, "EMAIL_FROM is required, e.g. My App <noreply@example.com>"),
    EMAIL_MODE: z.enum(["log", "allowlist", "live"]),
    EMAIL_ALLOWLIST: emailList.default([]),

    SEED_ADMIN_EMAIL: z.email(),
    // Short passwords such as 123456 are fine locally; production needs 12+ (checked below).
    SEED_ADMIN_PASSWORD: z.string().min(6, "SEED_ADMIN_PASSWORD must be at least 6 characters"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.SEED_ADMIN_PASSWORD.length < 12) {
      ctx.addIssue({
        code: "custom",
        path: ["SEED_ADMIN_PASSWORD"],
        message: "SEED_ADMIN_PASSWORD must be at least 12 characters in production",
      });
    }
    if (!resolveBaseUrl(value.BETTER_AUTH_URL, value.COOLIFY_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "Set BETTER_AUTH_URL (e.g. http://localhost:3000). On Coolify, COOLIFY_URL is used if this is empty.",
      });
    }
    if (value.EMAIL_MODE !== "log" && !value.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: `RESEND_API_KEY is required when EMAIL_MODE is "${value.EMAIL_MODE}"`,
      });
    }
    if (value.EMAIL_MODE === "allowlist" && value.EMAIL_ALLOWLIST.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_ALLOWLIST"],
        message: 'EMAIL_ALLOWLIST must list at least one address when EMAIL_MODE is "allowlist"',
      });
    }
  })
  .transform((value) => ({
    ...value,
    /** The public URL of the app, e.g. https://myapp.example.com */
    APP_URL: resolveBaseUrl(value.BETTER_AUTH_URL, value.COOLIFY_URL)!,
    TRUSTED_ORIGINS: resolveTrustedOrigins(value.BETTER_AUTH_URL, value.COOLIFY_URL),
  }));

export type Env = z.output<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat `FOO=` (empty) the same as not set.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const name = String(issue.path[0] ?? "(env)");
      const message = cleaned[name] === undefined && issue.code === "invalid_type" ? "is not set" : issue.message;
      return `  - ${name}: ${message}`;
    });
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  return result.data;
}
