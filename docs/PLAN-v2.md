# Plan: cement v2 (launch-ready)

Goal: take cement from a sound books engine to the dealer's daily tool: capture the details we can't backfill later,
stop money loss with credit control and reversals, and show the metrics the owner runs the business on.
The AI phase comes after this and depends on the data captured here. Scope ceiling: `docs/idea.md` (v2).

Sources: product review of origin/master a63b4f7 (2026-10-24): sales & orders (S*), money & credit (M*),
stock & logistics (L*), metrics, UX & AI (R*), pm cross-module review. Verdict: the books are sound (append-only, locks,
FIFO aging, UTR rules). What's weak is credit control, how much detail we capture, how mistakes get corrected, and the metrics.

## Rules for every task
- One PR per task, under half a day. qa merges under the standing approval for cement (checks green, QA PASS,
  DESIGN PASS on UI, GATEKEEPER PASS on risky paths). Prod holds test data only, so each PR deploys as it passes (D6).
- Every PR adds one line to `docs/PROGRESS.md`: `date · PR # · what · task id`.
- Two lanes, one task at a time per lane, so PRs don't fight over files.

## Phase A — Capture (schema; do first, can't backfill)
| # | Item | From | Effort | Risky |
|---|---|---|---|---|
| A1 | Shop master: owner name, alt phone, address, area (admin list), pincode, GPS pin, category, opened_on, optional GSTIN (stored only) | S2, M14 | M | migration |
| A2 | Credit limit + credit days + status per shop (nullable, 30-day default), limit-change history | M1, S3, R11 | S (schema part) | migration |
| A3 | Order: deliver to shop/site, site address, receiver name/phone, required-by date, source (shop app/rep/phone/WhatsApp/office); notes split into staff_note / shop_note (fixes price-leak) | S1, S5 | M | migration |
| A4 | Reason codes (enum + optional note) on reject, cancel, rate change, override, payment reject/reversal, stock correction (+ transit_short, transit_burst, entry_mistake, expired); own `receipt_reversal` ledger kind | S5, R11, M10, L12 | M | migration, money |
| A5 | Purchase: invoice no + invoice date (= supplier entry date), truck/driver/phone fields, billed vs received bags (short/burst → linked adjustment, claim status), freight + unloading → landed cost per bag | L1, L2 | M-L | migration, money |
| A6 | Driver phone required (dispatch + purchase), tap-to-call | L4 | S | no |
| A7 | Online payment: method (UPI/NEFT/RTGS/IMPS), received-into bank account (admin list), payer name; note kept on cash; received_on date (staff ≤2 days back, admin any + reason) | M5, M4 | M | money |

## Phase B — Control (stops money loss)
| # | Item | From | Effort | Risky |
|---|---|---|---|---|
| B1 | Credit check at approval: exposure (dues + approved-not-sent) vs limit, oldest overdue days, last payment; over limit → per decision D2 | M1, S3 | M | money |
| B2 | Reverse dispatch / return bags / reverse purchase (decision D3), order status recomputed, ledger reversal | L3 | L | money, stock |
| B3 | Fix the race when deactivating or deleting staff who hold cash (one tx + row lock; refuse cash rows for banned users) | M9 | S | auth/money |
| B4 | Last-rate hint + ₹10 deviation warning on rate fill/approve | S4 | S | no |
| B5 | Deactivating a shop with dues needs a reason, and the shop stays on the overdue list; rep change logs the dues handed over | M15 | S | no |

## Phase C — See (metrics and daily use)
| # | Item | From | Effort |
|---|---|---|---|
| C1 | Owner Home: today/MTD bags & ₹ vs last month, MTD margin ₹/bag, collections today/MTD by mode | R1 | M |
| C2 | Owner Home risk: outstanding, overdue %, DSO, top 10 overdue shops, cash with staff + age, pending ages, stock value, all supplier balances | R2, M8, L5 | M |
| C3 | Overdue list (collection call list) for sales/accounts + Sales Home "collect today" + my collections/bags MTD | M2, R3 | M |
| C4 | Accounts/Logistics Home ages; godown days-of-cover | R4 | S |
| C5 | CSV export on reports + date presets (today…FY) + previous-period compare | R5, R7 | M |
| C6 | Orders search + paging past 100; searchable statement picker | S6, R10 | S |
| C7 | Error/offline/not-found pages, static skeleton (no loop), drop the extra rate_filled ping; ledger list shows .00 | R9, R13 | S |
| C8 | Stock report by place for the date range; damage/shortage ₹ report | L14, L12 | M |

## Not now (phase 2, before or with AI)
Rate list per area + floor (S7), targets (S10), shop-health/rep reports (S11), delivery confirmation + POD (S12/L7),
basket orders (S13), visit/follow-up log + promise-to-pay (S14/M3), WhatsApp/PDF statement share (M6/R6),
day book + denominations (M7), supplier due dates + schemes (M11), bank statement auto-match (M12),
dispatch freight to shop (L6), truck-direct one step (L8), reorder level (L9), FIFO ageing (L10), godown count sheet (L11),
logistics report (L13), charts (R8), reporting views + data dictionary (R12), notifications digest (R13), Hindi (R14),
AI features (R15).

## Decisions (owner, 2026-10-24, binding)
- **D1 Scope:** A + B + C exactly as listed. Everything in "Not now" is parked for phase 2 (with AI).
- **D2 Credit:** soft block. Over the limit or past credit days → red warning; accounts approve only with an override
  reason code; admin is notified; overrides counted in reports. No limit set → 30-day default, amber "No limit set",
  admin Home reminder.
- **D3 Reversals** (dispatch / return bags / purchase): admin only, any time, reason code required.
- **D4 Freight:** the freight and unloading we pay go into landed cost per bag (profit + stock value). The shop's rate
  includes delivery, so no freight line on shop dues.
- **D5 Payment date:** received_on; staff up to 2 days back, admin any date with a reason.
- **D6 Release:** prod holds test data only → merge and deploy each PR as it passes (standing approval on cement).
  Cheques stay out. Export = CSV (UTF-8 BOM, opens in Excel).
- Engineering calls (Office Manager): drop the extra rate_filled notification (spec conflict) but keep the history row;
  GSTIN is stored only, never used for tax; `docs/idea.md` amended to v2 in the first PR.
