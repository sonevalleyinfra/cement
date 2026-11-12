ALTER TABLE "dispatches" ADD COLUMN "tracking_id" text NOT NULL DEFAULT ('DSP-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-' || substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 6));--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "tracking_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "tracking_id" text NOT NULL DEFAULT ('TRK-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-' || substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 6));--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "tracking_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "dispatches_tracking_idx" ON "dispatches" USING btree ("tracking_id");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tracking_id_unique" UNIQUE("tracking_id");
