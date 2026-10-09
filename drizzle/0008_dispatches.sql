CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"bags" integer NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_name" text NOT NULL,
	"driver_phone" text DEFAULT '' NOT NULL,
	"location_id" uuid NOT NULL,
	"rate_paise" integer,
	"dispatched_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatched_by_user_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatches_order_idx" ON "dispatches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "dispatches_firm_idx" ON "dispatches" USING btree ("firm_id");