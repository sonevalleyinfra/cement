# Cement Wholesale App — Spec (v0.6)

Internal tool for a Prism Cement wholesaler with **3 separate businesses (firms)** sharing **1 physical godown**.

---

## 1. Core Principle: Firm = Separate Concern

Each firm runs as its own independent book.

- **Every transaction belongs to exactly one firm:** orders, dispatches, purchases, stock movements, collections, wallet entries, ledger entries.
- **Separate stock per firm.** The godown is one physical place, but the system tracks Firm A, Firm B and Firm C bags separately. Same for vehicles.
- **Separate ledgers per firm:** retailer dues, Prism purchase ledger, collector wallets.
- **Retailers are shared.** One retailer master; a retailer can order from any firm and has a **separate balance with each firm**.
- **Reports:** firm-wise by default, plus a **consolidated** view for admin.
- **Out of scope:** GST, e-way bills, invoices (handled manually). A **challan number** field links an order to paperwork.

### How it works in the app
- **Firm switcher** in the header. Everything on screen (stock, orders, dues, wallet) is for the selected firm.
- Admin also gets an **"All firms"** option, read-only, for consolidated dashboards and reports.
- Users can be given access to one, two or all three firms.

---

## 2. Basics

- **Products:** Prism OPC, Prism PPC, Prism Non-trade (unit: bags)
- **Stock locations:** Godown + each vehicle, tracked per firm

---

## 3. Roles

| Role | Can do |
|---|---|
| Admin | Add firms, retailers, users, firm access. Pick / change each retailer's sales person. Catalogue (brands, types, grades, products) and godowns. Purchase entry. Verify online payments. Confirm cash handover. Stock adjustments. Firm-wise and consolidated reports. |
| Sales | Place orders (choose firm), fill rate, track orders, collect payments |
| Retailer | Place orders with any firm (quantity only, no price), track dispatch, view dues per firm |
| Accounts | Approve / reject orders with reason, seeing the retailer's dues **with that firm** (and total across firms for context) |
| Logistics | Dispatch assigned orders from that firm's stock, edit rate (reason required) |
| Collections | Any user can record a collection |

---

## 4. Order Flow

```
Placed (firm selected) → Rate filled → Approved / Rejected → Assigned → Dispatched → Delivered
```

1. **Placed** by sales rep or retailer. **Firm is chosen at order time.** Retailer sees no price.
   Every retailer is tied to **one sales person** (admin can change it). The order goes to that sales person, no round robin.
2. **Rate filled** by the retailer's sales person. Required before approval.
3. **Accounts** sees order total, retailer's dues with this firm, and total dues across firms. Approves or rejects with reason.
4. **Notify** placer, sales rep and admin on approve / reject.
5. **Assigned** to a logistics member by round robin (skips inactive members).
6. **Dispatched** only from **the same firm's stock** (godown or vehicle). Enter vehicle no., driver name, driver phone, bags. Visible to retailer and sales rep.
7. **Rate edit** by logistics allowed. Reason required, logged.
8. **Partial dispatch** allowed (split across vehicles).
9. **Cancel** after approval reverses that firm's stock.

---

## 5. Inventory (per firm)

**Catalogue (admin, More → Catalogue).** Every product is picked from drop-downs, never typed:
Brand (Prism) → Trade / Non-trade → Type (OPC / PPC) → Grade (33 / 43 / 53) → Bag size (50 kg).
The product name is built from these (e.g. "Prism Non-trade PPC 43"). Admin can add brands, types and grades;
products are switched off, never edited or deleted, because stock and orders point at them. A product with bags
in stock cannot be switched off. Stock is counted in bags; screens also show tonnes (20 bags = 1 MT).

