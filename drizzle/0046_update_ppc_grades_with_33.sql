-- Update PPC grades to include grade 33 with cement names
UPDATE "grades"
SET "name" = '33 - Cement Plus', "sort_order" = 1
WHERE "name" = 'Cement Plus' AND "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC');
--> statement-breakpoint
UPDATE "grades"
SET "name" = '33 - Duratech', "sort_order" = 2
WHERE "name" = 'Duratech' AND "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC');
--> statement-breakpoint
UPDATE "grades"
SET "name" = '33 - AW', "sort_order" = 3
WHERE "name" = 'AW' AND "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC');
--> statement-breakpoint
UPDATE "grades"
SET "sort_order" = 4
WHERE "name" = '33' AND "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC');
--> statement-breakpoint
-- Update existing products to display grade 33 with cement names
UPDATE "products"
SET "name" = 'Prism Trade PPC 33 - Cement Plus', "updated_at" = now()
WHERE "name" = 'Prism Trade PPC Cement Plus';
--> statement-breakpoint
UPDATE "products"
SET "name" = 'Prism Trade PPC 33 - Duratech', "updated_at" = now()
WHERE "name" = 'Prism Trade PPC Duratech';
--> statement-breakpoint
UPDATE "products"
SET "name" = 'Prism Trade PPC 33 - AW', "updated_at" = now()
WHERE "name" = 'Prism Trade PPC AW';
--> statement-breakpoint
-- Deactivate invalid Trade combinations (PPC only sells 33 in Trade)
UPDATE "products"
SET "active" = false, "updated_at" = now()
WHERE "name" IN ('Prism Trade PPC 43', 'Prism Trade PPC 53');
--> statement-breakpoint
UPDATE "grades"
SET "active" = false
WHERE "name" IN ('43', '53') AND "type_id" IN (SELECT "id" FROM "cement_types" WHERE "code" = 'PPC');
