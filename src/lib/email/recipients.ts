export type EmailMode = "log" | "allowlist" | "live";

export type DeliveryPlan =
  | { action: "log"; recipients: string[] }
  | { action: "send"; recipients: string[]; blocked: string[] }
  | { action: "skip"; blocked: string[] };

/**
 * Decides what happens to an email based on EMAIL_MODE:
 * - "log":       never send, just print it to the console.
 * - "allowlist": send only to addresses in EMAIL_ALLOWLIST; drop the rest.
 * - "live":      send to everyone.
 */
export function planDelivery(
  mode: EmailMode,
  to: string | string[],
  allowlist: string[],
): DeliveryPlan {
  const recipients = (Array.isArray(to) ? to : [to]).map((email) => email.trim().toLowerCase());

  if (mode === "log") return { action: "log", recipients };
  if (mode === "live") return { action: "send", recipients, blocked: [] };

  const allowed = new Set(allowlist.map((email) => email.trim().toLowerCase()));
  const permitted = recipients.filter((email) => allowed.has(email));
  const blocked = recipients.filter((email) => !allowed.has(email));
  if (permitted.length === 0) return { action: "skip", blocked };
  return { action: "send", recipients: permitted, blocked };
}
