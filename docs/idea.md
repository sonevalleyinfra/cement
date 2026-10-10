# Cement Wholesale App — Spec (v1.0, simplified)

Internal tool for **one** Prism Cement wholesaler. It runs inventory, orders, dispatch, payments and the Prism
account, and keeps a log of who did what. **No firms** (one business, one stock, one set of books).
Out of scope: GST, e-way bills, invoices, cheques.

## 1. Roles

| Role | Does |
|---|---|
| Retailer | Places orders (bags only, never sees a price). Sees own orders and own dues. |
| Sales | Places orders for own shops and fills the rate. Records cash and online payments. |
| Accounts | Approves / rejects orders (with reason), seeing the retailer's dues. Verifies online payments against the bank statement. Confirms cash handed over by staff. |
| Logistics | Dispatches approved orders from a godown or a truck. Can change the rate (reason required). Records payments. |
| Admin | Everything: users, retailers (and each shop's sales person), products, godowns, purchases, Prism account, stock corrections, cancel orders, change rate, reports, activity log. |

Any staff member (not retailer) can record a payment. A user may hold more than one role.

## 2. Products and places

- Products are Prism only, picked from drop-downs: Trade / Non-trade → Type (OPC / PPC) → Grade (33 / 43 / 53),
  bag size 50 kg. Name is built from these. Switched off, never deleted. Counted in bags (20 bags = 1 tonne).
- Places: **godowns** (admin list) and **trucks**. Trucks are hired: truck number + driver + phone are typed on each
  purchase / dispatch / move; a truck is listed while it holds bags. Bags on a truck are stock.

## 3. Order flow

```
Placed → Approved / Rejected → Partly dispatched → Dispatched        (Cancelled by admin)
```

1. **Placed** by a retailer or sales. Each shop has one sales person (admin sets it); the order goes to them.
   Sales placing the order types the rate; a retailer order waits for its sales person to fill the rate.
2. **Approve / reject**: accounts, only when the rate is filled. Screen shows order total and the retailer's current dues.
   Reject needs a reason.
3. **Dispatch**: any logistics person (or admin), from a godown or truck that holds enough bags. Truck no., driver,
   phone, bags. Several dispatches per order allowed until all bags are out. Each dispatch posts bags × rate to the
   retailer's dues.
4. **Rate change**: logistics or admin, reason required, logged. Applies to bags not yet dispatched.
5. **Cancel**: admin, reason required. Only the bags not yet dispatched are cancelled.

No round robin, no separate "rate filled" / "assigned" / "delivered" steps.

## 4. Stock

Stock changes only through movements (never edited): opening, purchase, dispatch, move (godown ↔ truck), correction
(admin, reason: damage / burst / shortage / count). Stock = sum of movements per product per place.

## 5. Retailer dues

One ledger per retailer, append-only (mistakes fixed by a new reversing entry):
opening balance (+/−), dispatch (+), payment (−), reversal, adjustment (admin, reason).
Dues = sum. Payments clear oldest dues first (for aging).

## 6. Payments (from retailers)

- **Cash**: any staff member records amount + retailer. Dues go down **immediately**. The cash is now **held by that
  staff member**. They hand it over; **accounts taps "Received"** (can confirm part, or reject a wrong request).
  App always shows cash held per staff member.
- **Online** (into the business bank account): staff records amount + UTR / reference. Status *unverified*;
  dues do **not** change yet. **Accounts checks the bank statement and taps "Verified"** → dues go down.
  Accounts can reject one that never arrived (with reason).
- A verified / recorded payment can be **reversed** by accounts or admin with a reason (dues go back up; cash leaves
  the holder's balance if not yet handed over).

## 7. Prism account (supplier)

Append-only ledger of what the business owes Prism:
opening balance, **purchase** (+ bags × cost per bag, also adds stock), **payment to Prism** (−, mode + reference),
**scheme / discount credit** (−, reason). Admin only. Balance = amount owed to Prism.

## 8. Notifications (in-app)

Order placed → its sales person (if rate missing) and accounts. Approved / rejected → placer, sales person.
Approved → logistics. Dispatched → retailer, sales person. Rate changed → accounts, sales person, admin.
Online payment recorded → accounts. Cash handover request → accounts. Handover confirmed / payment verified → the staff member.

## 9. Reports (admin), date range filter

- Sales: bags and ₹ by product, retailer, sales person, day.
- Retailer dues with aging (0–30, 31–60, 61–90, 90+ days) and a retailer statement.
- Stock: by product and by place (godowns + trucks).
- Cash held by each staff member; online payments waiting for verification.
- Prism account statement.
- Profit: sales value − cost (average purchase cost per bag, per product), per bag and total.
- Staff activity: orders placed, approvals, dispatches, payments recorded per person.
- **Activity log**: every action (who, what, when, details), filter by person / type / date.

## 10. Home screens

- Admin: today's sales, orders waiting approval / dispatch, stock, cash held by staff, online to verify, Prism balance.
- Sales: my orders (rate to fill), my shops' dues, my cash held.
- Accounts: approvals, online to verify, cash handovers to confirm.
- Logistics: approved orders to dispatch, truck stock, my cash held.
- Retailer: new order, my orders, my dues.

## 11. UI

Phone first (see `docs/DESIGN.md`). Numbers first, minimal text, one action per screen, confirm only destructive actions.
