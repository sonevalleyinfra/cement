CREATE TABLE "godowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_locations" ADD COLUMN "godown_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "godowns_name_lower_unique" ON "godowns" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_godown_id_godowns_id_fk" FOREIGN KEY ("godown_id") REFERENCES "public"."godowns"("id") ON DELETE no action ON UPDATE no action;