/**
 * Archive weeks are Monday–Sunday in Türkiye time (UTC+3, no daylight saving since
 * 2016), the same calendar the Mentions page groups days by.
 */
const TURKEY_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export type ArchivePeriod = {
  /** Monday, YYYY-MM-DD */
  start: string;
  /** Sunday, YYYY-MM-DD (inclusive) */
  end: string;
  /** "2026-W40" style label */
  label: string;
};

function isoDay(utcMidnightMs: number): string {
  return new Date(utcMidnightMs).toISOString().slice(0, 10);
}

/** ISO-8601 week label of the week starting on `mondayMs` (a UTC-midnight timestamp of a Monday). */
function weekLabel(mondayMs: number): string {
  const thursday = new Date(mondayMs + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  const firstMonday = jan4 - jan4Dow * DAY_MS;
  const week = Math.floor((mondayMs - firstMonday) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The most recent Monday–Sunday week that has fully ended as of `now`. */
export function lastCompletedWeek(now: Date): ArchivePeriod {
  const local = new Date(now.getTime() + TURKEY_OFFSET_MS);
  const todayMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const dow = (new Date(todayMs).getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = todayMs - dow * DAY_MS;
  const mondayMs = thisMonday - 7 * DAY_MS;
  return { start: isoDay(mondayMs), end: isoDay(mondayMs + 6 * DAY_MS), label: weekLabel(mondayMs) };
}

/** The same label for any YYYY-MM-DD that is a Monday. */
export function periodLabelForStart(start: string): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  return weekLabel(Date.UTC(y, m - 1, d));
}