**Places (admin, More → Godowns; Vehicles).** Godowns and vehicles are one shared list for all firms. Each firm's
bags at a place are kept separately (the firm's stock row there is made automatically). A godown or vehicle cannot
be switched off while any firm has bags there.

**Stock screen:** By product (Trade / Non-trade sections, each product with its places) or By place (each godown
or vehicle with its products), filtered by Trade / Non-trade and type.

- **Purchase (admin):** select firm → add stock to godown or directly to a vehicle. Posts to that firm's stock and that firm's Prism ledger.
- **Vehicle = location.** A truck can carry bags of more than one firm; the system keeps each firm's count on that vehicle separately.
- **Leftover bags** stay on the vehicle (still owned by the same firm) or move to the godown.
- **No mixing:** Firm A's order can't be dispatched from Firm B's bags.
- **No inter-firm stock transfer.** Bags never move between firms.
- **Adjustments** (damage, burst, shortage, physical count): admin only, per firm, with reason.
- Every movement is recorded; stock is never edited directly.

---

## 6. Collections & Wallets (per firm)

- **Modes:** Cash, Online, Cheque (Pending / Cleared / Bounced)
- Collection reduces the retailer's dues **with the firm it is allocated to**. Within a firm, applies to oldest dues first.

### 6.1 Receipt with split allocation

A retailer may pay one lump sum covering more than one firm (e.g. full dues of Firm A + part of Firm B). This is recorded as **one receipt split across firms**.

**Entry screen**
1. Pick retailer → screen shows dues per firm.
2. Enter total amount received and mode.
3. **Allocation rows**, one per firm with dues:
   - Quick buttons: *Clear full* per firm, *Auto-split* (oldest dues first across firms).
   - Amounts editable.
4. **Remaining** counter must hit ₹0 before save.
5. Any excess is kept as **advance** with a firm the collector picks.

Example: Retailer pays ₹1,00,000. Dues: Firm A ₹60,000, Firm B ₹70,000.
→ Firm A ₹60,000 (cleared) + Firm B ₹40,000 (₹30,000 still due).

**What gets posted**
- One receipt record (receipt no., retailer, total, mode, collector, date).
- One **allocation line per firm**. Each line posts to that firm's retailer ledger and that firm's collector wallet.
- Retailer sees one receipt with the firm-wise split.
- Reversing a receipt reverses all its allocation lines together.

### 6.2 Cash
- Cash wallet is per firm, filled by the allocation lines.
- **Handover:** collector hands over one bundle of cash. Admin confirms the total; the app clears each firm's wallet by its share. Partial handover: admin chooses which firm(s) to clear.

### 6.3 Online (paid into one firm's account)
- Collector records **which firm's bank account received the money**, plus UTR / reference.
- Admin verifies against that firm's bank statement → all allocation lines clear.
- If money landed in Firm A's account but part is allocated to Firm B's dues, the app posts an **inter-firm balance**: Firm A owes Firm B that amount.
- Admin settles inter-firm balances when funds are moved between firm accounts (manual record).

### 6.4 Cheque
- Same split as online. On bounce, every allocation line reverses and dues return to each firm.

---

## 7. Ledgers (per firm)

- **Retailer ledger:** one per retailer per firm. Orders (debit), payments (credit), running balance.
- **Prism purchase ledger:** one per firm. Purchases, payments to Prism, scheme / discount credits.
- **Collector ledger:** per collector per firm. Cash held, online pending.
- **Inter-firm balance:** arises only from split online / cheque receipts landing in one firm's account. Shows who owes whom; cleared by a manual settlement entry.
- **Rules:** no edits on posted entries, only reversals. Every change logged with user and time.
- **Opening balances** per firm: retailer dues, stock, Prism payable.

---

## 8. Notifications (in-app push)

Every notification shows the firm name.

| Event | Notify |
|---|---|
| Order placed | Accounts, sales rep |
| Approved / rejected | Placer, sales rep, admin |
| Assigned | Logistics member |
| Dispatched | Retailer, sales rep |
| Rate edited | Accounts, admin, sales rep |
| Payment recorded | Admin |
| Handover / online verified | Collector |

---

## 9. Reports

Each report has a **firm filter: Firm A / Firm B / Firm C / All firms.**

- Sales by firm, product, retailer, sales rep, date range
- Retailer dues with aging (0–30, 31–60, 61–90, 90+), per firm and combined
- Retailer statement per firm (view / download)
- Employee performance: orders, dispatches, collections, cash held
- Stock: godown + each vehicle, per firm and combined
- Prism ledger per firm
- Monthly closing report (see 9.1)

### 9.1 Monthly Closing Report

Generated by admin for a month, per firm and for all firms. Once generated, it is **saved as a snapshot**, so past months stay fixed and months can be compared without recalculating.

**Generate flow**
1. Admin picks month → *Generate closing*.
2. App runs pre-close checks and lists what is open:
   - Approved orders not yet dispatched
   - Cash not handed over, online payments not verified
   - Cheques still pending
   - Vehicles with leftover bags
3. Admin can fix these or generate anyway (open items are listed in the report).
4. Report saved with date and admin name. Download as PDF / Excel.

**A. Stock (bags, per product)**

| | OPC | PPC | Non-trade |
|---|---|---|---|
| Opening | | | |
| + Purchased | | | |
| − Dispatched | | | |
| ± Adjustments (damage, shortage) | | | |
| **Closing** | | | |
| Closing in godown / on vehicles | | | |

Closing must equal opening + purchase − dispatch ± adjustments. Any mismatch is flagged.

**B. Sales**
- Bags and ₹ value by product
- Average selling rate per bag, by product
- Top 10 retailers by bags and value
- New retailers this month, retailers who stopped ordering (ordered last month, not this month)
- Orders: placed, approved, rejected (with top reasons), cancelled
- Rate edits at dispatch: count and ₹ impact

**C. Collections**
- Collected by mode: cash, online, cheque
- Collection efficiency: collected ÷ (opening dues + sales)
- Bounced cheques
- Cash still with collectors at month end
- Online payments still unverified

**D. Receivables**
- Opening dues + sales − collections = closing dues (must tally)
- Aging at month end: 0–30, 31–60, 61–90, 90+
- Top 10 dues
- Retailers over credit limit
- Advances held

**E. Prism (supplier)**
- Opening payable + purchases − payments − scheme credits = closing payable
- Average purchase rate per bag, by product

**F. Margin**
- Gross margin = sales value − cost of bags sold (average purchase rate)
- Margin per bag, by product
- Scheme credits shown separately

**G. Team performance**

| Member | Orders placed | Bags sold | Dispatches | Collected | Cash pending |
|---|---|---|---|---|---|

**H. Cash & inter-firm**
- Cash collected vs handed over
- Inter-firm balances at month end (who owes whom)

**I. Month-on-month**
- Every key number shown against last month and the same month last year, with % change: bags sold, sales value, collections, closing dues, margin per bag, 90+ dues.
- Trend charts over the last 12 months: bags sold, sales value, closing dues, collection efficiency.

**Late entries**
- No period lock, so entries can still be back-dated into a closed month.
- If that happens, the month is marked **"Changed after closing"** with the list of entries. Admin can regenerate; earlier versions are kept.

---

## 10. Home Screens

- **Admin:** firm switcher with "All firms". Today's sales, pending approvals, stock, pending handovers, top dues.
- **Sales:** my orders, my retailers' dues (per firm), my wallet (per firm)
- **Accounts:** approval queue (firm shown on each card)
- **Logistics:** assigned orders, vehicle stock (per firm)
- **Retailer:** new order (pick firm), my orders, my dues per firm

---

## 11. UI / UX

- **Mobile first.** Single column, thumb-reachable bottom nav, large tap targets (48px+).
- **Firm always visible.** Firm name / colour chip in the header and on every card, so nobody posts to the wrong firm.
- **Clean and quiet.** Neutral palette, one accent colour per firm, status colours only where they mean something.
- **No filler text.** Labels, numbers and actions only.
- **Numbers first.** Bags and ₹ amounts large and bold; secondary info small and muted.
- **Fast entry.** Searchable retailer picker, numeric keypad, sensible defaults (last used firm, vehicle, today's date).
- **One action per screen.** Primary button pinned at the bottom.
- **Lists as cards:** firm chip, retailer, bags, amount, status.
- **Confirm only destructive actions** (reject, cancel, handover).
- **Works on slow networks.** Light pages, minimal assets.

---

## 12. Data Design Note

- `firm_id` on every transactional table (orders, dispatches, stock movements, wallet entries, ledger entries).
- **Receipts:** `receipts` (no firm, the money event) → `receipt_allocations` (firm_id, amount). Sum of allocations = receipt total.
- `inter_firm_balances` from allocations whose firm differs from the receiving bank account's firm.
- Shared masters: retailers, users, products, vehicles.
- Firm-level access table: which users can work on which firms.
- All queries scoped by selected firm; consolidated reports aggregate across firms.
- **Monthly closings:** `monthly_closings` (firm_id or null for all, month, version, generated_by, generated_at, status) + saved JSON snapshot of every figure. Next month's opening reads from the last closing. Back-dated entries set status to "changed after closing".

---

## 13. Build Plan

**Phase 1 — MVP**
- Masters: firms, products, retailers, users, firm access
- Firm switcher
- Order → rate → approval → round robin → dispatch (per firm)
- Godown + vehicle stock per firm
- Collections with split receipts, wallets per firm
- Retailer ledger per firm

**Phase 2**
- Prism purchase ledger per firm
- Firm-wise + consolidated reports and aging
- Monthly closing report with snapshots and month-on-month comparison
- Inter-firm balance settlement, stock adjustments, audit log view
