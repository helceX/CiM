import { db, getDatabaseSizeBytes, scoreUnscoredMentions, type Db } from "@cim/db";

/** Mentions scored per batch, and batches per run: a run is a few seconds, the schedule repeats it. */
const BATCH = 500;
const MAX_BATCHES = 10;
/**
 * Rescoring rewrites rows (every update leaves a dead version until vacuum). Past this share of the Postgres
 * volume (`DB_VOLUME_MB`) the job waits instead of adding to a disk that is filling; stories arriving meanwhile
 * are still scored at ingest, so nothing new goes unranked.
 */
export const DB_VOLUME_PAUSE_SHARE = 0.85;

export type ScoreSignalsDeps = {
  env?: Record<string, string | undefined>;
  database?: Db;
  /** The database size in bytes (replaceable in tests). */
  sizeBytes?: () => Promise<number>;
};

/**
 * Gives every mention a signal (how much it matters to its monitoring, and why — see @cim/core scoreSignal):
 * the ones saved before signals existed, and the ones of a monitoring that was just edited. Newest first, so
 * what people look at is scored first. Nothing to do once caught up — a cheap indexed look at an empty list.
 * Stands down while the database is nearly filling its volume.
 */
export async function processScoreSignalsJob(deps: ScoreSignalsDeps = {}): Promise<{ scored: number; note: string | null }> {
  const database = deps.database ?? db;
  const volumeMb = Number((deps.env ?? process.env).DB_VOLUME_MB);
  if (volumeMb > 0) {
    const sizeMb = (await (deps.sizeBytes ?? (() => getDatabaseSizeBytes(database)))()) / 1_048_576;
    if (sizeMb > volumeMb * DB_VOLUME_PAUSE_SHARE) {
      const note = `The database uses ${Math.round(sizeMb)} MB of a ${volumeMb} MB volume (over ${Math.round(DB_VOLUME_PAUSE_SHARE * 100)}%) — rescoring is paused until there is room.`;
      console.warn(`[score-signals] ${note}`);
      return { scored: 0, note };
    }
  }

  let scored = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const done = await scoreUnscoredMentions(database, { limit: BATCH });
    scored += done;
    if (done < BATCH) break;
  }
  if (scored > 0) console.log(`[score-signals] scored ${scored} mention(s)`);
  return { scored, note: null };
}
