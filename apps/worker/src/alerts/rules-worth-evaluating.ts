import { db, listRuleIdsInCooldown } from "@cim/db";

/**
 * Trims the list of rules an evaluator is about to go through, before any per-rule statistics are computed:
 *
 *  - rules still inside their cooldown cannot fire (createAlertEventIfNotInCooldown would refuse them), so they are
 *    not evaluated at all — until now a rule in the middle of a spike was re-evaluated, and its alert transaction
 *    opened and refused, every minute for the whole cooldown;
 *  - rules whose query is below the evaluator's own volume floor cannot trigger either (the evaluator `continue`s on
 *    that very condition), so one grouped read replaces one statistics query per rule.
 *
 * Both are shortcuts to the same outcome: the locked cooldown check in createAlertEventIfNotInCooldown and the
 * evaluator's own thresholds are untouched. If a shortcut query fails the full list is returned, i.e. the previous
 * behaviour — an optimisation must never hide an alert.
 */
export async function rulesWorthEvaluating<T extends { id: string; queryId: string }>(
  rules: T[],
  queriesWithVolume: (queryIds: string[]) => Promise<Set<string>>,
  label: string,
): Promise<T[]> {
  if (rules.length === 0) return rules;
  try {
    const cooling = await listRuleIdsInCooldown(db, rules.map((rule) => rule.id));
    const ready = rules.filter((rule) => !cooling.has(rule.id));
    if (ready.length === 0) return ready;
    const withVolume = await queriesWithVolume([...new Set(ready.map((rule) => rule.queryId))]);
    return ready.filter((rule) => withVolume.has(rule.queryId));
  } catch (error) {
    console.error(`[worker] ${label}: could not pre-filter rules, evaluating all of them:`, error);
    return rules;
  }
}
