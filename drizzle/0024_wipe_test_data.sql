-- Firms are removed (one business, one stock, one set of books).
-- The owner confirmed every order, payment and stock row so far is test data, so it is wiped
-- here before the firm columns go. Users, retailers, the catalogue, godowns and trucks are kept.
TRUNCATE TABLE
  "notifications",
  "order_events",
  "dispatches",
  "stock_movements",
  "stock_locations",
  "receipt_allocations",
  "wallet_movements",
  "receipts",
  "ledger_entries",
  "orders",
  "audit_log",
  "user_firms"
RESTART IDENTITY;
