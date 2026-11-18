# Sone Valley Infra — System Knowledge & Master Architecture

> **CRITICAL DIRECTIVE FOR ANY AI OR DEVELOPER:**  
> Read this document completely BEFORE making changes to this codebase.  
> **RULE #1: Never break existing business logic, accounting rules, or test suites when introducing new features.**  
> Always run `npm run typecheck` and `npm test -- --run` before committing.

---

## 1. Domain & Business Model
- **Business**: Single-firm regional wholesale cement distribution enterprise ("Sone Valley Infra") in India.
- **Unit of Inventory**: 50 kg bags (20 bags = 1 metric tonne). Counted as positive/negative integers.
- **Unit of Currency**: **Integer Paise** (`₹1 = 100 paise`). Money is NEVER stored as floats or rounded away in storage. Rendered as Indian Rupees (`₹`, `en-IN`, e.g., `₹1,56,200.00`).
- **Core Ledger Rule**: **Append-only**. Ledger entries and stock movements are NEVER edited or deleted. Corrections are always made via explicit reversing entries (`return`, `adjustment`, `purchase_reversal`, `payment_reversal`).

---

## 2. Roles & Permissions (Zero-Trust Model)
Defined in `src/lib/permissions.ts`:

| Role | Responsibilities & Boundaries |
|---|---|
| **Admin** | Full system control. Only Admin can configure credit terms, catalogue masters, users, godowns, supplier accounts, and execute reversals/cancellations. |
| **Accounts** | Order credit approval/rejection with credit checks/overrides; bank verification of online payments (UPI/NEFT); confirmation of physical cash handovers from staff; **Full access to all `/reports` and CSV exports** (unlocked alongside Admin). |
| **Sales** | Order placement for any shop; fills empty rates on orders; collects field payments (cash/UPI); views shop ledger dues and aging. |
| **Logistics** | Dispatches approved orders from godowns or trucks; records factory purchases; manages stock transfers; can change rates at dispatch with mandatory reason code; records field payments. |
| **Retailer (Shop)** | Places bag-only orders; views own order dispatches and total dues balance. **NEVER sees rates, margins, landed costs, or supplier books.** |

---

## 3. Non-Negotiable Invariants & Golden Rules

### A. Truck Lifecycle & The 0-Bag Rule
1. **Multi-Product Purchase**: A single truckload can purchase and carry **up to 2 distinct cement products** (e.g., 300 Bags Prism PPC + 200 Bags Champion Plus).
2. **Purchase Lockout**: A hired truck (`vehicles`) holding bags (`bags > 0`) is **LOCKED** and cannot be used for a new factory purchase until it is completely discharged (`bags === 0`).
3. **Operational Visibility**: Only loaded trucks holding bags (`bags > 0` and `active = true`) appear in active operational lists and dropdowns. Once empty (`0 bags`), the truck disappears from active lists but is preserved in historical reports, ledgers, and audit logs.
4. **Multi-Source Dispatch**: An order can be dispatched from warehouse godowns OR diverted directly from active trucks. Godowns are always available as dispatch sources.

### B. Credit Approval Formula (Exposure Gate)
In `src/lib/credit-check.ts` and `src/lib/order-approval.ts`:
$$\text{Exposure} = \text{Current Ledger Dues} + \text{Approved Unsent Bags Total} + \text{This Order Total}$$
- If `Exposure > Credit Limit` or dues exceed credit days (e.g., 30 days default) or shop is On Hold/Blocked: Accounts must provide an override reason code. Overrides are recorded and audited.

### C. Cash Handover & Staff Wallets
- When a staff member collects cash from a customer:
  1. Customer ledger dues decrease immediately.
  2. The exact amount is credited to the collector's liability wallet (`cash_held`).
  3. When staff deposits cash at the office, Accounts clicks **Confirm Handover**, debiting staff wallet and crediting office cash.
  4. Staff holding cash cannot be deactivated or deleted.

### D. Reversals & Return Rules
- A dispatch reversal takes bags back into inventory, adds a linked credit entry to customer dues, and recalculates the order status.
- Reversals require a mandatory reason code (`damage`, `transit_burst`, `shortage`, etc.).

---

## 4. Chronological Implementation History

1. **Multi-Product Purchase on Trucks**:
   - Extended `PurchaseItemInput` in `src/app/(app)/stock/actions.ts` allowing 2 items per purchase.
   - Enforced `bagsAtPlace(tx, vehicleId) === 0` to prevent double-loading trucks.
2. **Godown Source Always Available**:
   - Updated `src/app/(app)/dispatch/page.tsx` and `dispatch-view.tsx` so all active godowns remain selectable even when a truck filter is applied.
3. **Order Bag Quick Increment/Decrement**:
   - Added positive and negative quick adjustment steppers in `src/app/(app)/orders/[id]/page.tsx`.
4. **Dashboard Dues Styling & Cards**:
   - Changed dues badge colors from harsh red to warm amber/neutral foreground.
   - Restricted dashboard lists to latest 3 items with clean "View all" links.
5. **Accountant Reports Access**:
   - Updated `ACTION_ROLES.viewReports` to `["admin", "accounts"]`.
   - Updated `/reports/books/page.tsx` and CSV export routes to allow `accounts`.
6. **Live Visual Fleet Radar & Truck Cards**:
   - Added live fleet radar banner to `/trucks`.
   - Added 2D animated-style vector truck graphic (`SimpleTruckGraphic`) showing physical loaded bags and dual-product stacks.
   - Added direct 1-tap buttons: `[Unload to Godown]`, `[Dispatch / Divert]`, and `[Call Driver]`.
7. **Bottom Navigation Trucks Tab & Amazon-Style Live Journey**:
   - Added `Trucks` tab in bottom navigation for staff (`admin`, `logistics`, `accounts`).
   - Created `/trucks/[id]` live tracking detail stepper (Plant Purchase -> Highway Transit -> Drop-offs -> 0-Bag Settlement).

---

## 5. Verification Checklist for Developers & AIs
Before completing any task, run and pass:
1. `npm run typecheck` (zero TypeScript errors).
2. `npm test -- --run` (all Vitest suites must pass).
3. Confirm that no existing routes, permissions, or calculations have been altered without explicit user requirement.
