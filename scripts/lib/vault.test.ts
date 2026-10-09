import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import {
  declaredKeys,
  explainKeyProblems,
  fileToValue,
  fillLocalEnv,
  formatEnvValue,
  keyFromFileName,
  keyKind,
  planServerKeys,
} from "./vault";

const example = `
# Database (managed by the kit)
DATABASE_URL=postgres://postgres:postgres@localhost:5433/app
RESEND_API_KEY=

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Error alerts (optional)
SENTRY_DSN=

LIVEKIT_URL=wss://default.livekit.cloud
`;

describe("declaredKeys", () => {
  it("lists the app's own keys, skipping the ones the kit manages", () => {
    expect(declaredKeys(example)).toEqual([
      { key: "RAZORPAY_KEY_ID", required: true },
      { key: "RAZORPAY_KEY_SECRET", required: true },
      { key: "SENTRY_DSN", required: false },
      { key: "LIVEKIT_URL", required: false },
    ]);
  });

  it("only counts an (optional) comment directly above the key", () => {
    expect(declaredKeys("# (optional)\n\nA_KEY=\n")).toEqual([{ key: "A_KEY", required: true }]);
  });
});

describe("keyFromFileName / fileToValue", () => {
  it("names a file's key after the file", () => {
    expect(keyFromFileName("google-services.json")).toBe("GOOGLE_SERVICES_JSON");
    expect(keyFromFileName("/home/me/keys/firebase-service-account.json")).toBe("FIREBASE_SERVICE_ACCOUNT_JSON");
  });

  it("squeezes JSON onto one line and rejects broken JSON", () => {
    expect(fileToValue("a.json", '{\n  "project_id": "x",\n  "key": "-----BEGIN\\nabc"\n}\n')).toBe(
      '{"project_id":"x","key":"-----BEGIN\\nabc"}',
    );
    expect(() => fileToValue("a.json", "{ not json")).toThrow(/not valid JSON/);
    expect(fileToValue("cert.pem", "line1\nline2\n")).toBe("line1\nline2");
  });
});

describe("keyKind", () => {
  it("recognises Razorpay and Stripe test and live keys", () => {
    expect(keyKind("rzp_test_abc")).toBe("test");
    expect(keyKind("rzp_live_abc")).toBe("live");
    expect(keyKind("sk_live_abc")).toBe("live");
    expect(keyKind("pk_test_abc")).toBe("test");
    expect(keyKind("some-livekit-secret")).toBe("unknown");
  });
});

describe("formatEnvValue", () => {
  it("writes values so dotenv reads back exactly the same thing", () => {
    for (const value of ["rzp_test_abc", "wss://x.livekit.cloud", "has spaces # and hash", '{"a":"b\\nc"}']) {
      expect(parse(`K=${formatEnvValue(value)}\n`).K).toBe(value);
    }
  });

  it("refuses values it can't write safely", () => {
    expect(() => formatEnvValue("it's\nmultiline")).toThrow(/file/);
  });
});

describe("fillLocalEnv", () => {
  const declared = declaredKeys(example);

  it("adds missing test keys and keeps values already set", () => {
    const env = "EMAIL_MODE=log\nRAZORPAY_KEY_ID=rzp_test_mine\nRAZORPAY_KEY_SECRET=\n";
    const result = fillLocalEnv(env, declared, {
      RAZORPAY_KEY_ID: "rzp_test_shared",
      RAZORPAY_KEY_SECRET: "secret",
      SENTRY_DSN: "https://x@sentry.io/1",
      UNRELATED_KEY: "never copied",
    });
    const values = parse(result.text);
    expect(values.RAZORPAY_KEY_ID).toBe("rzp_test_mine");
    expect(values.RAZORPAY_KEY_SECRET).toBe("secret");
    expect(values.SENTRY_DSN).toBe("https://x@sentry.io/1");
    expect(values.UNRELATED_KEY).toBeUndefined();
    expect(result.filled).toEqual(["RAZORPAY_KEY_SECRET", "SENTRY_DSN"]);
  });

  it("never copies a live key to the computer", () => {
    const result = fillLocalEnv("", declared, { RAZORPAY_KEY_ID: "rzp_live_oops" });
    expect(result.refusedLive).toEqual(["RAZORPAY_KEY_ID"]);
    expect(parse(result.text).RAZORPAY_KEY_ID).toBeUndefined();
  });
});

describe("planServerKeys", () => {
  const declared = declaredKeys(example);
  const none = { production: new Set<string>(), preview: new Set<string>() };

  it("sends test keys to previews and live keys to production", () => {
    const plan = planServerKeys(
      declared,
      { RAZORPAY_KEY_ID: "rzp_test_1", RAZORPAY_KEY_SECRET: "t" },
      { RAZORPAY_KEY_ID: "rzp_live_1", RAZORPAY_KEY_SECRET: "l" },
      none,
    );
    expect(plan.preview).toEqual({ RAZORPAY_KEY_ID: "rzp_test_1", RAZORPAY_KEY_SECRET: "t" });
    expect(plan.production).toEqual({ RAZORPAY_KEY_ID: "rzp_live_1", RAZORPAY_KEY_SECRET: "l" });
    expect(plan.missingProduction).toEqual([]);
    expect(explainKeyProblems(plan)).toBeNull();
  });

  it("lists required live keys that production would lack, but not optional ones", () => {
    const plan = planServerKeys(declared, {}, {}, none);
    expect(plan.missingProduction).toEqual(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]);
    expect(explainKeyProblems(plan)).toMatch(/pnpm keys set RAZORPAY_KEY_ID --live/);
  });

  it("accepts a key Coolify already has, even if the key safe doesn't", () => {
    const plan = planServerKeys(declared, {}, {}, { production: new Set(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]), preview: new Set() });
    expect(plan.missingProduction).toEqual([]);
  });

  it("refuses a test key in production and a live key in previews", () => {
    const plan = planServerKeys(declared, { RAZORPAY_KEY_ID: "rzp_live_x" }, { RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "l" }, none);
    expect(plan.problems).toHaveLength(2);
    expect(plan.preview.RAZORPAY_KEY_ID).toBeUndefined();
    expect(plan.production.RAZORPAY_KEY_ID).toBeUndefined();
    expect(explainKeyProblems(plan)).toMatch(/LIVE keys \(prod.env\) hold a test key/);
  });

  it("gives previews an empty placeholder for live-only keys, so Coolify can't copy the live key into previews", () => {
    const plan = planServerKeys(declared, {}, { RAZORPAY_KEY_ID: "rzp_live_1", RAZORPAY_KEY_SECRET: "l" }, none);
    expect(plan.preview).toEqual({ RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" });
  });

  it("doesn't overwrite a preview key Coolify already has with a placeholder", () => {
    const plan = planServerKeys(declared, {}, { RAZORPAY_KEY_ID: "rzp_live_1", RAZORPAY_KEY_SECRET: "l" }, {
      production: new Set(),
      preview: new Set(["RAZORPAY_KEY_ID"]),
    });
    expect(plan.preview).toEqual({ RAZORPAY_KEY_SECRET: "" });
  });
});
