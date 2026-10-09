import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Trucks that carry cement. `number` is stored uppercase with no spaces, e.g. BR01AB1234. */
export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  driverName: text("driver_name").notNull(),
  driverPhone: text("driver_phone").default("").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
