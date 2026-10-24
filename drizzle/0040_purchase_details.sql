-- Purchase details: invoice, truck, billed vs received, landed cost; driver phone on dispatches (cement v2 A5 + A6).
--
-- What: a new table purchases, one header row per purchase movement (stock_movement_id, unique):
-- supplier invoice no + date, truck number, driver name + phone, billed / short / burst / received
-- bags, freight and unloading paid (paise), landed cost per good bag, the linked transit_short /
-- transit_burst adjustment movements, and a claim status (none | open | claimed | credited).
-- purchases is append-only like the other books: UPDATE may change only claim_status,
-- claim_updated_at and claim_updated_by, and the claim only moves forward (open -> claimed -> credited;
-- cement_purchases_claim_only below); DELETE and TRUNCATE use
-- cement_books_append_only() from 0037. Both honour SET LOCAL cement.books_repair = 'on'.
-- dispatches gets dispatches_driver_phone_valid (a 10-digit Indian mobile).
-- Why: the owner needs the invoice and truck on every purchase, short / burst bags counted and
-- claimed, and profit on the landed cost (freight + unloading), not the bare invoice cost.
-- A driver must be reachable, so the phone is now required on purchase and dispatch.
-- Old rows: purchases saved before this have NO header row ("not recorded"); readers fall back to
-- the movement (landed = unit cost, received = movement bags). Nothing is backfilled or invented.
-- dispatches_driver_phone_valid is NOT VALID: old dispatches without a phone ('') are skipped,
-- new rows must pass.
-- Rollback notes: to roll back the app only, the previous version writes purchases with no header
-- (readers handle that) and may save dispatches without a phone, which the new check refuses:
--   ALTER TABLE dispatches DROP CONSTRAINT dispatches_driver_phone_valid;
-- The purchases table can stay.

CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_movement_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"truck_number" text NOT NULL,
	"driver_name" text NOT NULL,
	"driver_phone" text NOT NULL,
	"billed_bags" integer NOT NULL,
	"short_bags" integer DEFAULT 0 NOT NULL,
	"burst_bags" integer DEFAULT 0 NOT NULL,
	"received_bags" integer NOT NULL,
	"freight_paise" integer DEFAULT 0 NOT NULL,
	"unloading_paise" integer DEFAULT 0 NOT NULL,
	"landed_unit_cost_paise" integer NOT NULL,
	"short_movement_id" uuid,
	"burst_movement_id" uuid,
	"claim_status" text NOT NULL,
	"claim_updated_at" timestamp with time zone,
	"claim_updated_by" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_stock_movement_id_unique" UNIQUE("stock_movement_id"),
	CONSTRAINT "purchases_invoice_no_valid" CHECK (char_length("purchases"."invoice_no") between 1 and 60 and "purchases"."invoice_no" = btrim("purchases"."invoice_no")),
	CONSTRAINT "purchases_driver_phone_valid" CHECK ("purchases"."driver_phone" ~ '^[6-9][0-9]{9}$'),
	CONSTRAINT "purchases_billed_positive" CHECK ("purchases"."billed_bags" > 0),
	CONSTRAINT "purchases_short_not_negative" CHECK ("purchases"."short_bags" >= 0),
	CONSTRAINT "purchases_burst_not_negative" CHECK ("purchases"."burst_bags" >= 0),
	CONSTRAINT "purchases_received_valid" CHECK ("purchases"."received_bags" = "purchases"."billed_bags" - "purchases"."short_bags" - "purchases"."burst_bags" and "purchases"."received_bags" > 0),
	CONSTRAINT "purchases_freight_not_negative" CHECK ("purchases"."freight_paise" >= 0),
	CONSTRAINT "purchases_unloading_not_negative" CHECK ("purchases"."unloading_paise" >= 0),
	CONSTRAINT "purchases_landed_positive" CHECK ("purchases"."landed_unit_cost_paise" > 0),
	CONSTRAINT "purchases_short_movement" CHECK (("purchases"."short_movement_id" is null) = ("purchases"."short_bags" = 0)),
	CONSTRAINT "purchases_burst_movement" CHECK (("purchases"."burst_movement_id" is null) = ("purchases"."burst_bags" = 0)),
	CONSTRAINT "purchases_claim_status_valid" CHECK ("purchases"."claim_status" in ('none', 'open', 'claimed', 'credited')),
	CONSTRAINT "purchases_claim_matches_bags" CHECK (("purchases"."short_bags" + "purchases"."burst_bags" = 0) = ("purchases"."claim_status" = 'none'))
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_short_movement_id_stock_movements_id_fk" FOREIGN KEY ("short_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_burst_movement_id_stock_movements_id_fk" FOREIGN KEY ("burst_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_claim_updated_by_user_id_fk" FOREIGN KEY ("claim_updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_claim_idx" ON "purchases" USING btree ("claim_status") WHERE "purchases"."claim_status" in ('open', 'claimed');--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driver_phone_valid" CHECK ("dispatches"."driver_phone" ~ '^[6-9][0-9]{9}$') NOT VALID;--> statement-breakpoint
CREATE OR REPLACE FUNCTION cement_purchases_claim_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('cement.books_repair', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'claim_status' - 'claim_updated_at' - 'claim_updated_by')
     IS DISTINCT FROM (to_jsonb(OLD) - 'claim_status' - 'claim_updated_at' - 'claim_updated_by') THEN
    RAISE EXCEPTION '% on % may only change the claim: the books are append-only (fix mistakes with a new entry)', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation',
            HINT = 'A reviewed repair migration may run SET LOCAL cement.books_repair = ''on'' first.';
  END IF;
  -- A claim only moves forward: open -> claimed -> credited (open may go straight to credited).
  IF NEW.claim_status IS DISTINCT FROM OLD.claim_status
     AND (OLD.claim_status, NEW.claim_status) NOT IN (('open', 'claimed'), ('open', 'credited'), ('claimed', 'credited')) THEN
    RAISE EXCEPTION 'claim on % cannot go from % to %', TG_TABLE_NAME, OLD.claim_status, NEW.claim_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "purchases_claim_only" BEFORE UPDATE ON "purchases" FOR EACH ROW EXECUTE FUNCTION cement_purchases_claim_only();
--> statement-breakpoint
CREATE TRIGGER "purchases_append_only" BEFORE DELETE ON "purchases" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "purchases_no_truncate" BEFORE TRUNCATE ON "purchases" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
