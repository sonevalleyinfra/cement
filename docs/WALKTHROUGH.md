# Phase 1 walkthrough (phone width, local dev app, demo data)

Checked in the browser pane at a 375px phone width, using `pnpm seed:demo` accounts.

## What passed
- Sales: place order (firm A), fill rate (total shown), send for approval.
- Accounts: approvals list shows total and dues; approve bills the ledger (checked in the database and the ledger screen).
- Logistics: over-dispatch refused ("Only 16 bags are left"); partial dispatch 20 then 16; driver auto-fills from the vehicle; stock fell 500 -> 464.
- Receipt: Rs 15,000 cash auto-split Firm A 12,600 + Firm B 2,400; ledger Firm A 0, Firm B 4,600 as expected.
- Cancel a partly dispatched order (40 bags out): stock rose back 410 -> 450, ledger got a compensating entry.
- Firm switcher changes the order list; header chip follows.
- Retailer: sees only own orders, no price on the list or the detail page (HTML checked), dues shown on home.
- Home screens for sales, accounts, logistics, retailer and admin show numbers that match the data.

## Fixed during the walkthrough
1. Sign-in (and other) forms submitted before the page was ready put the email and password in the address bar. Forms now use POST.
2. Cancelled orders showed a red "Rejected" chip and partly dispatched showed "Dispatched". Chips now say Cancelled / Partly dispatched (test added).
3. Order history could list "assigned" after "partly dispatched" (same timestamp inside one save). Steps are now spaced 1 ms (test added).
4. Logistics home "Ready" ignored approved orders that the dispatch list shows. Fixed.
5. Retailer with no firm saw "No orders" with no reason. Now says no firm is assigned. The demo retailer is given all firms.

## What remains / notes
- A retailer must be given firms by admin, or they cannot see orders or place one.
- Approval leaves status "approved"; it becomes "assigned" only at first dispatch (works, but the "assigned" step is not automatic as the rule notes say).
- "Pending" covers both "placed" and "rate filled" on lists.
- Retailer picker sheet: last row can sit under the bottom bar on very short screens.
- Not walked: online/cheque receipts, wallet handover, stock purchase/adjust, user admin screens, notifications content.
- For the split receipt, a second-firm approved order for Sharma was inserted by SQL (no quick screen path); the receipt itself went through the app.
