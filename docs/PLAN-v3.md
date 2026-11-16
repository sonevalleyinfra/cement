# Cement app: plan to finish (v3)

## Context

The owner wants to finish the app to their satisfaction: very simple screens for non-technical sales and
logistics staff, a rich dashboard and reports for the owner, and full accountability, safety and logging.

A review of the latest GitHub code (`origin/master` at `0d85c8b`, 22 commits ahead of the local copy) found:

- **Strong base:** full flow (orders → approval with credit check → dispatch → stock → ledger → payments →
  cash handover → supplier accounts), every server action guarded, append-only books with DB triggers
  (`drizzle/0037_books_append_only.sql`), activity log (`src/lib/audit.ts`), double-save guard
  (`src/lib/form-submissions.ts`), ~81 test files, nightly backups with tested restore.
- **Gaps:** home screens drifted from `docs/DESIGN.md`; back arrow removed; long forms and jargon; 11 reports
  but no charts/trends, CSV-only export; a few accountability loopholes; spec (`docs/idea.md`) out of date.

No real data is in the app yet, so restructuring is safe.

## Owner decisions (this session)

| Topic | Decision |
| --- | --- |
| Language | Simple English only (remove stray Hindi/Hinglish strings) |
| Owner must see | Money owed/collected, sales and profit, stock and trucks, staff accountability |
| Report delivery | In the app + Excel/PDF download |
| Cancel order | Keep as today: sales and logistics may cancel the unsent part, with logged reason |
| Blocked shop at dispatch | Warn but allow, no extra step; Blocked only (not On hold); chip on the list and red box in the sheet; alert owner, accounts and the shop's sales person; show in Exceptions report |
| Cheques | Keep; update the spec |
| Accountant and reports | All reports, including profit, purchases, supplier statement and damage value (changed 16 Nov 2026: they need them for book-keeping, so nothing is hidden) |
| Back arrow | Bring it back on every inner screen |
| Owner home | Simple Home (today + needs attention) plus a separate Dashboard with charts |
| Long forms | Short form first, rest behind "More details"; credit terms stay admin-only |
| Accountability extras | No acting as other users; Exceptions report |
| Order of work | Safety → staff screens → dashboard and reports → extras |
| Sales and other shops' orders | Any sales person may edit quantity or cancel on any shop's order (logged) |
| Temporary passwords | Stay as today: admin may set one for staff, logged; no forced change at next sign-in |
| Admins | Only one admin, always; an admin cannot set another admin's password or email |
| Adding bags to an approved order | Always back for approval, whoever does it; partly dispatched orders only go down |
| Extras in this round | Day book, share statement to WhatsApp, sales targets, proof of delivery |

## How the work is done

- Decided with the owner on 2026-11-16. Progress is tracked in `docs/PROGRESS.md`.
- Every stage is one or more small PRs via `pnpm ship`; never commit to `master`; merge only when the owner asks.
- Every business rule goes in a plain function in `src/lib/*-rules.ts` with a `*.test.ts`.
- Schema changes only through `pnpm db:generate --name <change>`.
- Read the bundled Next.js docs and the installed library docs before using any API.
- Explain each change to the owner in plain language; show the preview link for them to try on a phone.

### Who does what (cost control)

| Work | Done by |
| --- | --- |
| Decisions, design of each change, money/permission/migration logic, final check of every diff | Main model (this session) |
| Well-specified building: rebuilding a screen on shared components, wording changes, writing tests, report queries from a written spec | Sonnet subagents (`model: "sonnet"`), one tight brief each |
| Finding code, reading docs, "where is X used" | Haiku / Explore subagents |
| Independent review of each safety PR before shipping | Fresh review subagent that sees the diff, not my conclusions |

- Briefs name the files, the rule, the tests expected and what "done" looks like. Two writers never touch the
  same files.
- A subagent's report is not proof: I read the diff and run the checks myself before showing the owner.
- If a cheaper model gets a piece wrong twice, I do that piece myself instead of retrying.

### Keeping context small

