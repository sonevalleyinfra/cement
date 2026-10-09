-- Starting data: three firms (rename them in the app) and the three Prism products.
INSERT INTO "firms" ("name", "slot") VALUES ('Firm A', 'a'), ('Firm B', 'b'), ('Firm C', 'c')
ON CONFLICT ("slot") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("name") VALUES ('Prism OPC'), ('Prism PPC'), ('Prism Non-trade')
ON CONFLICT ("name") DO NOTHING;
