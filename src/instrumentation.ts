// Runs once when the Next.js server starts (not during `next build`).
// Importing env validates every environment variable up front. If one is
// missing we exit, because Next.js would otherwise keep a broken server running.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/dns-patch");
      await import("@/env");
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      console.error("Refusing to start. Fix the environment variables above.");
      process.exit(1);
    }
  }
}
