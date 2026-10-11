-- Payments are cash or online only (spec v1.0 section 6). All payment rows so far are test data.
-- This runs before the next migration drops the cheque columns and narrows the allowed modes / statuses.
--
-- 1. Cheque receipts go, together with their ledger rows, wallet rows and notifications.
DELETE FROM "notifications" n
USING "receipts" r
WHERE r."mode" = 'cheque' AND n."link" = '/receipts/' || r."id"::text;
--> statement-breakpoint
DELETE FROM "ledger_entries" l
USING "receipts" r
WHERE r."mode" = 'cheque' AND l."receipt_id" = r."id";
--> statement-breakpoint
DELETE FROM "wallet_movements" w
USING "receipts" r
WHERE r."mode" = 'cheque' AND w."receipt_id" = r."id";
--> statement-breakpoint
DELETE FROM "receipts" WHERE "mode" = 'cheque';
--> statement-breakpoint
-- 2. An online payment no longer lowers the dues until accounts verify it. Unverified ones were
--    credited when recorded, so that credit is taken out again (it is posted on "Verified").
DELETE FROM "ledger_entries" l
USING "receipts" r
WHERE r."mode" = 'online' AND r."status" = 'unverified' AND l."receipt_id" = r."id";
--> statement-breakpoint
-- 3. UTRs are kept in one form (no spaces, capitals) so the same UTR cannot be recorded twice.
UPDATE "receipts" SET "utr" = upper(regexp_replace("utr", '\s', '', 'g')) WHERE "mode" = 'online' AND "utr" IS NOT NULL;
--> statement-breakpoint
UPDATE "receipts" SET "utr" = NULL WHERE "mode" = 'cash';
--> statement-breakpoint
-- Test data may hold the same UTR twice: later copies get their receipt number added, so the
-- unique rule in the next migration can be created.
UPDATE "receipts" r SET "utr" = r."utr" || '-' || r."receipt_no"::text
WHERE r."mode" = 'online'
  AND EXISTS (
    SELECT 1 FROM "receipts" o
    WHERE o."mode" = 'online' AND o."utr" = r."utr" AND o."receipt_no" < r."receipt_no"
  );
