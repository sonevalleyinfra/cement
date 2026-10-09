// Every table lives in a file in this folder and is re-exported here.
// After changing a table run `pnpm db:generate` to create a migration in /drizzle.
export * from "./auth";
export * from "./firms";
export * from "./retailers";
export * from "./vehicles";
export * from "./orders";