- **The docs are the memory, not the chat.** `docs/PLAN-v3.md` holds decisions and stages; `docs/PROGRESS.md`
  gets a line per finished PR and a "next up" note. Any fresh session can start with "read PLAN-v3 and
  PROGRESS, continue".
- **One stage (or one area of Stage 2/3) per session.** At the end of each I say "good point to start a fresh
  session" and give the one-line prompt to paste. Mid-stage, if the chat gets long, I ask the owner to compact.
- Big outputs (test logs, page dumps, wide searches) stay inside subagents; only the conclusion comes back.
- New decisions made while steering are written into `docs/PLAN-v3.md` in the same PR, so nothing lives only
  in chat.

### Visual feedback loop (Claude in Chrome on the owner's Brave)

- App runs locally with `pnpm dev`; test users for all five roles come from the project's seed (add a
  dev-only seed for sales/accounts/logistics/retailer users and sample shops, stock and orders if missing).
- For every screen change: screenshot **before** at phone width (390px) → change → screenshot **after** →
  show both to the owner → owner steers → repeat until approved. One screen or one point at a time.
- Each role is walked end to end in the browser after each PR (admin, sales, accounts, logistics, retailer),
  checking the browser console for errors and `/activity` for a log row per action.
- End of each stage: a full cross-role run of one real story (order placed by sales → approved by accounts →
  dispatched by logistics → payment collected → seen on owner Dashboard), with screenshots.
- If the Brave extension cannot be reached, I say so and ask before using the app's built-in browser.

### Checkpoints with the owner

1. Start of a stage: short note on what will change and why.
2. Each screen: before/after screenshots, owner approves or steers.
3. End of a PR: plain-language summary, preview link, checks result.
4. Merge only when the owner says so (`pnpm release`).

## Stage 0: Document the agreed idea (1 PR)

- Add `docs/PLAN-v3.md` with the decision table and stages from this plan.
- Update `docs/idea.md` to match reality: cheques, trucks list, two-product purchases, quantity edits,
  tracking IDs, cancel rule, accountant report access, "customer" category, Android wrapper.
- Bring `docs/PROGRESS.md` up to date and add a v3 checklist.

## Stage 1: Safety and accountability (small PRs)

1. **Empty-truck check on purchase**: `src/app/(app)/stock/actions.ts` (~271-321). Resolve the truck and lock
   it first, then check it is empty, for both typed and picked trucks. Move the rule into
   `src/lib/purchase-rules.ts` with tests (two products max, freight on first item, empty truck).
2. **Quantity edit** (`updateOrderBags`, `src/app/(app)/orders/actions.ts:396`): use `rolesFor` from
   `src/lib/permissions.ts`; sales limited to their own shops (reuse `order-access.ts`); upper bag limit as in
   `placeOrder`; `saveOnce`; validate the note; notification; fix `statusAfterBagEdit`
   (`src/lib/order-rules.ts:153`) so an order reduced to the bags already sent becomes dispatched; re-run the
   credit check when bags go up; handle the unique `creditOverrides.orderId` on re-approval. Tests for each.
3. **No acting as others**: first confirm in the Better Auth docs what `admin()` in `src/lib/auth.ts:69`
   exposes; then switch off impersonation and make sure role/ban/remove/password changes can only happen
   through our logged actions in `src/app/(app)/users/actions.ts`.
4. **Blocked shop at dispatch**: rule in `src/lib/dispatch-rules.ts` returning a warning; warning shown in
   `dispatch/dispatch-view.tsx` via the shared caution panel; audit row + owner notification.
5. **Accountant report access**: dropped. The owner decided the accountant sees every report (already
   how `viewReports` works), so there is nothing to build.
6. **Sales sees only own shops' dues**: `loadDues` in `receipts/actions.ts:40`, reuse `ledger/access.ts`.
7. **Logging gaps**: write audit rows in the same transaction for name change and temporary password
   (`users/actions.ts:215`, `dashboard/actions.ts:24`); log driver detail changes on trucks.
8. **DB protection**: new migration extending the append-only/no-delete triggers to `purchases`; no-delete on
   `retailers`, `vehicles`, `user`.
