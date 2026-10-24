-- Reversals: reverse a dispatch, take back returned bags, reverse a purchase (cement v2 B2, owner decision D3:
-- admin only, any time, reason code required).
--
-- What: the books stay append-only (0037); a reversal is a set of NEW rows, never an edit.
-- - dispatches: reverses_dispatch_id, reason_code, reason_note. A reversal row has bags < 0, points at the
--   load it reverses and carries a reversal reason; its from_godown_id / from_vehicle_id is the place the
--   bags went BACK INTO. dispatches_bags_positive becomes dispatches_bags_not_zero + dispatches_reversal_shape.
--   dispatches_driver_phone_valid skips reversal rows (they copy the original's phone) and stays NOT VALID.
-- - stock_movements: types `return` (+ bags of a reversed load back into a place; order_id and dispatch_id
--   = the reversal dispatch row) and `purchase_reversal` (- bags; reverses_movement_id = the purchase,
--   unit_cost_paise = the purchase's). New columns dispatch_id, reverses_movement_id; reason codes may now
--   also be reversal codes; one return per reversal dispatch row.
-- - ledger_entries: kind `dispatch_reversal` (amount < 0, order_id, dispatch_id = the reversal dispatch row),
--   one per reversal row.
-- - supplier_ledger_entries: kind `purchase_reversal` (amount < 0, stock_movement_id = the purchase_reversal
--   movement), one per movement. Bags x the INVOICE cost per bag (what the purchase entry used); a header's
--   short / burst claim is untouched.
-- - order_events: reason codes may also be reversal codes (a reversal's history row carries its reason; a
--   cancelled order stays cancelled and its history row needs a code).
-- - Guard triggers (defence in depth; lib/reversals.ts checks the same first): a reversal dispatch row
--   locks its original load (FOR UPDATE, so two reversals of one load run one after the other) and is
--   refused unless the original is a load (bags > 0) of the same order and rate and the total reversed
--   stays <= its bags. A purchase_reversal movement locks the purchase movement and is refused unless it
--   is a purchase of the same product, place and cost per bag and the total reversed stays <= its received
--   bags (purchases.received_bags, or the movement's bags when it has no header).
-- Why: wrong dispatches and purchases, and bags a shop sends back, must be fixable without editing the books.
-- Old rows: every new check holds for them (no links, positive loads, old kinds), so the checks are VALID,
-- except dispatches_driver_phone_valid (NOT VALID as in 0040: old dispatches without a phone are skipped).
-- Rollback notes: the previous app version never writes the new kinds; it reads reversal rows as plain
-- rows (negative bags). To roll back the schema, first make sure no reversal rows exist.

ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_bags_positive";--> statement-breakpoint
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_driver_phone_valid";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_type_valid";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_code_valid";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_kind_valid";--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" DROP CONSTRAINT "supplier_ledger_entries_kind_valid";--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" DROP CONSTRAINT "supplier_ledger_entries_sign_valid";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "reverses_dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "reason_code" text;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "reason_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reverses_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_reverses_dispatch_id_dispatches_id_fk" FOREIGN KEY ("reverses_dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_movement_id_stock_movements_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatches_reverses_idx" ON "dispatches" USING btree ("reverses_dispatch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_reverses_idx" ON "stock_movements" USING btree ("reverses_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_one_return_idx" ON "stock_movements" USING btree ("dispatch_id") WHERE "stock_movements"."type" = 'return';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_dispatch_reversal_idx" ON "ledger_entries" USING btree ("dispatch_id") WHERE "ledger_entries"."kind" = 'dispatch_reversal';--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_ledger_entries_one_purchase_reversal_idx" ON "supplier_ledger_entries" USING btree ("stock_movement_id") WHERE "supplier_ledger_entries"."kind" = 'purchase_reversal';--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_bags_not_zero" CHECK ("dispatches"."bags" <> 0);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_reversal_shape" CHECK (("dispatches"."bags" > 0 and "dispatches"."reverses_dispatch_id" is null and "dispatches"."reason_code" is null) or ("dispatches"."bags" < 0 and "dispatches"."reverses_dispatch_id" is not null and "dispatches"."reason_code" is not null and "dispatches"."reason_code" in ('entry_mistake', 'returned', 'wrong_shop', 'short_received', 'other')));--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driver_phone_valid" CHECK ("dispatches"."bags" < 0 or "dispatches"."driver_phone" ~ '^[6-9][0-9]{9}$') NOT VALID;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversal_shape" CHECK (case "stock_movements"."type"
        when 'return' then "stock_movements"."bags" > 0 and "stock_movements"."order_id" is not null and "stock_movements"."dispatch_id" is not null and "stock_movements"."reverses_movement_id" is null and "stock_movements"."reason_code" is not null and "stock_movements"."reason_code" in ('entry_mistake', 'returned', 'wrong_shop', 'short_received', 'other')
        when 'purchase_reversal' then "stock_movements"."bags" < 0 and "stock_movements"."reverses_movement_id" is not null and "stock_movements"."dispatch_id" is null and "stock_movements"."unit_cost_paise" is not null and "stock_movements"."reason_code" is not null and "stock_movements"."reason_code" in ('entry_mistake', 'returned', 'wrong_shop', 'short_received', 'other')
        else "stock_movements"."dispatch_id" is null and "stock_movements"."reverses_movement_id" is null end);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_type_valid" CHECK ("stock_movements"."type" in ('opening', 'purchase', 'dispatch', 'adjustment', 'transfer', 'return', 'purchase_reversal'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_valid" CHECK ("stock_movements"."reason_code" is null or "stock_movements"."reason_code" in ('transit_short', 'transit_burst', 'damage', 'entry_mistake', 'expired', 'other', 'returned', 'wrong_shop', 'short_received'));--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dispatch_reversal_shape" CHECK (("ledger_entries"."kind" = 'dispatch_reversal') = ("ledger_entries"."dispatch_id" is not null) and ("ledger_entries"."kind" <> 'dispatch_reversal' or ("ledger_entries"."amount_paise" < 0 and "ledger_entries"."order_id" is not null)));--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_kind_valid" CHECK ("ledger_entries"."kind" in ('opening', 'order_debit', 'receipt_credit', 'adjustment', 'receipt_reversal', 'dispatch_reversal'));--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_reversal_link" CHECK ("supplier_ledger_entries"."kind" <> 'purchase_reversal' or "supplier_ledger_entries"."stock_movement_id" is not null);--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_kind_valid" CHECK ("supplier_ledger_entries"."kind" in ('opening', 'purchase', 'payment', 'credit', 'adjustment', 'purchase_reversal'));--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_sign_valid" CHECK (("supplier_ledger_entries"."kind" <> 'purchase' or "supplier_ledger_entries"."amount_paise" > 0) and ("supplier_ledger_entries"."kind" not in ('payment', 'credit', 'purchase_reversal') or "supplier_ledger_entries"."amount_paise" < 0));--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_reason_code_valid";--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_reason_code_valid" CHECK ("order_events"."reason_code" is null or "order_events"."reason_code" in ('rate_dispute', 'no_stock', 'duplicate', 'over_credit', 'shop_asked', 'other', 'entry_mistake', 'truck_issue', 'price_revision', 'owner_said', 'payment_promised', 'old_customer', 'cash_on_delivery', 'returned', 'wrong_shop', 'short_received'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cement_dispatch_reversal_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  orig record;
  reversed bigint;
BEGIN
  SELECT d.id, d.order_id, d.bags, d.rate_paise INTO orig
    FROM dispatches d WHERE d.id = NEW.reverses_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch reversal refused: the load it reverses does not exist' USING ERRCODE = 'check_violation';
  END IF;
  IF orig.bags <= 0 THEN
    RAISE EXCEPTION 'Dispatch reversal refused: a reversal cannot be reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF orig.order_id <> NEW.order_id OR orig.rate_paise <> NEW.rate_paise THEN
    RAISE EXCEPTION 'Dispatch reversal refused: it must have the order and rate of the load' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(sum(-d.bags), 0) INTO reversed FROM dispatches d WHERE d.reverses_dispatch_id = orig.id;
  IF reversed - NEW.bags > orig.bags THEN
    RAISE EXCEPTION 'Dispatch reversal refused: % bags reversed would be more than the % bags of the load', reversed - NEW.bags, orig.bags
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "dispatches_reversal_guard" BEFORE INSERT ON "dispatches" FOR EACH ROW WHEN (NEW.bags < 0) EXECUTE FUNCTION cement_dispatch_reversal_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cement_purchase_reversal_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  orig record;
  received bigint;
  reversed bigint;
BEGIN
  SELECT m.id, m.type, m.product_id, m.godown_id, m.vehicle_id, m.unit_cost_paise, m.bags INTO orig
    FROM stock_movements m WHERE m.id = NEW.reverses_movement_id FOR UPDATE;
  IF NOT FOUND OR orig.type <> 'purchase' THEN
    RAISE EXCEPTION 'Purchase reversal refused: the movement it reverses is not a purchase' USING ERRCODE = 'check_violation';
  END IF;
  IF orig.product_id <> NEW.product_id
    OR orig.godown_id IS DISTINCT FROM NEW.godown_id
    OR orig.vehicle_id IS DISTINCT FROM NEW.vehicle_id
    OR orig.unit_cost_paise IS DISTINCT FROM NEW.unit_cost_paise THEN
    RAISE EXCEPTION 'Purchase reversal refused: it must have the product, place and cost per bag of the purchase' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce((SELECT h.received_bags FROM purchases h WHERE h.stock_movement_id = orig.id), orig.bags) INTO received;
  SELECT coalesce(sum(-m.bags), 0) INTO reversed
    FROM stock_movements m WHERE m.reverses_movement_id = orig.id AND m.type = 'purchase_reversal';
  IF reversed - NEW.bags > received THEN
    RAISE EXCEPTION 'Purchase reversal refused: % bags reversed would be more than the % bags received', reversed - NEW.bags, received
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "stock_movements_purchase_reversal_guard" BEFORE INSERT ON "stock_movements" FOR EACH ROW WHEN (NEW.type = 'purchase_reversal') EXECUTE FUNCTION cement_purchase_reversal_guard();
