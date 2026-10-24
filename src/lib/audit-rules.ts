/**
 * Activity log ("who did what, when") rules as plain functions (no database).
 * Source: docs/idea.md section 9 ("Activity log: every action (who, what, when, details),
 * filter by person / type / date").
 *
 * Every state-changing server action writes one `audit_log` row (lib/audit.ts) in the same
 * transaction as the change. The row keeps ids and numbers (paise, bags) in `details`; names are
 * looked up when the log is shown, so the sentence always uses today's name of a shop or product.
 *
 * Details conventions (all optional, all plain JSON):
 *   retailerId, productId, collectorId, userId, ids, turned into names when shown
 *   brandId
 *   place, from, to                             place keys ("godown:<id>" / "vehicle:<id>")
 *   bags, cancelledBags                         whole bags (adjustments are signed)
 *   amountPaise, ratePaise, unitCostPaise,      integer paise
 *   requestedPaise
 *   reason, mode, utr, receiptNo, name, ...     short text / numbers
 */
import { formatINR } from "./money";
import { ONLINE_METHOD_LABELS } from "./receipt-rules";
import { CLAIM_LABELS, isClaimStatus } from "./purchase-rules";
import { SUPPLIER_KINDS } from "./supplier-rules";

/* ---------- What may be logged ---------- */

/** Every kind of record the log knows, with the actions allowed on it. */
export const AUDIT_ACTIONS = {
  // Orders and dispatch (spec section 3)
  order: ["place", "fill_rate", "change_rate", "approve", "reject", "cancel"],
  dispatch: ["create"],
  // Stock (spec section 4)
  // claim: a purchase's short / burst claim moved on (entityId = the purchase id)
  stock: ["opening", "purchase", "adjustment", "transfer", "claim"],
  // Money (spec sections 5 and 6)
  payment: ["record", "verify", "reject", "reverse"],
  handover: ["request", "confirm", "reject"],
  ledger: ["opening", "adjustment"],
  // The firm's bank accounts online payments come into (admin list at /bank-accounts)
  bank_account: ["add", "edit", "switch_off", "switch_on", "delete"],
  // Supplier accounts, one per brand (spec section 7)
  supplier_entry: SUPPLIER_KINDS,
  // Masters
  user: ["create", "update", "rename", "activate", "deactivate", "delete"],
  retailer: ["create", "update", "activate", "deactivate", "link", "assign_sales_rep", "credit_change"],
  godown: ["create", "update", "activate", "deactivate"],
  area: ["create", "update", "activate", "deactivate"],
  brand: ["create", "rename", "activate", "deactivate"],
  product: ["create", "activate", "deactivate"],
  cement_type: ["create", "activate", "deactivate", "rename"],
  grade: ["create", "activate", "deactivate", "rename"],
  vehicle: ["create"],
  // Report downloads (entityId = the report name; details: report, from, to, retailerId / brandId)
  report: ["export"],
} as const;

export type AuditEntity = keyof typeof AUDIT_ACTIONS;
export type AuditActionOf<E extends AuditEntity> = (typeof AUDIT_ACTIONS)[E][number];

/** One allowed (entity, action) pair, so a typo is caught by the type checker. */
export type AuditKind = { [E in AuditEntity]: { entity: E; action: AuditActionOf<E> } }[AuditEntity];

export function isAuditEntity(value: unknown): value is AuditEntity {
  return typeof value === "string" && Object.hasOwn(AUDIT_ACTIONS, value);
}

/** True when `action` is allowed for `entity`. */
export function isAllowedAudit(entity: unknown, action: unknown): boolean {
  if (!isAuditEntity(entity)) return false;
  return (AUDIT_ACTIONS[entity] as readonly string[]).includes(String(action));
}

/**
 * Entity names that old rows may still carry, and what they mean today. Never written again.
 * "prism_entry": the Prism account before it became one supplier account per brand (every such
 * row was owed to Prism).
 */
export const LEGACY_ENTITIES: Record<string, AuditEntity> = { prism_entry: "supplier_entry" };

/* ---------- Filter groups ---------- */

/** The "type" filter on the activity page. Every entity is in exactly one group. */
export const ACTIVITY_GROUPS = {
  orders: ["order", "dispatch"],
  stock: ["stock"],
  payments: ["payment", "handover", "ledger", "bank_account"],
  suppliers: ["supplier_entry"],
  masters: ["user", "retailer", "godown", "area", "brand", "product", "cement_type", "grade", "vehicle", "report"],
} as const satisfies Record<string, readonly AuditEntity[]>;

