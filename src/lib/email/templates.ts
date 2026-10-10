import type { EmailMessage } from "./index";

// Plain, dependency-free templates. Keep the text version: some inboxes only show text.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function linkEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro: string;
}): EmailMessage {
  const url = escapeHtml(opts.url);
  return {
    to: opts.to,
    subject: opts.subject,
    text: `${opts.intro}\n\n${opts.url}\n\n${opts.outro}`,
    html: `<p>${escapeHtml(opts.intro)}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(opts.buttonLabel)}</a></p>
<p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${url}</p>
<p style="color:#666;font-size:13px">${escapeHtml(opts.outro)}</p>`,
  };
}

export function verifyEmailMessage(to: string, url: string): EmailMessage {
  return linkEmail({
    to,
    subject: "Verify your email address",
    intro: "Please confirm your email address to finish setting up your account.",
    buttonLabel: "Verify email",
    url,
    outro: "If you did not create an account, you can ignore this email.",
  });
}

export function resetPasswordMessage(to: string, url: string): EmailMessage {
  return linkEmail({
    to,
    subject: "Reset your password",
    intro: "Someone (hopefully you) asked to reset your password.",
    buttonLabel: "Choose a new password",
    url,
    outro: "If you did not ask for this, you can ignore this email. Your password will not change.",
  });
}

export function existingAccountMessage(to: string, signInUrl: string): EmailMessage {
  return {
    to,
    subject: "Someone tried to sign up with your email",
    text: `Someone tried to create an account with this email address, but you already have one.\n\nSign in here: ${signInUrl}\n\nIf this was not you, you can ignore this email.`,
  };
}

/**
 * Sent when an admin creates an account. With `withPassword` the admin set a temporary password
 * and tells it to the user themselves: it is never put in an email.
 */
export function accountCreatedMessage(to: string, name: string, signInUrl: string, withPassword = false): EmailMessage {
  const next = withPassword
    ? "Your admin will give you a temporary password. Sign in with it, then change it under Account → Change password."
    : "You will get a separate email with a link to choose your password.";
  const signIn = withPassword ? "Sign in here" : "Sign in here once that is done";
  return {
    to,
    subject: "Your account is ready",
    text: `Hi ${name},\n\nAn account was created for you. ${next}\n\n${signIn}: ${signInUrl}`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>An account was created for you. ${escapeHtml(next)}</p><p><a href="${escapeHtml(signInUrl)}">Sign in</a>${withPassword ? "" : " once that is done"}.</p>`,
  };
}
