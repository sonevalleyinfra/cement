# Phase 1 walkthrough (phone width, local dev app, demo data)

> Historical record, written before firms were removed (spec v1.0: one business, no firms).
> Anything below about firms, firm access or split receipts no longer applies.

Checked in the browser pane at a 375px phone width, using `pnpm seed:demo` accounts.

## What passed
- Sales: place order (firm A), fill rate (total shown), send for approval.
- Accounts: approvals list shows total and dues; approve bills the ledger (checked in the database and the ledger screen).
- Logistics: over-dispatch refused ("Only 16 bags are left"); partial dispatch 20 then 16; truck number fills in when taking bags from a truck; stock fell 500 -> 464.
- Receipt: Rs 15,000 cash auto-split Firm A 12,600 + Firm B 2,400; ledger Firm A 0, Firm B 4,600 as expected.
- Cancel a partly dispatched order (40 bags out): stock rose back 410 -> 450, ledger got a compensating entry.
- Firm switcher changes the order list; the firm name in the header follows.
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
- For the split receipt, a second-firm approved order for Sharma was inserted by SQL (no quick screen path); the receipt itself went through the app (redone through the screens in the second walkthrough below).

# Second walkthrough (phone width, local dev app, demo data)

Same setup. Accounts, logistics, sales, retailer and admin demo accounts were each signed in on their own.

## What passed
- Online receipt (Rs 5,000, Singh) saved as "unverified"; accounts Verify with a wrong UTR is refused ("does not match"), the right UTR marks it verified.
- Cheque Rs 3,000 (Gupta) pending -> Cleared; cheque Rs 2,000 pending -> Bounced. Ledger credits the retailer at once; the bounce puts Rs 2,000 back (Gupta Firm A 28,000 -> 25,000, as expected). Home counts (online to verify, cheques pending) matched.
- Cash receipt by logistics (Rs 4,000, Yadav) went into the logistics wallet; handing over Rs 5,000 is refused ("more cash than your wallet holds"); Rs 4,000 request showed as waiting; accounts "Confirm received" cleared it. Logistics does not see the confirm section.
- User admin: create (Walk Driver, logistics, Firm A+B), edit roles/firms (added accounts, swapped firms), self role removal refused, no Deactivate button on own row, deactivate blocks sign-in (BANNED_USER), the new user sees only the screens for their roles and is turned away from /users. Email mode is log-only: the password-reset link was taken from the dev log and the password was set through it.
- Notifications: bell count, unread dot, opening one marks it read and opens the order, Mark all read clears the count. Retailer notifications carry no price.
- Split receipt through the screens: Sharma order for Firm A placed by sales, rate filled, approved by accounts. Receipt Rs 6,000 auto-split oldest first: Firm B 4,600, then Firm A 1,400. Ledger: B 0, A 2,100.
- "All firms" (admin): new order, new receipt, dispatch, stock purchase/adjust/opening show "pick one firm"; writes are refused by the server ("All firms is view only").

## Fixed during the second walkthrough
1. A partial dispatch notification said the whole order ("36 bags is on its way") for each part. It now names the bags dispatched (test added).
2. In "All firms" the order page still showed Cancel order (and rate form), the wallet showed Hand over / Confirm, and approvals and verify payments showed their buttons. They are now hidden or replaced by "Pick one firm" (the server already refused the writes).

## Notes
- Cancelling or rejecting needs the browser confirm box; the browser pane cannot show it (confirm was auto-accepted in the test script).
- Admin is not told about approvals of retailer orders beyond the spec list; the retailer gets no "approved" notification (spec: dispatched and delivered only).
- Retailers list still shows Edit/Turn off in "All firms"; they are not tied to one firm.
- Not walked: stock purchase/adjust saving, delivered notification, email sending (log only).
