-- Credit check at order approval (cement v2 B1, soft block).
--
-- What: credit_overrides, one row per order approved over the credit check (over the limit, overdue,
-- or the shop on hold / blocked) with the reason and the numbers the server saw. A new empty table:
-- nothing to backfill. Append-only: the triggers at the end use cement_books_append_only() from 0037.

CREATE TABLE "credit_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"retailer_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"order_paise" bigint NOT NULL,
	"after_paise" bigint NOT NULL,
	"limit_paise" bigint,
	"over_limit_paise" bigint DEFAULT 0 NOT NULL,
	"oldest_overdue_days" integer DEFAULT 0 NOT NULL,
	"credit_days" integer NOT NULL,
	"credit_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_overrides_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "credit_overrides_reason_code_valid" CHECK ("credit_overrides"."reason_code" in ('payment_promised', 'old_customer', 'owner_said', 'cash_on_delivery', 'other')),
	CONSTRAINT "credit_overrides_over_limit_valid" CHECK ("credit_overrides"."over_limit_paise" >= 0),
	CONSTRAINT "credit_overrides_credit_status_valid" CHECK ("credit_overrides"."credit_status" in ('ok', 'hold', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_overrides" ADD CONSTRAINT "credit_overrides_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_overrides_created_idx" ON "credit_overrides" USING btree ("created_at");--> statement-breakpoint
CREATE TRIGGER "credit_overrides_append_only" BEFORE UPDATE OR DELETE ON "credit_overrides" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "credit_overrides_no_truncate" BEFORE TRUNCATE ON "credit_overrides" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
