import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * The firm's bank accounts that online payments come into (rules in lib/bank-account-rules.ts).
 * Admin keeps the list at /bank-accounts. `last4` (4 digits) and `upiId` are optional (null = not set).
 * An account used by a payment cannot be deleted (the receipts foreign key): it is switched off
 * (`active` false) and can then not be picked for a new payment.
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    last4: text("last4"),
    upiId: text("upi_id"),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("bank_accounts_name_lower_unique").on(sql`lower(${t.name})`),
    check("bank_accounts_name_valid", sql`char_length(${t.name}) between 1 and 60 and ${t.name} = btrim(${t.name})`),
    check("bank_accounts_last4_valid", sql`${t.last4} ~ '^[0-9]{4}$'`),
    check(
      "bank_accounts_upi_id_valid",
      sql`char_length(${t.upiId}) <= 60 and ${t.upiId} = btrim(${t.upiId}) and ${t.upiId} ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'`,
    ),
  ],
);
