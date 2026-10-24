# ADR 0001: Books and activity log ("keep book of everything")

Status: proposed · 2026-10-17 · Kanban t_182bf909 · Audited at master `ebf868d`

## Question

Is every movement of bags and money recorded append-only, attributed (who/when/why) and
reconcilable, and does the activity log cover every action? What is the smallest set of fixes?

## How it was checked

- Read every server action (`src/app/(app)/*/actions.ts`) and the write helpers (`lib/ledger.ts`,
  `lib/suppliers.ts`, `lib/stock-places.ts`, `lib/form-submissions.ts`, `lib/audit.ts`).
- Local Postgres 18, all 37 migrations, `seed:demo`, then a scratch Vitest rig that called the real
  server actions (session mocked) through one full day: godown, opening stock, purchase (sent twice
  with the same form id), stock fix, move to a typed truck, order (sent twice), approve, dispatch from
  the godown (sent twice), rate change, dispatch from the truck, a refused over-dispatch, cancel the
  rest, cash and online payments (cash sent twice), verify (twice), reject, reverse cash ("still with
  holder") and online, handover request (sent twice), part confirm, confirm again (refused), retailer
  opening (twice) and adjustment (twice), supplier payment (twice), credit and adjustment.
- Then ran the invariant SQL below. The rig and SQL are not committed (scratch tools); the SQL is
  the starting point for the Books check page.

## Result in one line

The books are sound. Every bags/money action writes its movement rows, its activity-log row and
(where a form creates something) its one-time id **in one transaction**; all invariants held and
no replay created a second row. The only real gap: "append-only" is a code convention, not
enforced by the database.

## Write actions

Legend: **Tx** = movement rows, log row and form id commit or roll back together.
**Once** = `saveOnce` one-time form id (a replay returns the first result, writes nothing);
"state" = no form id, but the row is locked and the action refuses a second run ("already
verified", "already answered", "That is the rate already").

| Action (who) | Rows written | Activity log | Double tap |
|---|---|---|---|
| `placeOrder` (sales, retailer, admin) | `orders`, `order_events` | order place | Once |
| `fillRate` (sales, admin) | `orders.rate`, `order_events` (rate before/after) | order fill_rate | state |
| `changeRate` (logistics, admin, reason) | `orders.rate`, `order_events` (before/after) | order change_rate | state |
| `decideOrder` (accounts, admin) | `orders.status`, `order_events` | order approve / reject | state |
| `cancelOrder` (admin, reason) | `orders.status`, `order_events` | order cancel (+ cancelled bags) | state |
| `dispatchOrder` (logistics, admin) | `dispatches`, `stock_movements` (−bags), `ledger_entries` order_debit (bags × rate), `order_events`, `orders.status` | dispatch create | Once |
| `recordOpening` stock (admin) | `stock_movements` opening | stock opening | Once (+ one per product/place) |
| `recordPurchase` (admin) | `stock_movements` purchase (+cost/bag), `supplier_ledger_entries` purchase (linked by `stock_movement_id`) | stock purchase (one row names both) | Once |
| `recordAdjustment` stock fix (admin, reason) | `stock_movements` adjustment | stock adjustment | Once |
| `transferStock` (logistics, admin) | 2 × `stock_movements` transfer (−/+) | stock transfer | Once |
| typed truck (inside purchase/move/dispatch) | `vehicles` | vehicle create | inside parent |
| `saveReceipt` cash (any staff) | `receipts` received, `ledger_entries` receipt_credit (−), `wallet_movements` collected | payment record | Once (+ UTR unique) |
| `saveReceipt` online | `receipts` unverified | payment record | Once (+ UTR unique) |
| `verifyOnline` (accounts, admin) | `ledger_entries` receipt_credit (−), `receipts.status` | payment verify | state |
| `rejectOnline` (accounts, admin, reason) | `receipts.status` | payment reject | state |
| `reverseReceipt` (accounts, admin, reason) | `ledger_entries` (+), `wallet_movements` reversed (cash "still with holder"), `receipts.status` | payment reverse (+ where the cash is) | state |
| `requestHandover` (staff) | `wallet_movements` handover_request | handover request | Once |
| `answerHandover` (accounts, admin) | `wallet_movements` confirmed (may be part) / rejected | handover confirm / reject | state |
| `setOpeningBalance` retailer (admin) | `ledger_entries` opening | ledger opening | state (+ one opening per retailer, DB unique) |
| `addAdjustment` retailer (admin, reason) | `ledger_entries` adjustment | ledger adjustment | Once |
| supplier opening / payment / credit / adjustment (admin) | `supplier_ledger_entries` | supplier_entry \<kind\> | Once (+ one opening per brand) |
| users, retailers, godowns, catalogue, own name | master rows | yes, one row each (update rows keep before/after) | n/a |
| notifications read, sign out | notification flags | no (not business actions) | n/a |

Gaps found (none lose or corrupt money or bags):

| # | Gap | Severity | Fix |
|---|---|---|---|
| G1 | Nothing in the database stops an `UPDATE`/`DELETE` on ledger, movement or log rows. Verified locally: `update ledger_entries ...` and `delete from audit_log ...` both succeed. Past data migrations (0022, 0029, 0034, 0036) did edit such rows. | **Medium**: append-only rests on code review only | T1 |
| G2 | `stock_movements.actor_id` is nullable (every other book table has `NOT NULL`). All app writes set it; 0 null rows locally. | Low | T1 |
| G3 | User deactivate/reactivate: Better Auth bans first, the log row is written after, outside a transaction. A crash between them leaves a ban with no log row. Same for `createUser` (auth row, then roles + log). | Low (masters, no money) | not now |
| G4 | Sign-in and a user changing their own password are not in the activity log. | Low | not now |
| G5 | `seed:demo` inserts rows directly, without log rows, so the local demo's activity log is near empty and coverage checks flag demo data. Local only. | Low | T3 (optional) |
| G6 | No "undo dispatch" / "undo purchase". A wrong one is fixed with two separate entries (see "Fixing mistakes"), which are not linked to each other. | Low (spec has no undo) | not now |

## Invariants

All held on the local run (seed data + the rig day). "By construction" means the app has no
stored total that could drift: every screen and report sums the rows.

| # | Invariant | Result |
|---|---|---|
| I1 | Stock per product per place = sum of movements, never below 0 (also as a running sum in time order) | held |
| I2 | Per order: dispatched bags ≤ ordered; status matches (dispatched = all out, partly = some, placed/approved/rejected = none) | held |
| I3 | Per order: sum of `order_debit` ledger rows = Σ dispatch bags × dispatch rate | held |
| I4 | Per order: dispatch stock movements = − dispatched bags | held |
| I5 | Transfers net to 0 per product | held |
| I6 | Each purchase movement has exactly one supplier purchase entry = bags × cost/bag, on the product's brand | held |
| I7 | Per receipt: ledger credit = −total if received/verified, 0 if unverified/rejected/reversed | held |
| I8 | Per cash receipt: wallet `collected` = total, recorded on the recorder; a `reversed` wallet row only on reversed cash, = total | held |
| I9 | Cash held per staff = collected − reversed − confirmed handovers ≥ 0; minus pending requests ≥ 0; each request answered at most once; confirmed ≤ requested | held |
| I10 | Retailer dues = ledger sum; supplier balance = supplier ledger sum | by construction (no stored balances) |
| I11 | Every movement/money row has an actor | held (0 nulls); `stock_movements` not enforced (G2) |
| I12 | Every movement/money row has its activity-log row | held for every row the app wrote; only `seed:demo` rows lack one (G5) |
| I13 | No `UPDATE`/`DELETE` on ledger, movement or log rows | holds in app code (no such statement); **not enforced** (G1) |

## Decision

1. **Enforce append-only in Postgres (T1).** One migration adds a trigger function that raises on
   `UPDATE` or `DELETE` (and a statement trigger on `TRUNCATE`) for the book tables:
   `ledger_entries`, `stock_movements`, `wallet_movements`, `supplier_ledger_entries`,
   `dispatches`, `order_events`, `audit_log`; and on `DELETE` only for `orders` and `receipts`
   (their status changes, but they are never removed). A deliberate data repair in a future
   reviewed migration opts out with `SET LOCAL cement.books_repair = 'on'`, which the trigger
   checks; nothing in the app sets it. Not covered: `form_submissions` (its `result_id` is updated
   by design), notifications, masters.
   Same migration: `stock_movements` gets `CHECK (actor_id IS NOT NULL) NOT VALID`, which binds
   new rows without failing on any old ones.
2. **Add an admin "Books check" (T2).** A read-only report under Reports that runs I1–I9, I11 and
   I12 and shows each as ✓ or "N problems", with up to 20 offending rows linking to the order,
   payment, staff member or account. Queries in `lib/books-check-queries.ts` (run by `lib/books-check.ts`); turning results into
   pass/fail lines in plain functions with tests. No writes, no fixing from the page.
   I12 skips rows older than the first activity-log row, so data from before the log existed is
   not reported forever.
3. **No nightly check.** One business, small volume, and after T1 a mismatch can only come from a
   code bug in a new PR. The admin opens Books check when in doubt, and qa runs it in launch QA.
   Revisit only if Books check ever finds a real mismatch.
4. G3, G4, G6: not now. They don't affect money or bags, and fixing them adds moving parts the
   owner asked to avoid.

## Fixing mistakes (how it works today, no new feature)

- Wrong payment: reverse it (reason), then record the right one.
- Wrong dispatch (bags came back, wrong shop): stock fix "count" (+bags, note names the order) and
  a retailer ledger adjustment (− amount, reason names the order). The order stays "dispatched".
- Wrong purchase: stock fix (− bags) and a supplier adjustment (− amount), both with a reason.
- Wrong rate: change rate before the bags go out; after, a ledger adjustment.

## Suggested tasks (pm splits and routes)

| # | Task | Who | Size | Acceptance |
|---|---|---|---|---|
| T1 | Migration: append-only triggers + `stock_movements` actor check (decision 1), as a custom migration (`pnpm db:generate --custom --name books_append_only`) | seniordev (migration, risky path, gatekeeper) | ~2 h | `UPDATE`/`DELETE`/`TRUNCATE` on each listed table raises; same with `SET LOCAL cement.books_repair='on'` succeeds; all app actions still work (dispatch, payment, reversal, handover, purchase, transfer) on a local DB; migrating a copy of a pre-change DB keeps every row; insert into `stock_movements` with null actor fails; `docs/PROGRESS.md` line |
| T2 | Admin Books check page (decision 2) | dev (read-only; designer review on the PR) | ~4 h | Admin only (`requireRole` admin; others redirected); one line per check with ✓ or count; drill-down rows link to the record; tests for the pass/fail rules; on `seed:demo` data plus a row tampered locally (inside `SET LOCAL cement.books_repair='on'`) the matching check turns red; no write queries; `docs/PROGRESS.md` line |
| T3 | `seed:demo` writes activity-log rows for what it creates (optional) | juniordev | ~1 h | Local demo activity log shows the seeded actions; Books check is all ✓ on fresh demo data |

Order: T1 → T2 (T2's tamper test needs to know the trigger exists) → T3.

## Out of scope

GST, invoices, e-way bills, accounting exports, multi-firm, legal features, an office cash book
(cash after handover), undo buttons.
