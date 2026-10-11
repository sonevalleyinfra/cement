CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"result_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "receipts_utr_unique_idx";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "sales_rep_id" text;--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "from_rate_paise" integer;--> statement-breakpoint
ALTER TABLE "order_events" ADD COLUMN "to_rate_paise" integer;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_created_idx" ON "form_submissions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_sales_rep_id_user_id_fk" FOREIGN KEY ("sales_rep_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_utr_unique_idx" ON "receipts" USING btree ("utr") WHERE "receipts"."mode" = 'online' and "receipts"."status" not in ('rejected', 'reversed');--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_type_valid" CHECK ("stock_movements"."type" in ('opening', 'purchase', 'dispatch', 'adjustment', 'transfer'));