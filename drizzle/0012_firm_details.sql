ALTER TABLE "firms" DROP CONSTRAINT "firms_slot_unique";--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "owner_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "gstin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;