-- Shops, trucks and users are never deleted (PLAN-v3 stage 1, item 8).
--
-- What: the database refuses DELETE and TRUNCATE on retailers and vehicles, TRUNCATE on "user",
-- and DELETE of a user who has history (an activity row about them, or a shop linked to them as
-- its login or its sales person).
-- Why: the app only ever switches these off (or marks a user deleted), but until now that was
-- only a code rule. A deleted user would also silently empty a shop's sales person (set null).
-- Still allowed: deleting a user that was only half made (create failed before its activity row
-- was saved) and the placeholder admin replaced by the seed. Neither has any history.
-- Purchases were already protected in 0040 (claim-only updates, no delete, no truncate).
-- Repair: same opt-out as the books (0037), inside a reviewed migration only:
--   SET LOCAL cement.books_repair = 'on';  ...  SET LOCAL cement.books_repair = 'off';
-- The app never sets this flag.

CREATE OR REPLACE FUNCTION cement_master_no_delete() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('cement.books_repair', true) = 'on' THEN
    IF TG_LEVEL = 'STATEMENT' THEN
      RETURN NULL;
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% on % is not allowed: shops, trucks and users are switched off, never deleted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'A reviewed repair migration may run SET LOCAL cement.books_repair = ''on'' first.';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cement_user_no_delete_with_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('cement.books_repair', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM audit_log WHERE entity = 'user' AND entity_id = OLD.id)
     OR EXISTS (SELECT 1 FROM retailers WHERE user_id = OLD.id OR sales_rep_id = OLD.id) THEN
    RAISE EXCEPTION 'DELETE on user is not allowed: this user has history (switch them off instead)'
      USING ERRCODE = 'restrict_violation',
            HINT = 'A reviewed repair migration may run SET LOCAL cement.books_repair = ''on'' first.';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "retailers_no_delete" BEFORE DELETE ON "retailers" FOR EACH ROW EXECUTE FUNCTION cement_master_no_delete();
--> statement-breakpoint
CREATE TRIGGER "retailers_no_truncate" BEFORE TRUNCATE ON "retailers" FOR EACH STATEMENT EXECUTE FUNCTION cement_master_no_delete();
--> statement-breakpoint
CREATE TRIGGER "vehicles_no_delete" BEFORE DELETE ON "vehicles" FOR EACH ROW EXECUTE FUNCTION cement_master_no_delete();
--> statement-breakpoint
CREATE TRIGGER "vehicles_no_truncate" BEFORE TRUNCATE ON "vehicles" FOR EACH STATEMENT EXECUTE FUNCTION cement_master_no_delete();
--> statement-breakpoint
CREATE TRIGGER "user_no_delete_with_history" BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION cement_user_no_delete_with_history();
--> statement-breakpoint
CREATE TRIGGER "user_no_truncate" BEFORE TRUNCATE ON "user" FOR EACH STATEMENT EXECUTE FUNCTION cement_master_no_delete();
