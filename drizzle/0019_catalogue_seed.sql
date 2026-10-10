-- Starting catalogue: brand Prism, types OPC and PPC, grades 33 / 43 / 53 for each.
INSERT INTO "brands" ("name") VALUES ('Prism')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "cement_types" ("code", "name", "sort_order") VALUES
  ('OPC', 'Ordinary Portland Cement', 1),
  ('PPC', 'Portland Pozzolana Cement', 2)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "grades" ("type_id", "name", "sort_order")
SELECT t."id", g."name", g."ord"
FROM "cement_types" t
CROSS JOIN (VALUES ('33', 1), ('43', 2), ('53', 3)) AS g("name", "ord")
WHERE t."code" IN ('OPC', 'PPC')
ON CONFLICT ("type_id", "name") DO NOTHING;
--> statement-breakpoint
-- The three old products get their parts and the new built name (there was no real data yet).
UPDATE "products" p
SET "brand_id" = b."id", "channel" = m."channel", "grade_id" = g."id", "bag_kg" = 50,
    "name" = m."new_name", "updated_at" = now()
FROM (VALUES
  ('Prism OPC', 'trade', 'OPC', '53', 'Prism Trade OPC 53'),
  ('Prism PPC', 'trade', 'PPC', '53', 'Prism Trade PPC 53'),
  ('Prism Non-trade', 'non_trade', 'PPC', '53', 'Prism Non-trade PPC 53')
) AS m("old_name", "channel", "type_code", "grade", "new_name")
JOIN "brands" b ON b."name" = 'Prism'
JOIN "cement_types" t ON t."code" = m."type_code"
JOIN "grades" g ON g."type_id" = t."id" AND g."name" = m."grade"
WHERE p."name" = m."old_name";
--> statement-breakpoint
-- Every other combination (2 channels x 2 types x 3 grades = 12 products in all). Admin switches off unused ones.
INSERT INTO "products" ("name", "brand_id", "channel", "grade_id", "bag_kg")
SELECT
  b."name" || ' ' || CASE c."channel" WHEN 'trade' THEN 'Trade' ELSE 'Non-trade' END || ' ' || t."code" || ' ' || g."name",
  b."id", c."channel", g."id", 50
FROM "brands" b
CROSS JOIN (VALUES ('trade'), ('non_trade')) AS c("channel")
JOIN "cement_types" t ON t."code" IN ('OPC', 'PPC')
JOIN "grades" g ON g."type_id" = t."id"
WHERE b."name" = 'Prism'
ON CONFLICT DO NOTHING;
