-- Books are append-only (ADR 0001, decision 1).
--
-- What: the database refuses UPDATE, DELETE and TRUNCATE on the book tables (ledger, stock,
-- wallet, supplier ledger, dispatches, order events, activity log). Orders and receipts may still
-- change status/rate/UTR, but are never deleted or truncated.
-- Why: until now "never edit the books" was only a code rule. Mistakes are fixed with a new entry.
-- Repair: a future, reviewed data-repair migration opts out inside its own transaction with
--   SET LOCAL cement.books_repair = 'on';
--   and ends with SET LOCAL cement.books_repair = 'off'; (the migrator runs all pending
--   migrations in ONE transaction, so a flag left on would also cover the migrations after it).
-- The app never sets this flag.
-- Also: stock_movements.actor_id must be set on new rows (NOT VALID: old rows are not checked).

CREATE OR REPLACE FUNCTION cement_books_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('cement.books_repair', true) = 'on' THEN
    IF TG_LEVEL = 'STATEMENT' THEN
      RETURN NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% on % is not allowed: the books are append-only (fix mistakes with a new entry)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'A reviewed repair migration may run SET LOCAL cement.books_repair = ''on'' first.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "stock_movements_append_only" BEFORE UPDATE OR DELETE ON "stock_movements" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "stock_movements_no_truncate" BEFORE TRUNCATE ON "stock_movements" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "wallet_movements_append_only" BEFORE UPDATE OR DELETE ON "wallet_movements" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "wallet_movements_no_truncate" BEFORE TRUNCATE ON "wallet_movements" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "supplier_ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "supplier_ledger_entries" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "supplier_ledger_entries_no_truncate" BEFORE TRUNCATE ON "supplier_ledger_entries" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "dispatches_append_only" BEFORE UPDATE OR DELETE ON "dispatches" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "dispatches_no_truncate" BEFORE TRUNCATE ON "dispatches" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "order_events_append_only" BEFORE UPDATE OR DELETE ON "order_events" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "order_events_no_truncate" BEFORE TRUNCATE ON "order_events" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "orders_append_only" BEFORE DELETE ON "orders" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "orders_no_truncate" BEFORE TRUNCATE ON "orders" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "receipts_append_only" BEFORE DELETE ON "receipts" FOR EACH ROW EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
CREATE TRIGGER "receipts_no_truncate" BEFORE TRUNCATE ON "receipts" FOR EACH STATEMENT EXECUTE FUNCTION cement_books_append_only();
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_required" CHECK ("actor_id" IS NOT NULL) NOT VALID;
