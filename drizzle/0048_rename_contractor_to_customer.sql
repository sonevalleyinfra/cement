ALTER TABLE "retailers" DROP CONSTRAINT IF EXISTS "retailers_category_valid";--> statement-breakpoint
UPDATE "retailers" SET "category" = 'customer' WHERE "category" = 'contractor';--> statement-breakpoint
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_category_valid" CHECK ("retailers"."category" in ('retailer', 'sub_dealer', 'customer', 'builder', 'institution'));
