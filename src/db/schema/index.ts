// Every table lives in a file in this folder and is re-exported here.
// After changing a table run `pnpm db:generate` to create a migration in /drizzle.
export * from "./auth";
export * from "./catalogue";
export * from "./retailers";
export * from "./vehicles";
export * from "./orders";
export * from "./notifications";
export * from "./stock";
export * from "./dispatches";
export * from "./ledger";
export * from "./receipts";
export * from "./audit";
