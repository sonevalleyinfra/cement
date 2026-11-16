ALTER TABLE "credit_overrides" DROP CONSTRAINT "credit_overrides_order_id_unique";--> statement-breakpoint
CREATE INDEX "credit_overrides_order_idx" ON "credit_overrides" USING btree ("order_id");