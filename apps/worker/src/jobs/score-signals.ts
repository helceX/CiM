import { db, scoreUnscoredMentions } from "@cim/db";

/** Mentions scored per batch, and batches per run: a run is a few seconds, the schedule repeats it. */
const BATCH = 500;
const MAX_BATCHES = 10;

/**
 * Gives every mention a signal (how much it matters to its monitoring, and why — see @cim/core scoreSignal):
 * the ones saved before signals existed, and the ones of a monitoring that was just edited. Newest first, so
 * what people look at is scored first. Nothing to do once caught up — a cheap indexed look at an empty list.
 */
export async function processScoreSignalsJob(): Promise<{ scored: number }> {
  let scored = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const done = await scoreUnscoredMentions(db, { limit: BATCH });
    scored += done;
    if (done < BATCH) break;
  }
  if (scored > 0) console.log(`[score-signals] scored ${scored} mention(s)`);
  return { scored };
}
