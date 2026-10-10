CREATE TABLE "prism_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"entry_date" date DEFAULT (timezone('Asia/Kolkata', now()))::date NOT NULL,
	"stock_movement_id" uuid,
	"mode" text,
	"reference" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prism_ledger_entries_kind_valid" CHECK ("prism_ledger_entries"."kind" in ('opening', 'purchase', 'payment', 'credit', 'adjustment')),
	CONSTRAINT "prism_ledger_entries_amount_not_zero" CHECK ("prism_ledger_entries"."amount_paise" <> 0),
	CONSTRAINT "prism_ledger_entries_sign_valid" CHECK (("prism_ledger_entries"."kind" <> 'purchase' or "prism_ledger_entries"."amount_paise" > 0) and ("prism_ledger_entries"."kind" not in ('payment', 'credit') or "prism_ledger_entries"."amount_paise" < 0)),
	CONSTRAINT "prism_ledger_entries_mode_valid" CHECK (("prism_ledger_entries"."kind" = 'payment') = ("prism_ledger_entries"."mode" is not null) and ("prism_ledger_entries"."mode" is null or "prism_ledger_entries"."mode" in ('bank', 'cash', 'other')))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "unit_cost_paise" integer;--> statement-breakpoint
ALTER TABLE "prism_ledger_entries" ADD CONSTRAINT "prism_ledger_entries_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_ledger_entries" ADD CONSTRAINT "prism_ledger_entries_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prism_ledger_entries_date_idx" ON "prism_ledger_entries" USING btree ("entry_date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prism_ledger_entries_one_opening_idx" ON "prism_ledger_entries" USING btree ("kind") WHERE "prism_ledger_entries"."kind" = 'opening';--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_cost_positive" CHECK ("stock_movements"."unit_cost_paise" is null or "stock_movements"."unit_cost_paise" > 0);