9. **CI runs the database tests**: add a Postgres service and `TEST_DATABASE_URL` to
   `.github/workflows/ci.yml`; add DB tests for `recordPurchase`, `dispatchOrder`, `saveReceipt`, `placeOrder`,
   `updateOrderBags`, wallet handover.
10. **Small fixes**: notification unread count capped at 10 (`api/notifications/poll`); slow the 3-second poll; fix stale "admin only" cancel comments in `src/lib/order-rules.ts` and stale cheque test titles in
    `src/lib/receipt-rules.test.ts`.

## Stage 2: Simple staff screens (one PR per area)

- **Back arrow**: restore `back` in `src/components/app/page-header.tsx`.
- **Homes**: rebuild `dashboard/simple-home-sections.tsx` on the shared components (`ListCard`, `Stat`,
  `IconTile`, `StatusChip`), one layout for all roles, 48px targets, no raw colours. Reuse what is good in the
  unused `dashboard/home-sections.tsx`, then delete dead files (`home-sections.tsx`, `view-toggle.tsx`,
  `order-age-timer.tsx`).
- **Owner Home**: today's numbers + needs-attention only (queries already in `src/lib/owner-home.ts`,
  `home-stats.ts`); the rest moves to the Dashboard in Stage 3.
- **Short forms + "More details"**: new shop (`retailers-view.tsx`: name, phone, area first), new order
  (shop, product, bags; rate hint stays), payment, purchase (`stock/stock-form.tsx`), dispatch sheet.
  One shared "More details" pattern added to `src/components/app` and `/design`.
- **Plain words**: replace jargon (UTR → "Bank reference no.", Landed cost → "Total cost per bag",
  Opening → "Starting stock/balance", DSO → "Avg. days to get paid"); remove Hindi/Hinglish strings
  (`post-action-dialog.tsx`, cheque fields, `stock/actions.ts` errors).
- **One success pattern**: bring `PostActionDialog` into DESIGN.md rules (48px, no "!") and use it everywhere,
  or replace with the existing toast; fix header button sizes and the More screen to use `ListCard`.
- Update `docs/DESIGN.md` for anything added.

## Stage 3: Owner Dashboard and reports

- **Dashboard screen** (admin; new tab or More entry via `src/lib/nav-rules.ts`) with one date picker
  (reuse `report-presets.ts`) and four sections:
  - Money: dues and aging, collected by day, cash with staff, online to verify.
  - Sales and profit: bags and margin trend by day/month; by product, shop, area, salesperson.
  - Stock and trucks: godown stock, stock on wheels, purchases, damage/shortage.
  - People: activity per staff member, exceptions count.
- **Charts**: add shadcn/ui `chart` (Recharts) after reading its docs; follow the dataviz rules; phone first.
- **New report queries** as plain, tested functions beside `src/lib/reports.ts`, `sales-report.ts`,
  `staff-report.ts`: time series, by salesperson/area/shop, margin per shop.
- **Exceptions report**: cancels, rate changes, back-dated payments, reversals, stock adjustments, credit
  overrides, dispatches to blocked shops; built from `auditLog` and `orderEvents`.
- **Excel + PDF** on every report (extend `serveCsv` so each export is still permission-checked and logged);
  link the hidden `reports/books` screen; add previous-period comparison to all reports.

## Stage 4: Extras

1. **Day book**: one page per day (sold, dispatched, purchased, collected, handed over, closing stock and cash).
2. **Share statement to WhatsApp**: statement PDF from `statement-rules.ts` + phone share sheet (check
   Capacitor share support for the Android app).
3. **Sales targets**: monthly bags/collection target per salesperson (new table, admin sets); progress on the
   sales home and the Dashboard.
4. **Proof of delivery**: delivered step after dispatch with receiver name and photo (reuse the payment-proof
   image checks in `receipt-rules.ts`); decide photo storage before building (not text in the database).

## Verification (every PR)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (all run by `pnpm ship`).
- Run `pnpm dev` and walk the changed flow in the browser at phone width (390px) for each affected role.
- Check `/activity` shows a row for every action taken during the walk-through.
- Owner tries the PR preview link on their phone before asking for `pnpm release`.
- After Stage 1: confirm CI shows the database tests running, not skipped.
