ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_location_id_stock_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_location_id_stock_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP CONSTRAINT "ledger_entries_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_received_firm_id_firms_id_fk";
--> statement-breakpoint
ALTER TABLE "wallet_movements" DROP CONSTRAINT "wallet_movements_firm_id_firms_id_fk";
--> statement-breakpoint
DROP INDEX "dispatches_firm_idx";--> statement-breakpoint
DROP INDEX "orders_firm_created_idx";--> statement-breakpoint
DROP INDEX "ledger_entries_retailer_firm_idx";--> statement-breakpoint
DROP INDEX "stock_movements_balance_idx";--> statement-breakpoint
DROP INDEX "ledger_entries_one_opening_idx";--> statement-breakpoint
DROP INDEX "wallet_movements_collector_idx";--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_retailer_idx" ON "ledger_entries" USING btree ("retailer_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_balance_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_opening_idx" ON "ledger_entries" USING btree ("retailer_id") WHERE "ledger_entries"."kind" = 'opening';--> statement-breakpoint
CREATE INDEX "wallet_movements_collector_idx" ON "wallet_movements" USING btree ("collector_id","created_at");--> statement-breakpoint
ALTER TABLE "dispatches" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "dispatches" DROP COLUMN "location_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP COLUMN "location_id";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "received_firm_id";--> statement-breakpoint
ALTER TABLE "wallet_movements" DROP COLUMN "firm_id";--> statement-breakpoint
ALTER TABLE "firms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_firms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_locations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_allocations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "firms" CASCADE;--> statement-breakpoint
DROP TABLE "user_firms" CASCADE;--> statement-breakpoint
DROP TABLE "stock_locations" CASCADE;--> statement-breakpoint
DROP TABLE "receipt_allocations" CASCADE;