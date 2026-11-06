-- 1. Order cement types so PPC shows before OPC
UPDATE "cement_types" SET "sort_order" = 1 WHERE "code" = 'PPC';
--> statement-breakpoint
UPDATE "cement_types" SET "sort_order" = 2 WHERE "code" = 'OPC';
--> statement-breakpoint

-- 2. Ensure PPC grades exist and are properly named
-- Champion Plus (sort_order 1)
UPDATE "grades"
SET "name" = 'Champion Plus', "sort_order" = 1, "active" = true
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC')
  AND "name" IN ('33 - Cement Plus', 'Cement Plus');
--> statement-breakpoint

INSERT INTO "grades" ("type_id", "name", "sort_order", "active")
SELECT t."id", 'Champion Plus', 1, true
FROM "cement_types" t WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO UPDATE SET "sort_order" = 1, "active" = true;
--> statement-breakpoint

-- Champion (sort_order 2)
UPDATE "grades"
SET "name" = 'Champion', "sort_order" = 2, "active" = true
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC')
  AND "name" = '33';
--> statement-breakpoint

INSERT INTO "grades" ("type_id", "name", "sort_order", "active")
SELECT t."id", 'Champion', 2, true
FROM "cement_types" t WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO UPDATE SET "sort_order" = 2, "active" = true;
--> statement-breakpoint

-- All weather (sort_order 3)
UPDATE "grades"
SET "name" = 'All weather', "sort_order" = 3, "active" = true
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC')
  AND "name" IN ('33 - AW', 'AW');
--> statement-breakpoint

INSERT INTO "grades" ("type_id", "name", "sort_order", "active")
SELECT t."id", 'All weather', 3, true
FROM "cement_types" t WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO UPDATE SET "sort_order" = 3, "active" = true;
--> statement-breakpoint

-- Duratech (sort_order 4)
UPDATE "grades"
SET "name" = 'Duratech', "sort_order" = 4, "active" = true
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC')
  AND "name" IN ('33 - Duratech', 'Duratech');
--> statement-breakpoint

INSERT INTO "grades" ("type_id", "name", "sort_order", "active")
SELECT t."id", 'Duratech', 4, true
FROM "cement_types" t WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO UPDATE SET "sort_order" = 4, "active" = true;
--> statement-breakpoint

-- NFR for Non-trade PPC (sort_order 5)
INSERT INTO "grades" ("type_id", "name", "sort_order", "active")
SELECT t."id", 'NFR', 5, true
FROM "cement_types" t WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO UPDATE SET "sort_order" = 5, "active" = true;
--> statement-breakpoint

-- Deactivate other PPC grades (like 43, 53)
UPDATE "grades"
SET "active" = false
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC')
  AND "name" IN ('43', '53');
--> statement-breakpoint

-- 3. OPC grades: 43 active (sort_order 1), 33 & 53 inactive
UPDATE "grades"
SET "sort_order" = 1, "active" = true
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'OPC')
  AND "name" = '43';
--> statement-breakpoint

UPDATE "grades"
SET "active" = false
WHERE "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'OPC')
  AND "name" IN ('33', '53');
--> statement-breakpoint

-- 4. Update products:
-- Trade: Prism Champion Plus
UPDATE "products"
SET "name" = 'Prism Champion Plus',
    "grade_id" = (SELECT g."id" FROM "grades" g JOIN "cement_types" t ON t."id" = g."type_id" WHERE t."code" = 'PPC' AND g."name" = 'Champion Plus' LIMIT 1),
    "active" = true,
    "updated_at" = now()
WHERE "name" IN ('Prism Trade PPC 33 - Cement Plus', 'Prism Trade PPC Cement Plus');
--> statement-breakpoint

-- Trade: Prism Champion
UPDATE "products"
SET "name" = 'Prism Champion',
    "grade_id" = (SELECT g."id" FROM "grades" g JOIN "cement_types" t ON t."id" = g."type_id" WHERE t."code" = 'PPC' AND g."name" = 'Champion' LIMIT 1),
    "active" = true,
    "updated_at" = now()
WHERE "name" = 'Prism Trade PPC 33';
--> statement-breakpoint

-- Trade: Prism All weather
UPDATE "products"
SET "name" = 'Prism All weather',
    "grade_id" = (SELECT g."id" FROM "grades" g JOIN "cement_types" t ON t."id" = g."type_id" WHERE t."code" = 'PPC' AND g."name" = 'All weather' LIMIT 1),
    "active" = true,
    "updated_at" = now()
WHERE "name" IN ('Prism Trade PPC 33 - AW', 'Prism Trade PPC AW');
--> statement-breakpoint

-- Trade: Prism Duratech
UPDATE "products"
SET "name" = 'Prism Duratech',
    "grade_id" = (SELECT g."id" FROM "grades" g JOIN "cement_types" t ON t."id" = g."type_id" WHERE t."code" = 'PPC' AND g."name" = 'Duratech' LIMIT 1),
    "active" = true,
    "updated_at" = now()
WHERE "name" IN ('Prism Trade PPC 33 - Duratech', 'Prism Trade PPC Duratech');
--> statement-breakpoint

-- Trade: OPC 43
UPDATE "products"
SET "name" = 'OPC 43',
    "active" = true,
    "updated_at" = now()
WHERE "name" = 'Prism Trade OPC 43';
--> statement-breakpoint

-- Non-trade: Prism NFR
UPDATE "products"
SET "name" = 'Prism NFR',
    "grade_id" = (SELECT g."id" FROM "grades" g JOIN "cement_types" t ON t."id" = g."type_id" WHERE t."code" = 'PPC' AND g."name" = 'NFR' LIMIT 1),
    "active" = true,
    "updated_at" = now()
WHERE "name" = 'Prism Non-trade PPC 33';
--> statement-breakpoint

-- Non-trade: Prism Non-trade OPC 43
UPDATE "products"
SET "name" = 'Prism Non-trade OPC 43',
    "active" = true,
    "updated_at" = now()
WHERE "name" = 'Prism Non-trade OPC 43';
--> statement-breakpoint

-- Insert any missing target products
INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism Champion Plus', b."id", 'trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = 'Champion Plus'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism Champion', b."id", 'trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = 'Champion'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism All weather', b."id", 'trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = 'All weather'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism Duratech', b."id", 'trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = 'Duratech'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'OPC 43', b."id", 'trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'OPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = '43'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism NFR', b."id", 'non_trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = 'NFR'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg", "active")
SELECT 'Prism Non-trade OPC 43', b."id", 'non_trade', g."id", 50, true
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'OPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = '43'
WHERE b."name" = 'Prism'
ON CONFLICT ("name") DO UPDATE SET "active" = true, "updated_at" = now();
--> statement-breakpoint

-- 5. Deactivate all other products across the whole catalogue
UPDATE "products"
SET "active" = false, "updated_at" = now()
WHERE "name" NOT IN (
  'Prism Champion Plus',
  'OPC 43',
  'Prism Champion',
  'Prism All weather',
  'Prism Duratech',
  'Prism NFR',
  'Prism Non-trade OPC 43'
);
