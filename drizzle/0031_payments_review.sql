ALTER TABLE "receipts" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "checked_by" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "reject_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_checked_by_user_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_utr_unique_idx" ON "receipts" USING btree ("utr") WHERE "receipts"."mode" = 'online' and "receipts"."status" <> 'rejected';--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_utr_online_only" CHECK (("receipts"."mode" = 'online') = ("receipts"."utr" is not null and "receipts"."utr" <> ''));