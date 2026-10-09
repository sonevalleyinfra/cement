import { describe, expect, it } from "vitest";
import {
  appDomain,
  buildAppEnvVars,
  checkBackup,
  dailyCronAtIST,
  pickAdminEmail,
  pickEmailDomain,
  postgresUrl,
  randomSecret,
  setEnvValue,
  validateAppName,
} from "./launch-plan";

describe("validateAppName", () => {
  it("accepts lowercase names with digits and hyphens", () => {
    expect(validateAppName("my-shop")).toBeNull();
    expect(validateAppName("shop2")).toBeNull();
  });

  it("rejects missing, short, uppercase, odd characters and bad hyphens", () => {
    expect(validateAppName(undefined)).toMatch(/Give the app a name/);
    expect(validateAppName("ab")).not.toBeNull();
    expect(validateAppName("MyShop")).not.toBeNull();
    expect(validateAppName("my_shop")).not.toBeNull();
    expect(validateAppName("2shop")).not.toBeNull();
    expect(validateAppName("shop-")).not.toBeNull();
    expect(validateAppName("my--shop")).not.toBeNull();
    expect(validateAppName("a".repeat(41))).not.toBeNull();
  });
});

describe("randomSecret", () => {
  it("has the requested length and only letters and digits", () => {
    const secret = randomSecret(48);
    expect(secret).toHaveLength(48);
    expect(secret).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("is different every time", () => {
    expect(randomSecret(32)).not.toBe(randomSecret(32));
  });
});

describe("postgresUrl", () => {
  it("builds a connection string with the default port", () => {
    expect(postgresUrl({ user: "app", password: "pw", host: "abc123", database: "app" })).toBe(
      "postgres://app:pw@abc123:5432/app",
    );
  });

  it("escapes special characters in the password", () => {
    expect(postgresUrl({ user: "app", password: "p@ss/word", host: "h", port: 5433, database: "d" })).toBe(
      "postgres://app:p%40ss%2Fword@h:5433/d",
    );
  });
});

describe("appDomain", () => {
  it("puts the app name in front of the wildcard domain", () => {
    expect(appDomain("my-shop", "https://buildcity.cloud")).toBe("https://my-shop.buildcity.cloud");
    expect(appDomain("my-shop", "buildcity.cloud")).toBe("https://my-shop.buildcity.cloud");
    expect(appDomain("my-shop", "http://example.com")).toBe("http://my-shop.example.com");
  });

  it("returns undefined when the server has no wildcard domain", () => {
    expect(appDomain("my-shop", null)).toBeUndefined();
    expect(appDomain("my-shop", "")).toBeUndefined();
  });
});

describe("dailyCronAtIST", () => {
  it("converts India time to UTC", () => {
    expect(dailyCronAtIST(3, 0)).toBe("30 21 * * *"); // 03:00 IST = 21:30 UTC the day before
    expect(dailyCronAtIST(12, 0)).toBe("30 6 * * *");
    expect(dailyCronAtIST(5, 30)).toBe("0 0 * * *");
  });
});

describe("buildAppEnvVars", () => {
  const vars = buildAppEnvVars({
    appName: "my-shop",
    emailDomain: "buildcity.cloud",
    adminEmail: "me@example.com",
    productionDatabaseUrl: "postgres://app:prod@prod-db:5432/app",
    previewDatabaseUrl: "postgres://app:preview@preview-db:5432/app",
  });
  const get = (list: typeof vars.production, key: string) => list.find((v) => v.key === key)?.value;

  it("gives previews their own database, never the production one", () => {
    expect(get(vars.production, "DATABASE_URL")).toBe("postgres://app:prod@prod-db:5432/app");
    expect(get(vars.preview, "DATABASE_URL")).toBe("postgres://app:preview@preview-db:5432/app");
    expect(vars.preview.every((v) => v.is_preview)).toBe(true);
    expect(vars.production.every((v) => !v.is_preview)).toBe(true);
  });

  it("uses different secrets for production and previews", () => {
    expect(get(vars.production, "BETTER_AUTH_SECRET")).not.toBe(get(vars.preview, "BETTER_AUTH_SECRET"));
    expect(get(vars.production, "SEED_ADMIN_PASSWORD")).not.toBe(get(vars.preview, "SEED_ADMIN_PASSWORD"));
  });

  it("meets the app's own env rules (secret 32+, admin password 12+)", () => {
    for (const list of [vars.production, vars.preview]) {
      expect(get(list, "BETTER_AUTH_SECRET")!.length).toBeGreaterThanOrEqual(32);
      expect(get(list, "SEED_ADMIN_PASSWORD")!.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("without a Resend key, email is off everywhere", () => {
    expect(get(vars.production, "EMAIL_MODE")).toBe("log");
    expect(get(vars.preview, "EMAIL_MODE")).toBe("log");
    expect(get(vars.production, "RESEND_API_KEY")).toBeUndefined();
  });

  it("starts with email off and keeps secrets out of the Docker build", () => {
    expect(get(vars.production, "EMAIL_MODE")).toBe("log");
    expect(get(vars.production, "EMAIL_FROM")).toBe("my-shop <noreply@buildcity.cloud>");
    expect([...vars.production, ...vars.preview].every((v) => v.is_buildtime === false)).toBe(true);
  });

  it("does not set BETTER_AUTH_URL, so each preview uses its own COOLIFY_URL", () => {
    expect(get(vars.production, "BETTER_AUTH_URL")).toBeUndefined();
    expect(get(vars.preview, "BETTER_AUTH_URL")).toBeUndefined();
  });
});

describe("setEnvValue", () => {
  it("replaces an existing line", () => {
    expect(setEnvValue("A=1\nB=2\n", "A", "9")).toBe("A=9\nB=2\n");
  });

  it("adds a missing line at the end", () => {
    expect(setEnvValue("A=1", "B", "2")).toBe("A=1\nB=2\n");
  });

  it("keeps $ signs in the value as they are", () => {
    expect(setEnvValue("A=1\n", "A", "x$&y")).toBe("A=x$&y\n");
  });
});

describe("pickAdminEmail", () => {
  it("prefers --admin-email over the git email", () => {
    expect(pickAdminEmail("me@example.com", "git@example.com")).toEqual({ email: "me@example.com" });
    expect(pickAdminEmail(undefined, "git@example.com")).toEqual({ email: "git@example.com" });
  });

  it("refuses GitHub noreply addresses, which cannot receive password-reset emails", () => {
    expect(pickAdminEmail(undefined, "123+me@users.noreply.github.com")).toHaveProperty("error");
  });

  it("refuses an empty or malformed email", () => {
    expect(pickAdminEmail(undefined, "")).toHaveProperty("error");
    expect(pickAdminEmail("not-an-email", "")).toHaveProperty("error");
  });
});

describe("buildAppEnvVars with a Resend key", () => {
  const vars = buildAppEnvVars({
    appName: "my-shop",
    emailDomain: "buildcity.cloud",
    adminEmail: "me@example.com",
    productionDatabaseUrl: "postgres://a:b@prod:5432/app",
    previewDatabaseUrl: "postgres://a:c@preview:5432/app",
    resendApiKey: "re_test_key",
  });
  const get = (list: typeof vars.production, key: string) => list.find((v) => v.key === key)?.value;

  it("sends real email in production", () => {
    expect(get(vars.production, "EMAIL_MODE")).toBe("live");
    expect(get(vars.production, "RESEND_API_KEY")).toBe("re_test_key");
  });

  it("lets previews email only the admin, never real users", () => {
    expect(get(vars.preview, "EMAIL_MODE")).toBe("allowlist");
    expect(get(vars.preview, "EMAIL_ALLOWLIST")).toBe("me@example.com");
    expect(get(vars.preview, "RESEND_API_KEY")).toBe("re_test_key");
  });
});

describe("checkBackup", () => {
  it("accepts a successful backup", () => {
    expect(checkBackup({ status: "success", message: null }, true)).toEqual({ ok: true });
  });

  it("rejects a missing or failed backup", () => {
    expect(checkBackup(undefined, true).ok).toBe(false);
    expect(checkBackup({ status: "failed", message: "pg_dump error" }, false).ok).toBe(false);
  });

  it("catches a failed S3 copy that Coolify still calls success", () => {
    const result = checkBackup({ status: "success", message: "Warning: S3 upload failed: access denied" }, true);
    expect(result.ok).toBe(false);
  });

  it("ignores S3 warnings when backups are not sent to S3", () => {
    expect(checkBackup({ status: "success", message: "Warning: S3 upload failed" }, false).ok).toBe(true);
  });
});

describe("pickEmailDomain", () => {
  it("uses the configured domain (the one verified in Resend)", () => {
    expect(pickEmailDomain("mail.buildcity.cloud", "https://my-shop.buildcity.cloud", "my-shop")).toBe(
      "mail.buildcity.cloud",
    );
  });

  it("accepts a full address or extra spaces in the file", () => {
    expect(pickEmailDomain(" noreply@Mail.BuildCity.cloud\n", undefined, "x")).toBe("mail.buildcity.cloud");
  });

  it("otherwise uses the app's parent domain", () => {
    expect(pickEmailDomain(undefined, "https://my-shop.buildcity.cloud", "my-shop")).toBe("buildcity.cloud");
    expect(pickEmailDomain(undefined, undefined, "my-shop")).toBe("example.com");
  });

  it("rejects something that is not a domain", () => {
    expect(() => pickEmailDomain("not a domain", undefined, "x")).toThrow(/not a domain/);
  });
});
