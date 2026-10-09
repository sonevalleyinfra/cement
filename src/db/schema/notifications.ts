import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { firms } from "./firms";
import { orders } from "./orders";

/** In-app notifications. One row per person per event. `readAt` empty = unread. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firmId: uuid("firm_id").references(() => firms.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").default("").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);
