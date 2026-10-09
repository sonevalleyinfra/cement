CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"retailer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"order_id" uuid,
	"receipt_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_retailer_firm_idx" ON "ledger_entries" USING btree ("retailer_id","firm_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_opening_idx" ON "ledger_entries" USING btree ("retailer_id","firm_id") WHERE "ledger_entries"."kind" = 'opening';