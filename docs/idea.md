# Cement Wholesale App — Spec (v2.0)

Internal tool for **one** cement wholesaler (Prism brand today, more brands possible later). It runs inventory, orders, dispatch, payments and the supplier
account, and keeps a log of who did what. **No firms** (one business, one stock, one set of books).
Out of scope: GST, e-way bills, invoices, cheques. A shop's GSTIN may be stored for reference; it is never used for tax.

v2 (2026-10-24) adds three things on top of v1: capture the details we can't fill in later, credit control and
corrections that stop money loss, and the metrics the owner runs the business on. Plan and owner decisions D1–D6:
`docs/PLAN-v2.md`. Items marked "Not now" there are out of scope until the AI phase.

## 1. Roles

| Role | Does |
|---|---|
| Retailer | Places orders (bags only). Sees own orders, own dues total and own payments; never sees rates or per-dispatch amounts. |
| Sales | Places orders for any shop (to cover for colleagues) and sees every shop's dues. Fills the rate on own shops' retailer orders. Records cash and online payments. |
| Accounts | Approves / rejects orders (with a reason code), seeing the retailer's dues, credit limit, exposure and oldest overdue. Verifies online payments against the bank statement. Confirms cash handed over by staff. |
| Logistics | Dispatches approved orders from a godown or a truck. Can change the rate (reason required). Records payments. |
| Admin | Everything: users, retailers (only admin adds, edits and turns them off; each shop's sales person is required), shop credit terms, areas, bank accounts, products, godowns, purchases, supplier accounts, stock corrections, reversals, cancel orders, change rate, reports, activity log. |

Any staff member (not retailer) can record a payment. A user may hold more than one role.

## 2. Products and places

- Products are picked from drop-downs: **Brand** (Prism today; admin can add more brands later) → Trade / Non-trade →
  Type (OPC / PPC) → Grade (33 / 43 / 53), bag size 50 kg. Name is built from these (e.g. "Prism Trade OPC 43").
  Switched off, never deleted. Counted in bags (20 bags = 1 tonne).
- Places: **godowns** (admin list) and **trucks**. Trucks are hired: truck number + driver + phone are typed on each
  purchase / dispatch / move (a move can load bags onto a new hired truck); a truck is listed while it holds bags.
  Bags on a truck are stock. Stock forms pick only existing products (new products are added in the catalogue).
  The driver's phone is required wherever a truck is typed, and is tap-to-call.

## 2a. Shops (retailers)

- Shop master: name, phone (unique), place, owner name, alt phone, address, **area** (admin list), pincode, GPS pin,
  category (retailer / sub-dealer / contractor / builder / institution), opened on, GSTIN (optional, stored only).
  Admin edits everything on the shop sheet; staff see it read-only.
- **Credit terms** per shop: credit limit (₹, empty = no limit set), credit days (empty = 30-day default) and status
  (OK / On hold / Blocked). Every change of the terms is kept in a history (who, when, old → new).
- Deactivating a shop that has dues needs a reason, and the shop stays on the overdue list. A sales-person change
  records the dues handed over.

## 3. Order flow

```
Placed → Approved / Rejected → Partly dispatched → Dispatched        (Cancelled by admin)
```

1. **Placed** by a retailer or sales. The order records where it goes (the shop, or a site address with receiver name
   and phone), the required-by date and its source (shop app / rep / phone / WhatsApp / office). Notes are split:
   staff notes are never shown to the shop; the shop note is. Each shop has one sales person (admin sets it when adding the shop); the order
   goes to them. An older shop with no sales person: admins are told about its new orders.
   Sales placing the order types the rate; a retailer order waits for its sales person to fill the rate.
   Sales only ever fill an **empty** rate (their own new order, or a retailer's order for their shop).
2. **Approve / reject**: accounts, only when the rate is filled. Screen shows order total, the retailer's dues, the
   last-rate hint, and the **credit check**: exposure (dues + approved bags not yet sent + this order) against the limit,
   oldest overdue days and the last payment. Over the limit or past credit days = red warning: accounts can approve only
   with an override reason code, admin is told, and overrides are counted in reports (soft block). No limit set =
   amber "No limit set". Reject needs a reason code (plus an optional note). If the rate changed after the screen was opened, the decision is refused ("check again").
3. **Dispatch**: any logistics person (or admin), from a godown or truck that holds enough bags. Truck no., driver,
   phone, bags. Several dispatches per order allowed until all bags are out. Each dispatch posts bags × rate to the
   retailer's dues.
4. **Rate change**: once a rate is set, only logistics or admin can change it, at any step before the order is fully
   dispatched (placed, approved or partly dispatched). Reason required; logged as a rate change (staff see ₹old → ₹new
   and the reason in the history and the notification); accounts, the shop's sales person and admin are told.
   Applies to bags not yet dispatched.
5. **Cancel**: admin, reason code required. Only the bags not yet dispatched are cancelled.
6. **Reverse** a dispatch or take back returned bags: admin only, any time, reason code required. The bags go back to
   stock, the shop's dues are reversed by a new entry, and the order status is worked out again.

Filling a rate and approving show the shop's last rate and warn when the new rate is more than ₹10 away from it.

No round robin, no separate "rate filled" / "assigned" / "delivered" steps.

## 4. Stock

Stock changes only through movements (never edited): opening, purchase, dispatch, move (godown ↔ truck), correction
(admin, reason code picked from damage / burst / shortage / count / transit short / transit burst / entry mistake /
expired, plus an optional note). Stock = sum of movements per product per place.

A purchase records the supplier's invoice no. and date, the truck, driver and phone, and billed vs received bags
(short or burst bags become a linked correction with a claim status). The freight and unloading we pay go into the
landed cost per bag, which is used for profit and stock value; the shop's rate includes delivery, so freight never
appears on shop dues. A purchase can be reversed by admin with a reason code.

## 5. Retailer dues

One ledger per retailer, append-only (mistakes fixed by a new reversing entry):
opening balance (+/−), dispatch (+), payment (−), payment reversal (its own kind), adjustment (admin, reason).
Dues = sum. Payments clear oldest dues first (for aging). A due is **overdue** once it is older than the shop's credit
days (30 when not set).

## 6. Payments (from retailers)

- **Cash**: any staff member records amount + retailer. Dues go down **immediately**. The cash is now **held by that
  staff member**. They hand it over; **accounts taps "Received"** (can confirm part, or reject a wrong request).
  App always shows cash held per staff member.
- **Online** (into one of the business bank accounts, an admin list): staff records amount, method (UPI / NEFT / RTGS /
  IMPS), the account it came into, payer name and UTR / reference. Status *unverified*;
  dues do **not** change yet. **Accounts checks the bank statement and taps "Verified"** → dues go down.
  Accounts can reject one that never arrived (with reason). A UTR is used once; a rejected or reversed payment frees it.
- Every payment has a **received on** date: staff may date it up to 2 days back, admin any date with a reason.
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

Order placed → its sales person (if rate missing) and accounts (admins too when the shop has no sales person, whoever placed it). Approved / rejected → placer, sales person.
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
- Stock by place for the date range, and damage / shortage in ₹.
- Every report: date presets (today … financial year), compare with the previous period, and CSV export
  (UTF-8 with BOM, opens in Excel).
- **Overdue list** (the collection call list) for sales and accounts: per shop overdue ₹, days past due, last payment,
  sales person, tap-to-call, sorted by overdue ₹.

## 10. Home screens

- Admin: today / month-to-date bags and ₹ against last month, margin ₹ per bag, collections by mode; risk: outstanding,
  overdue %, DSO, top 10 overdue shops, cash with staff and its age, pending items and their ages, stock value, every
  supplier balance; orders waiting approval / dispatch, online to verify, shops without a sales person, shops with no
  credit limit set.
- Sales: my orders (rate to fill), collect today, my shops' dues, my collections and bags this month, my cash held.
- Accounts: approvals, online to verify, cash handovers to confirm, with how long each has waited.
- Logistics: approved orders to dispatch with their age, truck stock (bags per loaded truck, by product), godown days
  of cover, my cash held.
- Retailer: new order, my orders, my dues (total only), my last payment that still stands.

## 11. UI

Phone first (see `docs/DESIGN.md`). Orders can be searched and paged past 100. Error, offline and not-found pages;
loading skeletons are static. Numbers first, minimal text, one action per screen, confirm only destructive actions.
Money is shown exactly (paise are never rounded away); statements, ledgers and reports always show paise.
