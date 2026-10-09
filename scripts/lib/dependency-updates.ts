/**
 * Plain rules for the weekly dependency updates (scripts/update-deps.ts).
 * No network: easy to test.
 *
 * Safe updates only: bug fixes and new features within the same major version
 * (for 0.x packages, the same minor version, because those may break on every minor).
 * Bigger upgrades are listed for a human (or Claude) to do with care.
 */

type Version = [number, number, number];

/** A plain release version such as 1.7.9. Pre-releases (1.8.0-beta.1) return null. */
export function parseVersion(text: string): Version | null {
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** True for a version pinned exactly in package.json, e.g. "16.3.8" (not "^16.3.8"). */
export function isExactPin(spec: string): boolean {
  return parseVersion(spec) !== null;
}

/** The version a package.json spec starts from: "^4" → 4.0.0, "~1.2" → 1.2.0, "16.3.8" → 16.3.8. */
export function baseVersion(spec: string): Version | null {
  const match = spec.match(/^[\^~]?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : null;
}

/** Released versions old enough to install (pnpm refuses versions newer than its minimumReleaseAge). */
function releasedVersions(publishTimes: Record<string, string>, now: Date, minAgeHours: number): Version[] {
  const latestAllowed = now.getTime() - minAgeHours * 3_600_000;
  return Object.entries(publishTimes)
    .filter(([, time]) => new Date(time).getTime() <= latestAllowed)
    .map(([version]) => parseVersion(version))
    .filter((v): v is Version => v !== null);
}

/**
 * The newest safe update for an exactly pinned version, or null when there is none.
 * `publishTimes` is `pnpm view <package> time --json`: { "1.7.9": "2026-10-01T…", … }.
 */
export function pickSafeUpdate(
  current: string,
  publishTimes: Record<string, string>,
  now: Date,
  minAgeHours = 24,
): string | null {
  const from = parseVersion(current);
  if (!from) return null;
  const sameLine = (v: Version) => v[0] === from[0] && (from[0] !== 0 || v[1] === from[1]);
  const best = releasedVersions(publishTimes, now, minAgeHours)
    .filter((v) => sameLine(v) && compare(v, from) > 0)
    .sort(compare)
    .at(-1);
  return best ? best.join(".") : null;
}

/** The newest version that is a bigger (breaking) upgrade, or null. Only reported, never installed. */
export function pickBigUpgrade(spec: string, publishTimes: Record<string, string>, now: Date, minAgeHours = 24): string | null {
  const from = baseVersion(spec);
  if (!from) return null;
  const isBigger = (v: Version) => v[0] > from[0] || (from[0] === 0 && v[0] === 0 && v[1] > from[1]);
  const best = releasedVersions(publishTimes, now, minAgeHours).filter(isBigger).sort(compare).at(-1);
  return best ? best.join(".") : null;
}

/** Which package.json entries changed: "name: old → new". */
export function describeChanges(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(after)
    .filter((name) => before[name] !== undefined && before[name] !== after[name])
    .sort()
    .map((name) => `${name}: ${before[name]} → ${after[name]}`);
}
