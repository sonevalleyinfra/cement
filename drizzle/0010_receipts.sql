CREATE TABLE "receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"order_id" uuid,
	"amount_paise" integer NOT NULL,
	"advance" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "receipts_receipt_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"retailer_id" uuid NOT NULL,
	"received_firm_id" uuid,
	"mode" text NOT NULL,
	"total_paise" integer NOT NULL,
	"utr" text,
	"cheque_number" text,
	"cheque_date" text,
	"bank_name" text,
	"status" text NOT NULL,
	"received_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_firm_id_firms_id_fk" FOREIGN KEY ("received_firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_allocations_receipt_idx" ON "receipt_allocations" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_allocations_order_idx" ON "receipt_allocations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "receipts_retailer_idx" ON "receipts" USING btree ("retailer_id","created_at");--> statement-breakpoint
CREATE INDEX "receipts_created_idx" ON "receipts" USING btree ("created_at");