CREATE TABLE "wallet_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"collector_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"receipt_id" uuid,
	"ref_id" uuid,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_collector_id_user_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_movements_collector_idx" ON "wallet_movements" USING btree ("collector_id","firm_id","created_at");--> statement-breakpoint
UPDATE "receipts" SET "status" = 'unverified' WHERE "mode" = 'online' AND "status" = 'received';
--> statement-breakpoint
INSERT INTO "wallet_movements" ("firm_id", "collector_id", "kind", "amount_paise", "receipt_id", "actor_id")
SELECT a."firm_id", r."received_by", 'collected', sum(a."amount_paise"), r."id", r."received_by"
FROM "receipt_allocations" a JOIN "receipts" r ON r."id" = a."receipt_id"
WHERE r."mode" = 'cash' GROUP BY a."firm_id", r."received_by", r."id";
