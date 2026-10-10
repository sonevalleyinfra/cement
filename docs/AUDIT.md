# Permission and correctness audit (task 16a, Oct 2026)

> Historical record, written before firms were removed (spec v1.0: one business, no firms).
> Anything below about firms, firm access or split receipts no longer applies.
> Cheques were removed too (payments are cash or online only); cheque notes below are history.

Checked every page (`src/app/**/page.tsx`) and every exported server action
(`"use server"` files) against `docs/idea.md` (roles) and `CLAUDE.md` (rules).

## How permissions work now

- **One table** `src/lib/permissions.ts` (`ACTION_ROLES`) says which roles may do what.
  Pages and actions call `requireRole(...rolesFor("action"))`; menus use `can(role, "action")`.
  `src/lib/permissions.test.ts` pins the whole role-by-action matrix.
- **Firm access**: every action that touches a firm calls `requireFirm(firmId)` (or
  `findAccessibleFirm`) with the firm of the record, never trusting the screen.
- **"All firms" is view only**: every firm write calls `writeBlock()` (rule
  `writeBlockMessage` in `firm-selection.ts`, tested). Shared masters (users, retailers,
  vehicles) are not firm data and stay editable.
- **Finer rules on top**: assigned rep fills the rate (`canFillRate`), cancel rules
  (`canCancelOrder`), own shop only for retailers (`orderListScope`, `canViewLedger`),
  own wallet only (`walletBalance` per collector, `canConfirmHandover`).

## What was checked

| Area | Pages | Actions | Result |
| --- | --- | --- | --- |
| Orders | `/orders`, `/orders/new`, `/orders/[id]`, `/approvals` | placeOrder, fillRate, decideOrder, cancelOrder | fixed (see below) |
| Dispatch | `/dispatch` | dispatchOrder, markDelivered, createGodown | ids validated; locks were already right |
| Stock | `/stock`, `/stock/purchase`, `/opening`, `/adjust`, `/locations` | recordPurchase, recordOpening, recordAdjustment, addLocation, setLocationActive | fixed |
| Receipts | `/receipts`, `/receipts/new`, `/receipts/review` | loadOutstanding, saveReceipt, verifyOnline, setChequeStatus | fixed |
| Wallet | `/wallet` | requestHandover, answerHandover | write block + ids |
| Ledger | `/ledger`, `/ledger/[retailerId]` | setOpeningBalance | fixed |
| Masters | `/retailers`, `/vehicles`, `/users` | saveRetailer, setRetailerActive, linkRetailerUser, saveVehicle, setVehicleActive, createUser, updateUserAccess, setUserActive | fixed |
| Other | `/dashboard`, `/account`, `/more`, `/notifications`, `/admin`, `/design`, `/`, auth pages | updateName, signOut, openNotification, markAllRead, selectFirm | OK |

Also checked: money is integer paise everywhere (client only divides by 100 for display;
the server re-checks every amount with `Number.isSafeInteger`); every order status change
goes through `order-rules` and writes `order_events` in the same transaction; dispatch,
receipts, approvals, handovers and stock writes use row locks or a status-guarded update;
no `"use client"` file imports `@/env`, `@/db`, `@/lib/auth` or `@/lib/email`.

## Defects fixed

1. Retailers page was open to every signed-in user, so a retailer could read every shop's phone number. Now staff only.
2. Vehicles and stock pages were open to retailers and to people with no role. Now staff only; bottom nav shows "Dues" instead of "Retailers" for a retailer.
3. `decideOrder` accepted any decision string: an admin request with `"cancelled"` skipped the cancel flow (no reason). Now only approve or reject.
4. Any sales person could cancel any unapproved order of the firm. Now only the placer or the assigned rep (plus admin); accounts after approval.
5. Admin's read-only "All firms" view could still write (approve, rate, cancel, receipts, verify, handover, opening balance, places). All firm writes are now blocked there.
6. Spec says any user can record a collection, but logistics could not. Receipts and wallet now open to all staff (never retailers).
7. Opening balance could be posted twice by two quick clicks (no lock). The retailer row is locked now.
8. Switching a stock place off could race with a dispatch or purchase into it. It now takes the same row lock.
9. Changing a user's roles and firms was two separate writes; it is one transaction now. Firm ids are checked to exist.
10. Stock entries had no upper limit (a typo could overflow the database integer). Capped at 100,000 bags per entry (`MAX_STOCK_ENTRY_BAGS`).
11. Ids from the URL or browser were not checked, so a bad link gave a 500 database error. `isUuid` now returns "not found" (orders, ledger, receipts, wallet, stock, masters, notifications).
12. New-order screen with no products or no retailers showed an unusable form; receipt screen with no retailers likewise. Empty states added.

## Left as is (needs the owner, or out of scope)

- Public sign-up is on (template default). A self-signed-up user has no role and now sees nothing useful, but consider turning sign-up off since admin creates users.
- `src/app/design/page.tsx` and `src/instrumentation.ts` read `process.env.NODE_ENV` / `NEXT_RUNTIME`.
  These are build-time values Next.js inlines; reading them via `@/env` would break the build-time guard. Kept.
- Sales people see every order of their firm (spec only says "my orders" on the home screen).
- Round robin assigns a **sales rep**; the spec's logistics round robin is not built (dispatch is open to all logistics of the firm).
- Cancelling an order that already has receipt allocations does not move that money to advance; receipts lock the retailer, cancel locks the order. Worth a rule in a later task.
- A retailer can see ledger amounts (dues need them) and free-text reasons written by staff in the order history.
