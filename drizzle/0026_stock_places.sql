DROP INDEX "stock_movements_balance_idx";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "from_godown_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "from_vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "godown_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_from_godown_id_godowns_id_fk" FOREIGN KEY ("from_godown_id") REFERENCES "public"."godowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_from_vehicle_id_vehicles_id_fk" FOREIGN KEY ("from_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_godown_id_godowns_id_fk" FOREIGN KEY ("godown_id") REFERENCES "public"."godowns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_godown_idx" ON "stock_movements" USING btree ("godown_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_vehicle_idx" ON "stock_movements" USING btree ("vehicle_id","product_id");--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_one_source" CHECK (num_nonnulls("dispatches"."from_godown_id", "dispatches"."from_vehicle_id") = 1);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_one_place" CHECK (num_nonnulls("stock_movements"."godown_id", "stock_movements"."vehicle_id") = 1);