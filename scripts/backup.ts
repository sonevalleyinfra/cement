/**
 * pnpm backup
 *
 * Backs up the production database right now (like "Back up now" in Coolify) and checks it
 * really worked, including the off-site copy. Do this before anything risky: a big database
 * change, a restore, or deleting data.
 */
import { runBackupNow } from "./lib/backups";
import { connectToCoolifyIfSetUp } from "./lib/coolify-api";
import { getRepo } from "./lib/project";

type Database = { uuid: string; name: string };
type BackupConfig = { uuid: string; enabled: boolean; save_s3: boolean };

async function main() {
  const coolify = connectToCoolifyIfSetUp();
  if (!coolify) throw new Error("No Coolify token set up (~/.config/coolify/coolify_token.txt). See docs/GUIDE.md section 5.");
  const repo = getRepo();
  const database = (await coolify.request<Database[]>("GET", "/databases")).find((db) => db.name === `${repo.name}-db`);
  if (!database) throw new Error(`No production database "${repo.name}-db" on Coolify. Is the app launched (pnpm launch)?`);
  const backup = (await coolify.request<BackupConfig[]>("GET", `/databases/${database.uuid}/backups`)).find((b) => b.enabled);
  if (!backup) throw new Error(`${database.name} has no scheduled backup. Add one in Coolify → ${database.name} → Backups.`);

  console.log(`==> Backing up ${database.name} now (takes up to a minute)`);
  const result = await runBackupNow(coolify, database.uuid, backup.uuid, backup.save_s3);
  if (!result.ok) {
    console.log(`!! Backup problem: ${result.problem}\n   Don't do anything risky until this is fixed. Ask Claude: "the backup failed, please check".`);
    process.exit(1);
  }
  console.log(`==> ✓ Backup saved${backup.save_s3 ? " on the server and off-site" : " on the server"}. See it in Coolify → ${database.name} → Backups.`);
}

main().catch((error: unknown) => {
  console.error(`\n[backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
