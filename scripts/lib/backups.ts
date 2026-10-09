/**
 * Running a database backup now and checking it really worked (used by launch and `pnpm backup`).
 */
import type { Coolify } from "./coolify-api";
import { checkBackup } from "./launch-plan";
import { sleep } from "./shell";

type BackupExecution = { status?: string; message?: string | null };

/** Runs a backup right now and checks it was saved (and copied off-site when S3 is set up). */
export async function runBackupNow(
  coolify: Coolify,
  databaseUuid: string,
  backupUuid: string,
  savesToS3: boolean,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  const executionsPath = `/databases/${databaseUuid}/backups/${backupUuid}/executions`;
  const list = async () =>
    (await coolify.request<{ executions?: BackupExecution[] }>("GET", executionsPath)).executions ?? [];
  const before = (await list()).length;
  await coolify.request("PATCH", `/databases/${databaseUuid}/backups/${backupUuid}`, { backup_now: true });
  for (let attempt = 0; attempt < 36; attempt++) {
    await sleep(5000);
    const executions = await list();
    // Newest first.
    if (executions.length > before && executions[0].status !== "running") return checkBackup(executions[0], savesToS3);
  }
  return { ok: false, problem: "the test backup did not finish within 3 minutes" };
}

