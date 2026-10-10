-- Godowns used to be typed once per firm. Make one shared godown per distinct name
-- (ignoring capitals and extra spaces; the oldest spelling wins) and link each firm's row to it.
INSERT INTO "godowns" ("name", "created_at")
SELECT DISTINCT ON (lower(c."clean")) c."clean", c."created_at"
FROM (
  SELECT regexp_replace(trim("name"), '\s+', ' ', 'g') AS "clean", "created_at"
  FROM "stock_locations"
  WHERE "kind" = 'godown'
) c
WHERE c."clean" <> ''
ORDER BY lower(c."clean"), c."created_at"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "stock_locations" l
SET "godown_id" = g."id", "name" = g."name"
FROM "godowns" g
WHERE l."kind" = 'godown'
  AND lower(g."name") = lower(regexp_replace(trim(l."name"), '\s+', ' ', 'g'));
--> statement-breakpoint
-- If one firm had the same place twice (e.g. "Main Godown" and "main godown"), keep the oldest row
-- and move the other rows' history onto it. Bag totals stay exactly the same.
CREATE TEMP TABLE "_location_merge" AS
SELECT "id", "keep_id" FROM (
  SELECT "id",
    first_value("id") OVER (
      PARTITION BY "firm_id", coalesce("godown_id", "vehicle_id")
      ORDER BY "created_at", "id"
    ) AS "keep_id"
  FROM "stock_locations"
  WHERE coalesce("godown_id", "vehicle_id") IS NOT NULL
) r
WHERE r."id" <> r."keep_id";
--> statement-breakpoint
UPDATE "stock_movements" m SET "location_id" = x."keep_id" FROM "_location_merge" x WHERE m."location_id" = x."id";
--> statement-breakpoint
UPDATE "dispatches" d SET "location_id" = x."keep_id" FROM "_location_merge" x WHERE d."location_id" = x."id";
--> statement-breakpoint
DELETE FROM "stock_locations" WHERE "id" IN (SELECT "id" FROM "_location_merge");
--> statement-breakpoint
DROP TABLE "_location_merge";
--> statement-breakpoint
-- Switching places on and off now happens on the godown or vehicle itself, for all firms at once.
UPDATE "stock_locations" SET "active" = true WHERE "active" = false;
