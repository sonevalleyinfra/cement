-- Each dispatch keeps the sales person it was sold under (the sales report groups by it).
-- Old dispatches take the order's sales person as it is now.
UPDATE "dispatches" AS d
SET "sales_rep_id" = o."sales_rep_id"
FROM "orders" AS o
WHERE o."id" = d."order_id" AND d."sales_rep_id" IS NULL;
--> statement-breakpoint
-- Rate rows in an order's history get the rate before and after, read from the activity log row
-- written in the same transaction (same order, same moment).
UPDATE "order_events" AS e
SET
  "from_rate_paise" = (a."details" -> 'ratePaise' ->> 'before')::integer,
  "to_rate_paise" = (a."details" -> 'ratePaise' ->> 'after')::integer
FROM "audit_log" AS a
WHERE a."entity" = 'order'
  AND a."action" IN ('fill_rate', 'change_rate')
  AND a."entity_id" = e."order_id"::text
  AND a."created_at" = e."created_at"
  AND (e."reason" = 'Rate filled' OR e."reason" LIKE 'Rate edited:%')
  AND e."to_rate_paise" IS NULL;
