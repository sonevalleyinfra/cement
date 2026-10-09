/**
 * Tiny client for the Coolify API (https://coolify.io/docs/api-reference).
 *
 * Reads two files on YOUR computer (never committed to git):
 *   ~/.config/coolify/coolify_url.txt    e.g. https://coolify.example.com
 *   ~/.config/coolify/coolify_token.txt  an API token from Coolify → Keys & Tokens → API tokens,
 *                                        with the "write" and "deploy" permissions
 *   ~/.config/coolify/resend_api_key.txt optional: a Resend API key, so launched apps send real email
 *   ~/.config/coolify/email_domain.txt   optional: the domain verified in Resend, e.g. mail.example.com
 * Delete the token in Coolify at any time to switch this off.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(homedir(), ".config", "coolify");

function readConfigFile(fileName: string, help: string): string {
  const file = path.join(CONFIG_DIR, fileName);
  try {
    const value = readFileSync(file, "utf8").trim();
    if (value) return value;
  } catch {
    // Handled below.
  }
  throw new Error(`Missing ${file}\n  ${help}`);
}

/** Contents of an optional file in ~/.config/coolify/, or undefined if it is missing or empty. */
export function readOptionalConfigFile(fileName: string): string | undefined {
  try {
    return readFileSync(path.join(CONFIG_DIR, fileName), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export type Coolify = {
  baseUrl: string;
  request: <T = unknown>(method: string, apiPath: string, body?: unknown) => Promise<T>;
};

export function connectToCoolify(): Coolify {
  const baseUrl = readConfigFile(
    "coolify_url.txt",
    "Put the address you open Coolify at in it, e.g. https://coolify.example.com",
  ).replace(/\/+$/, "");
  const token = readConfigFile(
    "coolify_token.txt",
    "Create a token in Coolify (Keys & Tokens → API tokens) with write + deploy permissions and paste it in.",
  );

  async function request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}/api/v1${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      const hint =
        response.status === 401
          ? " (the token is wrong or was deleted)"
          : response.status === 403
            ? ' (the token needs the "write" and "deploy" permissions)'
            : "";
      throw new Error(`Coolify ${method} ${apiPath} failed: ${response.status}${hint}\n  ${text.slice(0, 500)}`);
    }
    // Most answers are JSON, but some (like /version) are plain text.
    const isJson = response.headers.get("content-type")?.includes("json");
    return (text && isJson ? JSON.parse(text) : text) as T;
  }

  return { baseUrl, request };
}

/**
 * Like connectToCoolify, but returns undefined when the URL or token file is missing.
 * Used by ship / release / status, which still work without Coolify (with less detail).
 */
export function connectToCoolifyIfSetUp(): Coolify | undefined {
  if (!readOptionalConfigFile("coolify_url.txt") || !readOptionalConfigFile("coolify_token.txt")) return undefined;
  return connectToCoolify();
}