export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export const ACTIVITY_GROUP_LABELS: Record<ActivityGroup, string> = {
  orders: "Orders",
  stock: "Stock",
  payments: "Payments",
  suppliers: "Suppliers",
  masters: "Masters",
};

export function isActivityGroup(value: unknown): value is ActivityGroup {
  return typeof value === "string" && Object.hasOwn(ACTIVITY_GROUPS, value);
}

/**
 * What one filter group matches: its entities (and their old names), plus a few single actions
 * from other groups. A stock purchase also adds to a supplier account (its one log row is the
 * stock row), so the Suppliers filter shows purchases too.
 */
export function groupFilter(group: ActivityGroup): { entities: string[]; extra: { entity: string; action: string }[] } {
  const entities: string[] = [...ACTIVITY_GROUPS[group]];
  for (const [old, now] of Object.entries(LEGACY_ENTITIES)) if (entities.includes(now)) entities.push(old);
  return {
    entities,
    extra: group === "suppliers" ? [{ entity: "stock", action: "purchase" }] : [],
  };
}

/** The group an entity (or its old name) belongs to, or null for an unknown entity. */
export function groupOf(entity: string): ActivityGroup | null {
  const now = LEGACY_ENTITIES[entity] ?? entity;
  for (const [group, entities] of Object.entries(ACTIVITY_GROUPS)) {
    if ((entities as readonly string[]).includes(now)) return group as ActivityGroup;
  }
  return null;
}

/* ---------- Changed fields (for "update" rows) ---------- */

export type FieldChanges = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Compares the old row with the new values and keeps only the fields that changed.
 * Returns null when nothing changed. Only the keys in `after` are looked at.
 */
export function changedFields(
  before: Record<string, unknown> | undefined | null,
  after: Record<string, unknown>,
): FieldChanges | null {
  const out: FieldChanges = { before: {}, after: {} };
  let changed = false;
  for (const key of Object.keys(after)) {
    const old = before ? before[key] : undefined;
    if (!same(old, after[key])) {
      out.before[key] = old ?? null;
      out.after[key] = after[key];
      changed = true;
    }
  }
  return changed ? out : null;
}

/* ---------- Showing a row ---------- */

export type ActivityRow = {
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  details: Record<string, unknown> | null;
};

/** The id inside a place key ("godown:<id>" → "<id>"), or null. */
function placeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [kind, id] = value.split(":");
  return (kind === "godown" || kind === "vehicle") && id ? id : null;
}


