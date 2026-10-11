-- Simpler order flow (spec v1.0 section 3). Existing orders are test data; they are moved to the new
-- statuses here, before the next migration changes the allowed list.
--   rate_filled -> placed (the rate stays on the order, so it waits for approval)
--   assigned    -> approved (no round robin any more)
--   delivered   -> dispatched (no "mark delivered" step)
--   dispatched with bags not sent ("closed short") -> cancelled (the rest of the order was cancelled)
UPDATE "orders" SET "status" = 'placed' WHERE "status" = 'rate_filled';
--> statement-breakpoint
UPDATE "orders" SET "status" = 'approved' WHERE "status" = 'assigned';
--> statement-breakpoint
UPDATE "orders" SET "status" = 'dispatched' WHERE "status" = 'delivered';
--> statement-breakpoint
UPDATE "orders" o SET "status" = 'cancelled'
WHERE o."status" = 'dispatched'
  AND o."bags" > (SELECT coalesce(sum(d."bags"), 0) FROM "dispatches" d WHERE d."order_id" = o."id");
--> statement-breakpoint
-- Every dispatch now keeps the rate it was billed at (before, only a changed truck rate was saved).
UPDATE "dispatches" d SET "rate_paise" = o."rate_paise"
FROM "orders" o
WHERE d."order_id" = o."id" AND d."rate_paise" IS NULL;
--> statement-breakpoint
-- Billing moves from approval to dispatch. The ledger is append-only, so each order whose posted
-- amount differs from "bags dispatched x rate of each dispatch" gets one correcting adjustment.
-- (Approved orders with bags not sent yet were billed in full; those bags are billed again when sent.)
INSERT INTO "ledger_entries" ("retailer_id", "kind", "amount_paise", "order_id", "note", "actor_id")
SELECT o."retailer_id", 'adjustment', x.billed - x.posted, o."id", 'Billing moved to dispatch', o."placed_by"
FROM "orders" o
CROSS JOIN LATERAL (
  SELECT
    (SELECT coalesce(sum(d."bags"::bigint * d."rate_paise"), 0) FROM "dispatches" d WHERE d."order_id" = o."id") AS billed,
    (SELECT coalesce(sum(l."amount_paise"), 0) FROM "ledger_entries" l WHERE l."order_id" = o."id") AS posted
) x
WHERE x.billed <> x.posted;
