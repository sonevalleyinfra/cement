import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Shops that buy cement. `phone` is 10 plain digits. */
export const retailers = pgTable("retailers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  place: text("place").default("").notNull(),
  /** Optional login for this shop (a user with the retailer role). One login per shop. */
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  /**
   * The sales person who looks after this shop. Every new order of the shop goes to them
   * (they fill the rate). Admin can change it. Empty = nobody yet.
   */
  salesRepId: text("sales_rep_id").references(() => user.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
