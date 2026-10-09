CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "amount_paise" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ALTER COLUMN "amount_paise" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "receipts" ALTER COLUMN "total_paise" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "wallet_movements" ALTER COLUMN "amount_paise" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "logistics_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "reversed_by" text;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "reversal_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_logistics_id_user_id_fk" FOREIGN KEY ("logistics_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_bags_positive" CHECK ("dispatches"."bags" > 0);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_rate_positive" CHECK ("dispatches"."rate_paise" is null or "dispatches"."rate_paise" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_bags_positive" CHECK ("orders"."bags" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rate_positive" CHECK ("orders"."rate_paise" is null or "orders"."rate_paise" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid" CHECK ("orders"."status" in ('placed', 'rate_filled', 'approved', 'rejected', 'assigned', 'partly_dispatched', 'dispatched', 'delivered', 'cancelled'));--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_kind_valid" CHECK ("stock_locations"."kind" in ('godown', 'vehicle'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_bags_not_zero" CHECK ("stock_movements"."bags" <> 0);--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_kind_valid" CHECK ("ledger_entries"."kind" in ('opening', 'order_debit', 'receipt_credit', 'adjustment'));--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_not_zero" CHECK ("ledger_entries"."amount_paise" <> 0);--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_amount_positive" CHECK ("receipt_allocations"."amount_paise" > 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_total_positive" CHECK ("receipts"."total_paise" > 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_mode_valid" CHECK ("receipts"."mode" in ('cash', 'online', 'cheque'));--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_status_valid" CHECK ("receipts"."status" in ('received', 'unverified', 'verified', 'pending', 'cleared', 'bounced', 'reversed'));--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_amount_not_negative" CHECK ("wallet_movements"."amount_paise" >= 0);--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_kind_valid" CHECK ("wallet_movements"."kind" in ('collected', 'handover_request', 'handover_confirmed', 'handover_rejected', 'reversed'));