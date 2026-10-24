-- Order delivery fields, order source, split notes and reason codes (cement v2 A3 + A4).
--
-- What: orders get deliver_to (shop | site; old rows 'shop'), site_address, receiver_name,
-- receiver_phone, required_by, source, staff_note and shop_note. order_events, receipts and
-- stock_movements get reason_code (a picked "why"; the old text columns keep the optional note).
-- ledger_entries gets the kind receipt_reversal (+amount with its receipt_id).
-- Backfill (orders only; orders may be updated, the 0037 triggers only block DELETE / TRUNCATE):
--   an old order note goes to shop_note when a shop's own login placed the order, else to
--   staff_note (staff text never leaks to a shop); source = 'shop_app' for orders a shop placed,
--   other old orders keep source NULL ("not recorded": no invented data).
--   order_events, receipts and stock_movements are not touched (append-only / final rows).
-- Why: staff notes were shown to shops (price leak), and free-text reasons cannot be counted.
-- The "reason_code required" checks are NOT VALID: old rows are skipped, new rows must have one.
-- Old reversals stay receipt_credit rows with a + amount; the app reads both.
-- Rollback notes: orders.notes is kept (the previous app version still reads it; new orders leave
-- it ''). To roll back the app only, nothing here needs undoing: every new column is nullable or
-- has a default, and the previous version never writes a receipt_reversal row. Note that it does
-- not set reason codes either, so its reject / cancel / reversal / stock correction would be
-- refused by the NOT VALID checks: drop the three *_reason_code_required checks if rolling back.
--   ALTER TABLE order_events DROP CONSTRAINT order_events_reason_code_required;
--   ALTER TABLE receipts DROP CONSTRAINT receipts_reason_code_required;
--   ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_reason_code_required;
--   (the previous version would also post reversals as + receipt_credit again; readers handle both.)

ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_kind_valid";--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deliver_to" text DEFAULT 'shop' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "site_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receiver_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "receiver_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "required_by" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "staff_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shop_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "reason_code" text;--> statement-breakpoint
-- Backfill: notes and source on old orders (a shop's own login = every role is 'retailer').
UPDATE "orders" o SET "shop_note" = o."notes", "source" = 'shop_app'
FROM "user" u
WHERE u."id" = o."placed_by"
  AND coalesce(btrim(u."role"), '') <> ''
  AND string_to_array(replace(u."role", ' ', ''), ',') <@ ARRAY['retailer'];--> statement-breakpoint
UPDATE "orders" SET "staff_note" = "notes" WHERE "notes" <> '' AND "source" IS NULL;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_reason_code_valid" CHECK ("order_events"."reason_code" is null or "order_events"."reason_code" in ('rate_dispute', 'no_stock', 'duplicate', 'over_credit', 'shop_asked', 'other', 'entry_mistake', 'truck_issue', 'price_revision', 'owner_said', 'payment_promised', 'old_customer', 'cash_on_delivery'));--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_reason_code_required" CHECK ("order_events"."to_status" not in ('rejected', 'cancelled') or "order_events"."reason_code" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliver_to_valid" CHECK ("orders"."deliver_to" in ('shop', 'site'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_site_address_required" CHECK ("orders"."deliver_to" = 'shop' or ("orders"."site_address" is not null and btrim("orders"."site_address") <> ''));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_receiver_phone_valid" CHECK ("orders"."receiver_phone" is null or "orders"."receiver_phone" ~ '^[6-9][0-9]{9}$');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_valid" CHECK ("orders"."source" is null or "orders"."source" in ('shop_app', 'rep_visit', 'phone', 'whatsapp', 'office'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_valid" CHECK ("stock_movements"."reason_code" is null or "stock_movements"."reason_code" in ('transit_short', 'transit_burst', 'damage', 'entry_mistake', 'expired', 'other'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_required" CHECK ("stock_movements"."type" <> 'adjustment' or "stock_movements"."reason_code" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversal_shape" CHECK ("ledger_entries"."kind" <> 'receipt_reversal' or ("ledger_entries"."amount_paise" > 0 and "ledger_entries"."receipt_id" is not null));--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_kind_valid" CHECK ("ledger_entries"."kind" in ('opening', 'order_debit', 'receipt_credit', 'adjustment', 'receipt_reversal'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reason_code_valid" CHECK ("receipts"."reason_code" is null or "receipts"."reason_code" in ('wrong_shop', 'wrong_amount', 'duplicate', 'not_in_bank', 'bounced', 'other'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reason_code_required" CHECK ("receipts"."status" not in ('rejected', 'reversed') or "receipts"."reason_code" is not null) NOT VALID;