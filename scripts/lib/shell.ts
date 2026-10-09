import { execFileSync } from "node:child_process";
import { createServer } from "node:net";

/** Runs a command and returns what it printed. Throws if it fails. */
export function run(command: string, args: string[], options: { cwd?: string } = {}): string {
  return execFileSync(command, args, { cwd: options.cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Runs a command with its output shown live in the terminal. Throws if it fails. */
export function runVisible(command: string, args: string[], options: { cwd?: string } = {}): void {
  execFileSync(command, args, { cwd: options.cwd, stdio: "inherit" });
}

/** Stops with a clear message if a tool is not installed. */
export function requireTool(command: string, installHint: string): void {
  try {
    run(command, ["--version"]);
  } catch {
    throw new Error(`"${command}" is not installed or not working. ${installHint}`);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when nothing on this computer is listening on `port`. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen(port, "0.0.0.0");
  });
}

/** First port from `start` that nothing on this computer is using (`taken` = also skip these). */
export async function findFreePort(start: number, taken: Set<number> = new Set(), tries = 100): Promise<number> {
  for (let port = start; port < start + tries; port++) {
    if (!taken.has(port) && (await isPortFree(port))) return port;
  }
  throw new Error(`No free port found between ${start} and ${start + tries - 1}.`);
}
