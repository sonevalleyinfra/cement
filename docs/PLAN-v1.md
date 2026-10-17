# Plan: cement v1

Goal: take cement from "built" to a fully working internal tool for one office. Scope ceiling is `docs/idea.md`: no GST, invoices, e-way bills, cheques, multi-firm or legal features.

Sources: QA audit (t_6f47f435, 0 P0 / 1 P1 / 12 P2), design audit (t_e54d47a8, 12 P1 flow / 28 P2 polish, groups G1-G7), books audit (ADR 0001, PR #34). Books are sound today: no money or bag errors found.

## Rules for every task
- One PR per task, under half a day. qa merges under the standing approval for cement (checks green, QA PASS, DESIGN PASS on UI, GATEKEEPER PASS on risky paths).
- Every PR adds one line to `docs/PROGRESS.md`: `date · PR # · what · task id`. That is the book of what changed.
- Tasks run in two lanes, one task at a time per lane, so PRs never fight over files. The box runs two workers.

## Order

### P0: nothing broken
None found.

### P1: must have for v1 (target 2026-10-19 to 10-21)
| Lane | Task | Level |
|---|---|---|
| Books | t_49d4386e append-only triggers + actor check (ADR T1, gatekeeper) | seniordev |
| Books | t_b5101da1 Admin Books check page (ADR T2) | dev |
| Books | t_661eff2f block deactivating a sales person who owns shops (QA P1) | dev |
| UI | t_a20b5f83 role nav + default tabs (G1) | dev |
| UI | t_dae52ece sales payment/order shortcuts, picker overlay bug (G2) | dev |
| UI | t_15362fe7 decision cards, dispatch truck chips, wallet fixes (G3) | dev |
| UI | t_cc4e3a09 admin Home and More grouping (G5) | designer |

### P2: polish (target 2026-10-22 to 10-23)
| Lane | Task | Level |
|---|---|---|
| Books | t_a18ea377 seed:demo writes activity-log rows (ADR T3) | juniordev |
| Books | t_05bc3877 rate input safety, total labels (QA P2 #2, #7, #8) | seniordev |
| Books | t_deda7253 stock report ± moved, confirm every audit P2 closed | juniordev |
| UI | t_aff01680 PageHeader + back nav, remove leftover /admin page (G4) | designer |
| UI | t_45b3f658 admin forms and row actions (G6) | designer |
| UI | t_598b6c73 tokens, formats, motion (G7) | designer |

### Launch (target 2026-10-24)
t_172b7a02 Launch QA cement v1: gated on every merge task. Full role-by-role click-through on prod, Books check all green, every audit item confirmed fixed or parked below.

Dates assume two workers and usage limits holding; they slip rather than skip steps.

## Not now
| Item | Why |
|---|---|
| Nightly books check | After append-only triggers a mismatch can only come from a code bug in a new PR. Revisit if Books check ever finds a real one (ADR 0001). |
| Atomic audit for user create/ban (G3) and logging sign-in or own password change (G4) | No money or bags involved; adds moving parts. |
| Undo dispatch / undo purchase (G6) | Spec has no undo. Fixes work today via reversal plus adjustment (ADR 0001, "Fixing mistakes"). |
| Skeleton shimmer loop | DESIGN.md is locked and allows it; the house rule bans loops. Owner decides; until then unchanged. |
| GST, invoices, e-way bills, cheques, multi-firm, rebrand | Out of the spec on purpose. |
| Weekly dependency PRs with a major bump | Owner approves those. |
