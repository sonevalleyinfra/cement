import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { db, schema } from "@/db";
import { env } from "@/env";
import { sendEmailInBackground } from "@/lib/email";
import {
  existingAccountMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/lib/email/templates";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

export const auth = betterAuth({
  appName: "App Factory",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.TRUSTED_ORIGINS,

  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Extra column on the user table (kept here so `pnpm auth:generate` keeps it).
  // input: false = users cannot change it themselves; the admin sets it in /users.
  user: {
    additionalFields: {
      phone: { type: "string", required: false, defaultValue: "", input: false },
    },
  },

  emailAndPassword: {
    enabled: true,
    // The admin creates every user (auth.api.createUser is not affected by this).
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      sendEmailInBackground(resetPasswordMessage(user.email, url));
    },
    onExistingUserSignUp: async ({ user }) => {
      sendEmailInBackground(existingAccountMessage(user.email, `${env.APP_URL}/sign-in`));
    },
    // With requireEmailVerification, signing up with an existing email returns a
    // fake user (so attackers cannot discover who has an account). The admin
    // plugin adds fields to the user, so the fake user must include them too.
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalFields,
      id,
    }),
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendEmailInBackground(verifyEmailMessage(user.email, url));
    },
  },

  plugins: [
    admin(),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
