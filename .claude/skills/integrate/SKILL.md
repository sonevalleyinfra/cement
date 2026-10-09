---
name: integrate
description: Add an integration to this app - payments (Razorpay), video/audio calls (LiveKit), Google sign-in, Firebase, file storage (S3/R2), SMS/OTP (MSG91), error alerts (Sentry) or another service - wired to the shared key safe.
argument-hint: "<service>"
disable-model-invocation: true
---

Add **$ARGUMENTS** to this app. Follow CLAUDE.md. Read the service's official docs for the version you install
(WebFetch), never guess an API.

## Steps
1. Install the official server SDK if there is one (`pnpm add <package>`).
2. Keys: use the standard names below (they match the key safe template in `~/.config/app-factory/`).
   - Add each to `src/lib/env-schema.ts` (+ a test in `env-schema.test.ts`), `.env.example` and the README table.
   - In `.env.example`: an **empty value** means "required in production" (release refuses without it);
     put `# <what it is> (optional)` right above a key that isn't required.
   - **No `NEXT_PUBLIC_` keys**: the production build has no env vars. Pass public values (e.g. a Razorpay key id)
     from server code to the page instead.
3. Put the service code in a server-only module, e.g. `src/lib/razorpay.ts`. Never import it from `"use client"` files.
   Every server action or route that uses it starts with `requireUser()` / `requireAdmin()` and checks ownership.
4. Business rules (amounts, statuses, limits, signature checks) go in plain functions with `*.test.ts` tests.
5. Run `pnpm keys` and tell the owner exactly which test and live keys to add, and where to get them
   (see `/keys`; never ask for values in chat). Then restart `pnpm dev` (it copies test keys into `.env`).
6. When it works locally: `/ship`.

## Standard key names and notes
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Test keys start with `rzp_test_`,
  live with `rzp_live_` (the kit refuses mix-ups). Amounts are already paise (integers): use `src/lib/money.ts`.
  Create orders on the server; verify the payment signature and webhooks (raw body) on the server before marking anything paid.
- **LiveKit**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Make access tokens on the server after `requireUser()`.
- **Google sign-in**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, via Better Auth's social providers (read its docs for
  the installed version). In Google Cloud, add the redirect URIs for http://localhost:3000 and the production domain.
  Google doesn't accept wildcard domains, so previews need Better Auth's OAuth proxy approach (check its docs) or
  Google sign-in is tested on localhost and production only. Tell the owner which.
- **Firebase (server)**: service account JSON as a file in the key safe → `FIREBASE_SERVICE_ACCOUNT_JSON`
  (`JSON.parse` it in server code). `google-services.json` is for Android app builds; if needed it's `GOOGLE_SERVICES_JSON`.
- **File storage (R2/S3)**: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
  Upload with presigned URLs; check the user may access the file.
- **SMS/OTP (MSG91)**: `MSG91_AUTH_KEY`. Rate-limit OTP sending.
- **Sentry**: `SENTRY_DSN` (optional).
- Anything else: `<SERVICE>_<THING>` in capitals, e.g. `SHIPROCKET_API_KEY`.
