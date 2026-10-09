import { Resend } from "resend";
import { env } from "@/env";
import { planDelivery } from "./recipients";

/**
 * The ONLY way the app sends email. Do not call Resend anywhere else.
 * Behaviour is controlled by EMAIL_MODE (see recipients.ts).
 */

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult =
  | { status: "logged" }
  | { status: "skipped"; blocked: string[] }
  | { status: "sent"; id: string; blocked: string[] };

let resend: Resend | undefined;
function getResend(): Resend {
  resend ??= new Resend(env.RESEND_API_KEY);
  return resend;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const plan = planDelivery(env.EMAIL_MODE, message.to, env.EMAIL_ALLOWLIST);

  if (plan.action === "log") {
    console.info(
      [
        "[email:log] Not sent (EMAIL_MODE=log)",
        `  to:      ${plan.recipients.join(", ")}`,
        `  subject: ${message.subject}`,
        "  ---",
        message.text,
        "  ---",
      ].join("\n"),
    );
    return { status: "logged" };
  }

  if (plan.action === "skip") {
    console.warn(
      `[email:allowlist] Not sent: "${message.subject}" — no recipient is in EMAIL_ALLOWLIST (${plan.blocked.join(", ")})`,
    );
    return { status: "skipped", blocked: plan.blocked };
  }

  if (plan.blocked.length > 0) {
    console.warn(`[email:allowlist] Dropped recipients not in EMAIL_ALLOWLIST: ${plan.blocked.join(", ")}`);
  }

  const { data, error } = await getResend().emails.send({
    from: env.EMAIL_FROM,
    to: plan.recipients,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
  if (error) {
    throw new Error(`Resend failed to send "${message.subject}": ${error.message}`);
  }
  return { status: "sent", id: data.id, blocked: plan.blocked };
}

/**
 * Fire-and-forget version for auth emails. Better Auth recommends not awaiting
 * these (so response timing does not reveal whether an account exists).
 * Errors are logged instead of crashing the request.
 */
export function sendEmailInBackground(message: EmailMessage): void {
  void sendEmail(message).catch((error: unknown) => {
    console.error("[email] Failed to send:", error);
  });
}
