ALTER TABLE "receipts" DROP CONSTRAINT "receipts_mode_valid";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_status_valid";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "cheque_number";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "cheque_date";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "bank_name";--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_mode_valid" CHECK ("receipts"."mode" in ('cash', 'online'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_status_valid" CHECK ("receipts"."status" in ('received', 'unverified', 'verified', 'rejected', 'reversed'));