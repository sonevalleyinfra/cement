ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_rate_positive";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_status_valid";--> statement-breakpoint
ALTER TABLE "order_events" DROP CONSTRAINT "order_events_assignee_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_logistics_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "rate_paise" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_events" DROP COLUMN "assignee_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "logistics_id";--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_rate_positive" CHECK ("dispatches"."rate_paise" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid" CHECK ("orders"."status" in ('placed', 'approved', 'rejected', 'partly_dispatched', 'dispatched', 'cancelled'));