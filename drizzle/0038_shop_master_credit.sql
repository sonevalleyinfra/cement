-- Shop master and credit terms (cement v2 A1 + A2).
--
-- What: an admin-kept list of areas; optional master fields and credit terms on retailers (existing
-- rows keep NULL, credit_status defaults to 'ok'); credit_limit_changes, the append-only history of
-- credit terms (the triggers at the end use cement_books_append_only() from 0037).
-- Credit terms are stored only here: nothing is refused because of them yet (v2 B1).
-- The GSTIN is stored only and never used for tax.

CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "credit_limit_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"changed_by" text NOT NULL,
	"old_limit_paise" bigint,
	"new_limit_paise" bigint,
	"old_credit_days" integer,
	"new_credit_days" integer,
	"old_status" text NOT NULL,
	"new_status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_limit_changes_old_status_valid" CHECK ("credit_limit_changes"."old_status" in ('ok', 'hold', 'blocked')),
	CONSTRAINT "credit_limit_changes_new_status_valid" CHECK ("credit_limit_changes"."new_status" in ('ok', 'hold', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "alt_phone" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "geo_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "opened_on" date;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "credit_limit_paise" bigint;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "credit_days" integer;--> statement-breakpoint
ALTER TABLE "retailers" ADD COLUMN "credit_status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_limit_changes" ADD CONSTRAINT "credit_limit_changes_retailer_id_retailers_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_limit_changes" ADD CONSTRAINT "credit_limit_changes_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_limit_changes_retailer_idx" ON "credit_limit_changes" USING btree ("retailer_id","created_at");--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_pincode_valid" CHECK ("retailers"."pincode" ~ '^[1-9][0-9]{5}$');--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_geo_both" CHECK (("retailers"."lat" is null) = ("retailers"."lng" is null));--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_lat_range" CHECK ("retailers"."lat" between -90 and 90);--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_lng_range" CHECK ("retailers"."lng" between -180 and 180);--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_category_valid" CHECK ("retailers"."category" in ('retailer', 'sub_dealer', 'contractor', 'builder', 'institution'));--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_gstin_format" CHECK ("retailers"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_credit_limit_valid" CHECK ("retailers"."credit_limit_paise" >= 0);--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_credit_days_range" CHECK ("retailers"."credit_days" between 0 and 365);--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_credit_status_valid" CHECK ("retailers"."credit_status" in ('ok', 'hold', 'blocked'));--> statement-breakpoint
CREATE TRIGGER "credit_limit_changes_append_only" BEFORE UPDATE OR DELETE ON "credit_limit_changes" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "credit_limit_changes_no_truncate" BEFORE TRUNCATE ON "credit_limit_changes" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
