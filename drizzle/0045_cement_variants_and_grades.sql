-- Insert PPC cement names / variants: Cement Plus, Duratech, AW, 33
INSERT INTO "grades" ("type_id", "name", "sort_order")
SELECT t."id", g."name", g."ord"
FROM "cement_types" t
CROSS JOIN (VALUES ('Cement Plus', 1), ('Duratech', 2), ('AW', 3), ('33', 4)) AS g("name", "ord")
WHERE t."code" = 'PPC'
ON CONFLICT ("type_id", "name") DO NOTHING;
--> statement-breakpoint
-- Insert OPC grades: 43, 53, 33
INSERT INTO "grades" ("type_id", "name", "sort_order")
SELECT t."id", g."name", g."ord"
FROM "cement_types" t
CROSS JOIN (VALUES ('43', 1), ('53', 2), ('33', 3)) AS g("name", "ord")
WHERE t."code" = 'OPC'
ON CONFLICT ("type_id", "name") DO NOTHING;
--> statement-breakpoint
-- Ensure Prism brand products exist for these variants and grades:
-- 1. Trade PPC variants: Cement Plus, Duratech, AW
INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg")
SELECT
  b."name" || ' Trade PPC ' || g."name",
  b."id", 'trade', g."id", 50
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'PPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" IN ('Cement Plus', 'Duratech', 'AW')
WHERE b."name" = 'Prism'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 2. Trade OPC: 43
INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg")
SELECT
  b."name" || ' Trade OPC ' || g."name",
  b."id", 'trade', g."id", 50
FROM "brands" b
JOIN "cement_types" t ON t."code" = 'OPC'
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = '43'
WHERE b."name" = 'Prism'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 3. Non-trade (NFR): Prism sells 33 and 43
INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg")
SELECT
  b."name" || ' Non-trade ' || t."code" || ' ' || g."name",
  b."id", 'non_trade', g."id", 50
FROM "brands" b
JOIN "cement_types" t ON t."code" IN ('OPC', 'PPC')
JOIN "grades" g ON g."type_id" = t."id" AND (
  (t."code" = 'PPC' AND g."name" = '33') OR
  (t."code" = 'OPC' AND g."name" IN ('33', '43'))
)
WHERE b."name" = 'Prism'
ON CONFLICT DO NOTHING;
