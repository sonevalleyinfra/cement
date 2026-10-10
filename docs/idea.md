# Cement Wholesale App — Spec (v1.0, simplified)

Internal tool for **one** cement wholesaler (Prism brand today, more brands possible later). It runs inventory, orders, dispatch, payments and the supplier
account, and keeps a log of who did what. **No firms** (one business, one stock, one set of books).
Out of scope: GST, e-way bills, invoices, cheques.

## 1. Roles

| Role | Does |
|---|---|
| Retailer | Places orders (bags only). Sees own orders, own dues total and own payments; never sees rates or per-dispatch amounts. |
| Sales | Places orders for any shop (to cover for colleagues) and sees every shop's dues. Fills the rate on own shops' retailer orders. Records cash and online payments. |
| Accounts | Approves / rejects orders (with reason), seeing the retailer's dues. Verifies online payments against the bank statement. Confirms cash handed over by staff. |
| Logistics | Dispatches approved orders from a godown or a truck. Can change the rate (reason required). Records payments. |
| Admin | Everything: users, retailers (only admin adds, edits and turns them off; each shop's sales person is required), products, godowns, purchases, supplier accounts, stock corrections, cancel orders, change rate, reports, activity log. |

Any staff member (not retailer) can record a payment. A user may hold more than one role.

## 2. Products and places

- Products are picked from drop-downs: **Brand** (Prism today; admin can add more brands later) → Trade / Non-trade →
  Type (OPC / PPC) → Grade (33 / 43 / 53), bag size 50 kg. Name is built from these (e.g. "Prism Trade OPC 43").
  Switched off, never deleted. Counted in bags (20 bags = 1 tonne).
- Places: **godowns** (admin list) and **trucks**. Trucks are hired: truck number + driver + phone are typed on each
  purchase / dispatch / move (a move can load bags onto a new hired truck); a truck is listed while it holds bags.
  Bags on a truck are stock. Stock forms pick only existing products (new products are added in the catalogue).

## 3. Order flow

```
Placed → Approved / Rejected → Partly dispatched → Dispatched        (Cancelled by admin)
```

1. **Placed** by a retailer or sales. Each shop has one sales person (admin sets it when adding the shop); the order
   goes to them. An older shop with no sales person: admins are told about its new orders.
   Sales placing the order types the rate; a retailer order waits for its sales person to fill the rate.
   Sales only ever fill an **empty** rate (their own new order, or a retailer's order for their shop).
2. **Approve / reject**: accounts, only when the rate is filled. Screen shows order total and the retailer's current dues.
   Reject needs a reason. If the rate changed after the screen was opened, the decision is refused ("check again").
3. **Dispatch**: any logistics person (or admin), from a godown or truck that holds enough bags. Truck no., driver,
   phone, bags. Several dispatches per order allowed until all bags are out. Each dispatch posts bags × rate to the
   retailer's dues.
4. **Rate change**: once a rate is set, only logistics or admin can change it, at any step before the order is fully
   dispatched (placed, approved or partly dispatched). Reason required; logged as a rate change (staff see ₹old → ₹new
   and the reason in the history and the notification); accounts, the shop's sales person and admin are told.
   Applies to bags not yet dispatched.
5. **Cancel**: admin, reason required. Only the bags not yet dispatched are cancelled.

No round robin, no separate "rate filled" / "assigned" / "delivered" steps.

## 4. Stock

Stock changes only through movements (never edited): opening, purchase, dispatch, move (godown ↔ truck), correction
(admin, reason picked from damage / burst / shortage / count, plus an optional note). Stock = sum of movements per
product per place.

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
  Accounts can reject one that never arrived (with reason). A UTR is used once; a rejected or reversed payment frees it.
- A verified / recorded payment can be **reversed** by accounts or admin with a reason: dues go back up and the payment
  is marked reversed. For cash they answer where the money is: **"Cash is still with <name>"** (it leaves that
  person's cash held; they must hold at least that amount, else it is refused) or **"Cash already handed to office"**
  (nobody's cash held changes).
- Every save form sends a one-time id, so a double tap never records the same payment, order or dispatch twice.
  A refused save (for example "Only 50 bags are left") keeps nothing, so fixing the form and saving again works.
- A staff member holding cash cannot be deactivated, deleted or lose all staff roles until it is handed over.

## 7. Supplier accounts (one per brand)

Each brand is bought from its own company, so each brand has its own supplier account ("Prism account",
later e.g. "UltraTech account"). A purchase of a product posts to the account of that product's brand.
Append-only ledger per brand of what the business owes that supplier:
opening balance, **purchase** (+ bags × cost per bag, also adds stock), **payment to the supplier** (−, mode + reference),
**scheme / discount credit** (−, reason). Admin only. Balance = amount owed to that supplier.

## 8. Notifications (in-app)

Order placed → its sales person (if rate missing) and accounts (admins too when the shop has no sales person). Approved / rejected → placer, sales person.
Approved → logistics. Dispatched → retailer, sales person. Rate changed → accounts, sales person, admin.
Cash payment recorded → admin. Online payment recorded → accounts. Cash handover request → accounts. Handover confirmed / payment verified → the staff member.

## 9. Reports (admin), date range filter

- Sales: bags and ₹ by product, retailer, sales person (the one at the time of each dispatch), day.
- Retailer dues with aging (0–30, 31–60, 61–90, 90+ days) and a retailer statement.
- Stock: by product and by place (godowns + trucks); for dates: start + opening stock + bought − sent ± moved ± fixed = end.
- Cash held by each staff member; online payments waiting for verification.
- Supplier account statement (per brand).
- Profit: sales value − cost (average purchase cost per bag, per product), per bag and total.
- Staff activity: orders placed, approvals, dispatches, payments recorded per person.
- **Activity log**: every action (who, what, when, details), filter by person / type / date.

## 10. Home screens

- Admin: today's sales, orders waiting approval / dispatch, stock, cash held by staff, online to verify, supplier balances (per brand), shops without a sales person.
- Sales: my orders (rate to fill), my shops' dues, my cash held.
- Accounts: approvals, online to verify, cash handovers to confirm.
- Logistics: approved orders to dispatch, truck stock (bags per loaded truck, by product), my cash held.
- Retailer: new order, my orders, my dues (total only), my last payment that still stands.

## 11. UI

Phone first (see `docs/DESIGN.md`). Numbers first, minimal text, one action per screen, confirm only destructive actions.
Money is shown exactly (paise are never rounded away); statements, ledgers and reports always show paise.
