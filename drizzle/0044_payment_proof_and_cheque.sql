ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "proof_image" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "cheque_date" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "cheque_bank" text;--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_online_method_valid";--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_online_method_valid" CHECK ("receipts"."online_method" is null or "receipts"."online_method" in ('upi', 'neft', 'rtgs', 'imps', 'cheque'));
