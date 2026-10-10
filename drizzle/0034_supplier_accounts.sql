-- Supplier accounts, one per brand (spec v1.0 section 7). The Prism account becomes one supplier
-- account among possibly many: the table is renamed and every row gets the brand it belongs to.
-- Old rows were all owed to Prism; a purchase takes the brand of the product it bought.
--
-- 1. Rename the table and everything named after it (no data changes here).
ALTER TABLE "prism_ledger_entries" RENAME TO "supplier_ledger_entries";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_pkey" TO "supplier_ledger_entries_pkey";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_kind_valid" TO "supplier_ledger_entries_kind_valid";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_amount_not_zero" TO "supplier_ledger_entries_amount_not_zero";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_sign_valid" TO "supplier_ledger_entries_sign_valid";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_mode_valid" TO "supplier_ledger_entries_mode_valid";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_stock_movement_id_stock_movements_id_fk" TO "supplier_ledger_entries_stock_movement_id_stock_movements_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" RENAME CONSTRAINT "prism_ledger_entries_actor_id_user_id_fk" TO "supplier_ledger_entries_actor_id_user_id_fk";
--> statement-breakpoint
ALTER INDEX "prism_ledger_entries_date_idx" RENAME TO "supplier_ledger_entries_date_idx";
--> statement-breakpoint
-- The old rule was "one opening balance in total"; the new one is "one per brand" (step 4).
DROP INDEX "prism_ledger_entries_one_opening_idx";
--> statement-breakpoint
-- 2. Every row gets a brand.
ALTER TABLE "supplier_ledger_entries" ADD COLUMN "brand_id" uuid;
--> statement-breakpoint
-- A purchase belongs to the brand of the product it bought.
UPDATE "supplier_ledger_entries" e
SET "brand_id" = p."brand_id"
FROM "stock_movements" m
JOIN "products" p ON p."id" = m."product_id"
WHERE e."stock_movement_id" = m."id";
--> statement-breakpoint
-- Everything else was owed to Prism. If the brands list is somehow empty, Prism is added back first.
INSERT INTO "brands" ("name")
SELECT 'Prism'
WHERE NOT EXISTS (SELECT 1 FROM "brands")
  AND EXISTS (SELECT 1 FROM "supplier_ledger_entries" WHERE "brand_id" IS NULL);
--> statement-breakpoint
UPDATE "supplier_ledger_entries"
SET "brand_id" = (
  SELECT b."id" FROM "brands" b
  ORDER BY (lower(trim(b."name")) = 'prism') DESC, b."created_at", b."id"
  LIMIT 1
)
WHERE "brand_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- 3. One brand's account page and statement.
CREATE INDEX "supplier_ledger_entries_brand_date_idx" ON "supplier_ledger_entries" USING btree ("brand_id","entry_date","created_at");
--> statement-breakpoint
-- 4. One opening balance per brand.
CREATE UNIQUE INDEX "supplier_ledger_entries_one_opening_idx" ON "supplier_ledger_entries" USING btree ("brand_id") WHERE "supplier_ledger_entries"."kind" = 'opening';
