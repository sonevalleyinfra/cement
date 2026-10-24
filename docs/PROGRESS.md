# Progress

One line per merged PR: date · PR · what changed · kanban task.

- 2026-10-17 · PR #34 · ADR 0001: books and activity log audit (append-only triggers, Books check, no nightly check) · t_182bf909
- 2026-10-18 · PR #35 · docs: PLAN-v1 (v1 completion plan and task graph) · t_ae1694d7
- 2026-10-18 · PR #36 · DB enforces append-only books (triggers on ledger/stock/wallet/supplier/dispatch/order-event/activity-log tables, no delete on orders/receipts) + stock_movements actor check · t_49d4386e
- 2026-10-18 · PR #38 · Admin Books check report (invariants I1–I9, I11, I12, read-only) · t_b5101da1
- 2026-10-18 · PR #37 · Role nav and default tabs: per-role Orders default tab, Stock/Payments tab, one-shop ledger redirect · t_a20b5f83
- 2026-10-18 · PR #40 · seed:demo writes activity-log rows for everything it creates (Books check all ✓ on demo data) · t_a18ea377
- 2026-10-18 · PR #39 · Sales shortcuts: Home Record payment, retailer sheet Record payment/New order with ?retailer prefill, picker overlay fix, order retailer label · t_dae52ece
- 2026-10-18 · PR #41 · Polish: payment form retailer picker matches order form (label + chevron), retailer details re-indent · t_10ee41ab
- 2026-10-18 · PR #43 · Deactivating a sales person who has shops is refused; shops whose rep is inactive count in Home's Without sales person card and notify admin · t_661eff2f
- 2026-10-18 · PR #42 · Decision cards: dispatch card opens sheet + truck chips + take-from only places with enough bags; one Reject/Confirm layout on approvals, receipts verify, wallet; Verify/Confirm verbs, Cash recorded chip, handover pending error · t_15362fe7
- 2026-10-18 · PR #45 · Admin Home To do/Overview captions, More grouped (Money, Goods, People, Records, Account) + Books check row, Stock action tiles 2×2 · t_cc4e3a09
- 2026-10-18 · PR #46 · Polish: Verify online reject form inline in the card, wallet sheets use the Dispatch header rhythm, one "Reason for rejecting" label · t_e5e891d9
- 2026-10-18 · PR #47 · PageHeader on every screen (Home excepted), 48px back chevron on sub-screens replacing right-side back links, status chip on order/receipt title row, Account one Save per card, /admin kit page removed · t_aff01680
- 2026-10-18 · PR #44 · Rate box takes paise exactly (335.50; stray dot/comma never 100× a rate); rate change shows Unsent bags + Order total; rate-fill notification titled Ready to approve · t_05bc3877
- 2026-10-18 · PR #48 · Admin forms and row actions: purchase order with RateField cost, adjust reasons 2×2, labelled truck fields, Godowns/Catalogue/Users rows open one sheet with ConfirmStep, Users All tab + count badges + masked password, Off chip only on switched-off rows · t_45b3f658
- 2026-10-18 · PR #49 · Tokens, formats, motion: Approvals moss / Users+Staff slate (no violet), true minus and ₹0.00 for zero, hidePaise in lists, bag separators + "1 day", scrollbars hidden with edge fade, supplier statement stacked, 200ms fades with 30ms × 6 stagger and no card fade on first paint · t_598b6c73
- 2026-10-18 · PR #50 · Stock report "± moved" column shows bags moved in / out of places (godown↔truck), not the always-0 net · t_deda7253
- 2026-10-20 · PR #51 · Launch QA cement v1: master 94ad6bd deployed and CI green; local click-through at 390px for all 5 roles, 8 reports, Books check 11/11 OK, QA and design audit items confirmed fixed or parked in PLAN-v1; prod Books check left to the owner (no admin login for bots) · t_172b7a02
- 2026-10-24 · PR #52 · Order form shows stock and the shop's last rate with a ₹10 warning (also on fill rate and approval), orders search and Load more past 100, searchable statement shop picker, error / offline / not-found pages, static skeleton, no extra "Ready to approve" ping, ledger list shows .00 · t_d6c8855b
- 2026-10-24 · PR #54 · v2 A1+A2: shop master (owner, alt phone, address, area list, pincode, GPS, category, opened on, GSTIN stored only) + credit limit/days/status with append-only credit history; idea.md v2, PLAN-v2 · t_ef984cd2
