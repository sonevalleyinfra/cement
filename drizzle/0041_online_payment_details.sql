-- Online payment details, the firm's bank accounts, payer name and received_on (cement v2 A7).
--
-- What: a new table bank_accounts (the firm's accounts that online payments come into; admin list at
-- /bank-accounts; name unique ignoring case, optional last 4 digits and UPI ID, switched on / off).
-- receipts gets online_method (upi | neft | rtgs | imps), bank_account_id (-> bank_accounts, no
-- cascade: a used account cannot be deleted, only switched off), payer_name ('' = not given),
-- received_on (the India day the money came), backdate_reason_code and backdate_note.
-- Cash rows never carry a method or account (receipts_online_details_cash_none). received_on is never
-- after the India day of created_at (receipts_received_on_not_future), and more than 2 days before it
-- only with a backdate reason (receipts_backdate_reason_required). New online rows must have a method
-- and an account: a BEFORE INSERT trigger (receipts_online_details_required), not a CHECK, because old
-- online rows have neither and are still UPDATEd at verify / reject / reverse.
-- Why: accounts match online payments with the bank statement by method and account, and the ledger,
-- aging, statements and "last payment" must count a payment on the day it was received, not the day
-- it was typed in.
-- Old rows: received_on = the India day of created_at (backfilled below; receipts has no UPDATE
-- trigger, 0037 only blocks DELETE / TRUNCATE, and the UPDATE touches only this column).
-- online_method / bank_account_id stay NULL ("not recorded"); nothing is invented. Every new check
-- holds for the backfilled rows, so they are plain (validated) checks.
-- Rollback notes: to roll back the app only, the previous version inserts online rows without a
-- method or account, which the trigger refuses:
--   DROP TRIGGER receipts_online_details_required ON receipts;
-- Everything else is compatible: every new column is nullable or has a default (received_on defaults
-- to today in India, which passes both date checks). The bank_accounts table can stay.

CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"last4" text,
	"upi_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_name_valid" CHECK (char_length("bank_accounts"."name") between 1 and 60 and "bank_accounts"."name" = btrim("bank_accounts"."name")),
	CONSTRAINT "bank_accounts_last4_valid" CHECK ("bank_accounts"."last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "bank_accounts_upi_id_valid" CHECK (char_length("bank_accounts"."upi_id") <= 60 and "bank_accounts"."upi_id" = btrim("bank_accounts"."upi_id") and "bank_accounts"."upi_id" ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "online_method" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "payer_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "received_on" date;--> statement-breakpoint
UPDATE "receipts" SET "received_on" = ("created_at" at time zone 'Asia/Kolkata')::date;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "received_on" SET DEFAULT ((now() at time zone 'Asia/Kolkata')::date);--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "received_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "backdate_reason_code" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "backdate_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_name_lower_unique" ON "bank_accounts" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_received_on_idx" ON "receipts" USING btree ("received_on");--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_online_method_valid" CHECK ("receipts"."online_method" is null or "receipts"."online_method" in ('upi', 'neft', 'rtgs', 'imps'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_online_details_cash_none" CHECK ("receipts"."mode" = 'online' or ("receipts"."online_method" is null and "receipts"."bank_account_id" is null));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payer_name_valid" CHECK (char_length("receipts"."payer_name") <= 80 and "receipts"."payer_name" = btrim("receipts"."payer_name"));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_backdate_reason_code_valid" CHECK ("receipts"."backdate_reason_code" is null or "receipts"."backdate_reason_code" in ('late_entry', 'bank_delay', 'entry_mistake', 'owner_said', 'other'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_on_not_future" CHECK ("receipts"."received_on" <= ("receipts"."created_at" at time zone 'Asia/Kolkata')::date);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_backdate_reason_required" CHECK ("receipts"."backdate_reason_code" is not null or "receipts"."received_on" >= ("receipts"."created_at" at time zone 'Asia/Kolkata')::date - 2);--> statement-breakpoint
CREATE OR REPLACE FUNCTION cement_receipts_online_details() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.mode = 'online' AND (NEW.online_method IS NULL OR NEW.bank_account_id IS NULL) THEN
    RAISE EXCEPTION 'a new online payment needs its method (UPI / NEFT / RTGS / IMPS) and the bank account it came into'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'receipts_online_details_required';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "receipts_online_details_required" BEFORE INSERT ON "receipts" FOR EACH ROW EXECUTE FUNCTION cement_receipts_online_details();