/** Money in a sentence: whole rupees when there are no paise, else rupees and paise. */
function rs(paise: number): string {
  return formatINR(paise, { hidePaise: true });
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const bagsText = (b: number) => `${Math.abs(b)} ${Math.abs(b) === 1 ? "bag" : "bags"}`;
const signed = (paise: number) => `${paise < 0 ? "−" : "+"}${rs(Math.abs(paise))}`;
const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

/**
 * One short sentence for one log row, e.g.
 * "Ramesh dispatched 50 bags of Prism Trade OPC 43 to Sharma Traders (₹17,500)".
 * `names` maps ids to today's names; anything unknown gets a plain word ("a shop").
 */
export function activitySentence(row: ActivityRow, names: ReadonlyMap<string, string>): string {
  const d = row.details ?? {};
  const actor = names.get(row.actorId) ?? "Someone";
  const name = (id: unknown, fallback: string) => (typeof id === "string" && names.get(id)) || fallback;
  const shop = name(d.retailerId, "a shop");
  const product = name(d.productId, "cement");
  const place = (key: unknown) => name(placeId(key), "a place");
  const bags = n(d.bags);
  const amount = n(d.amountPaise);
  const why = s(d.reason) || s(d.note);
  const reason = why ? `: ${why}` : "";
  const self = name(row.entityId, s(d.name) || "");
  const thing = (word: string) => (self ? `${word} ${self}` : `a ${word}`);
  const switched = (word: string) =>
    `${actor} switched ${row.action === "activate" ? "on" : "off"} ${thing(word)}`;
  const say = (text: string) => `${actor} ${text}`;

  switch (row.entity) {
    case "order": {
      const what = bags !== null ? ` for ${bagsText(bags)}` : "";
      const rate = d.ratePaise;
      const after = rate && typeof rate === "object" ? n((rate as Record<string, unknown>).after) : n(rate);
      const before = rate && typeof rate === "object" ? n((rate as Record<string, unknown>).before) : null;
      switch (row.action) {
        case "place":
          return say(`placed an order${bags !== null ? ` for ${bagsText(bags)} of ${product}` : ""} for ${shop}`);
        case "fill_rate":
          return say(`filled the rate on ${possessive(shop)} order${after !== null ? `: ${rs(after)} a bag` : ""}`);
        case "change_rate":
          return say(
            `changed the rate on ${possessive(shop)} order${before !== null && after !== null ? ` from ${rs(before)} to ${rs(after)} a bag` : ""}${reason}`,
          );
        case "approve":
          return say(`approved ${possessive(shop)} order${what}`);
        case "reject":
          return say(`rejected ${possessive(shop)} order${what}${reason}`);
        case "cancel": {
          const left = n(d.cancelledBags);
          return say(`cancelled ${left !== null ? `${bagsText(left)} of ` : ""}${possessive(shop)} order${reason}`);
        }
      }
      break;
    }
    case "dispatch":
      return say(
        `dispatched ${bags !== null ? `${bagsText(bags)} of ` : ""}${product} to ${shop}${amount !== null ? ` (${rs(amount)})` : ""}`,
      );
    case "stock": {
      const count = bags !== null ? bagsText(bags) : "bags";
      switch (row.action) {
        case "purchase": {
          const cost = n(d.unitCostPaise);
          const owed = amount !== null ? ` (${rs(amount)} to ${name(d.brandId, "the supplier")})` : "";
          return say(`bought ${count} of ${product} into ${place(d.place)}${cost !== null ? ` at ${rs(cost)} a bag` : ""}${owed}`);
        }
        case "opening":
          return say(`set opening stock of ${count} of ${product} at ${place(d.place)}`);
        case "adjustment":
          return say(`corrected ${product} at ${place(d.place)} by ${bags !== null && bags < 0 ? "−" : "+"}${count}${reason}`);
        case "transfer":
          return say(`moved ${count} of ${product} from ${place(d.from)} to ${place(d.to)}`);
        case "claim": {
          const to = isClaimStatus(d.to) ? CLAIM_LABELS[d.to] : "changed";
          return say(`marked the claim on ${s(d.invoiceNo) ? `invoice ${s(d.invoiceNo)}` : "a purchase"} as ${to}`);
        }
      }
      break;
    }
    case "payment": {
      const money = amount !== null ? rs(amount) : "a payment";
      const mode = s(d.mode) === "online" ? "online" : "cash";
      const method = ONLINE_METHOD_LABELS[s(d.onlineMethod)];
      switch (row.action) {
        case "record":
          return say(`recorded ${money} ${mode}${method ? ` (${method})` : ""} from ${shop}${s(d.utr) ? ` (UTR ${s(d.utr)})` : ""}`);
        case "verify":
          return say(`verified ${money} online from ${shop}`);
        case "reject":
          return say(`rejected ${money} online from ${shop}${reason}`);
        case "reverse":
          return say(
            `reversed ${money} ${mode} payment from ${shop}${reason}${s(d.cashWith) === "office" ? " (cash already with office)" : ""}`,
          );
      }
      break;
    }
    case "handover": {
      const money = amount !== null ? rs(amount) : "cash";
      const who = name(d.collectorId, "a staff member");
      switch (row.action) {
        case "request":
          return say(`asked to hand over ${money} cash`);
        case "confirm": {
          const asked = n(d.requestedPaise);
          const part = asked !== null && amount !== null && asked > amount ? ` (${rs(asked)} asked)` : "";
          return say(`received ${money} cash from ${who}${part}`);
        }
        case "reject":
          return say(`refused ${possessive(who)} handover of ${money}${reason}`);
      }
      break;
    }
    case "ledger": {
      const value = amount ?? 0;
      if (row.action === "opening") {
        return say(`set ${possessive(shop)} opening balance: ${value < 0 ? "advance" : "owes"} ${rs(Math.abs(value))}`);
      }
      if (row.action === "adjustment") return say(`adjusted ${possessive(shop)} dues by ${signed(value)}${reason}`);
      break;
    }
    case "bank_account":
      switch (row.action) {
        case "add":
          return say(`added ${thing("bank account")}`);
        case "edit":
          return say(`edited ${thing("bank account")}`);
        case "switch_off":
          return say(`switched off ${thing("bank account")}`);
        case "switch_on":
          return say(`switched on ${thing("bank account")}`);
        case "delete":
          return say(`deleted ${thing("bank account")}`);
      }
      break;
    case "supplier_entry":
    case "prism_entry": {
      const value = amount ?? 0;
      const ref = s(d.reference);
      // Old "prism_entry" rows have no brand: they were all Prism.
      const supplier = name(d.brandId, row.entity === "prism_entry" ? "Prism" : "the supplier");
      switch (row.action) {
        case "opening":
          return say(`set the ${supplier} opening balance: ${value < 0 ? `${supplier} owes us` : "we owe"} ${rs(Math.abs(value))}`);
        case "purchase":
          return say(`recorded a purchase of ${rs(value)} from ${supplier}${s(d.note) ? ` (${s(d.note)})` : ""}`);
        case "payment":
          return say(`paid ${supplier} ${rs(Math.abs(value))}${s(d.mode) ? ` by ${s(d.mode)}` : ""}${ref ? ` (${ref})` : ""}`);
        case "credit":
          return say(`recorded a scheme credit of ${rs(Math.abs(value))} from ${supplier}${s(d.note) ? `: ${s(d.note)}` : ""}`);
        case "adjustment":
          return say(`adjusted the ${supplier} account by ${signed(value)}${s(d.note) ? `: ${s(d.note)}` : ""}`);
      }
      break;
    }
    case "user":
      switch (row.action) {
        case "create":
          return say(`added ${thing("user")}`);
        case "update":
          return say(`changed the login of ${self || "a user"}`);
        case "rename": {
          const after = d.after && typeof d.after === "object" ? s((d.after as Record<string, unknown>).name) : "";
          return say(`changed their name${after ? ` to ${after}` : ""}`);
        }
        case "delete":
          return say(`removed ${thing("user")}`);
        case "activate":
        case "deactivate":
          return switched("user");
      }
      break;
    case "retailer":
      switch (row.action) {
        case "create":
          return say(`added ${thing("retailer")}`);
        case "update":
          if (d.salesRepId !== undefined) return say(`changed the sales person of ${self || "a shop"}`);
          return say(`edited ${thing("retailer")}`);
        case "link": {
          const after = d.after && typeof d.after === "object" ? (d.after as Record<string, unknown>).userId : null;
          return say(after ? `linked a login to ${self || "a shop"}` : `unlinked the login of ${self || "a shop"}`);
        }
        case "credit_change":
          return say(`changed the credit terms of ${self || "a shop"}${reason}`);
        case "assign_sales_rep": {
          const rep = d.salesRepId && typeof d.salesRepId === "object" ? (d.salesRepId as Record<string, unknown>).after : null;
          return say(
            rep
              ? `made ${name(rep, "someone")} the sales person of ${self || "a shop"}`
              : `removed the sales person of ${self || "a shop"}`,
          );
        }
        case "activate":
        case "deactivate":
          return switched("retailer");
      }
      break;
    case "brand":
      if (row.action === "create") return say(`added ${thing("brand")}`);
      if (row.action === "rename") return say(`renamed brand ${s(d.from)} to ${s(d.to)}`);
      if (row.action === "activate" || row.action === "deactivate") return switched("brand");
      break;
    case "godown":
    case "area":
    case "product":
    case "vehicle": {
      const word = row.entity === "vehicle" ? "truck" : row.entity;
      if (row.action === "create") return say(`added ${thing(word)}`);
      if (row.action === "update") return say(`edited ${thing(word)}`);
      if (row.action === "activate" || row.action === "deactivate") return switched(word);
      break;
    }
    case "report":
      if (row.action === "export") {
        const from = s(d.from);
        const to = s(d.to);
        const which = s(d.report) || row.entityId;
        return say(`exported ${which ? `the ${which}` : "a"} report${from && to ? ` (${from} to ${to})` : ""}`);
      }
      break;
    case "cement_type":
    case "grade": {
      const word = row.entity === "grade" ? "grade" : "type";
      if (row.action === "create") {
        const label = [s(d.type), s(d.code), s(d.name)].filter(Boolean).join(" ");
        return say(`added ${word} ${label || self}`.trim());
      }
      if (row.action === "rename") return say(`renamed ${word} ${s(d.from)} to ${s(d.to)}`);
      if (row.action === "activate" || row.action === "deactivate") return switched(word);
      break;
    }
  }
  return say(`${row.action.replace(/_/g, " ")} ${row.entity.replace(/_/g, " ")}`);
}
