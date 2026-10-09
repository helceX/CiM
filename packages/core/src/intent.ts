/**
 * What a person wants from a monitoring, beyond its keywords (docs/product/SIGNAL_AND_INTENT.md).
 *
 * Keywords decide which stories MATCH. The intent decides which of them MATTER: what the person is
 * looking for (so a story that also says "lawsuit" or "grant" ranks above one that only names the brand),
 * and how much they want to see without asking. Nothing is ever deleted because of it: stories below the
 * chosen focus stay in the monitoring, one click away.
 */

/** What a person is looking for. "coverage" alone means every story that names what is tracked. */
export const GOAL_KEYS = ["coverage", "risk", "opportunity", "competitor", "policy", "trend"] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

/** How much to show without asking: only what matters, a balanced feed, or everything. */
export const FOCUS_LEVELS = ["essentials", "balanced", "everything"] as const;
export type FocusLevel = (typeof FOCUS_LEVELS)[number];

export type MonitoringIntent = {
  /** At least one. Several goals add up: a story can be both a risk and an opportunity. */
  goals: GoalKey[];
  focus: FocusLevel;
  /** The person's own words that make a story matter (max 20), on top of the goals' words. */
  signalWords: string[];
};

export const MAX_SIGNAL_WORDS = 20;
export const MAX_SIGNAL_WORD_LENGTH = 60;

/** How important a story is for this monitoring. Stored as `mentions.priority`. */
export type SignalLevel = "low" | "normal" | "high";

const GOAL_SET: ReadonlySet<string> = new Set(GOAL_KEYS);
const FOCUS_SET: ReadonlySet<string> = new Set(FOCUS_LEVELS);

/**
 * A clean intent from whatever was sent or stored (a request body, a JSON column), or undefined when
 * there is none. Unknown goals are dropped, a missing goal list means plain coverage, a missing focus is
 * the balanced default, words are trimmed, de-duplicated and capped.
 */
export function normalizeIntent(value: unknown): MonitoringIntent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;

  const goals: GoalKey[] = [];
  if (Array.isArray(raw.goals)) {
    for (const goal of raw.goals) {
      if (typeof goal === "string" && GOAL_SET.has(goal) && !goals.includes(goal as GoalKey)) goals.push(goal as GoalKey);
    }
  }
  const focus = typeof raw.focus === "string" && FOCUS_SET.has(raw.focus) ? (raw.focus as FocusLevel) : "balanced";

  const signalWords: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.signalWords)) {
    for (const word of raw.signalWords) {
      if (typeof word !== "string") continue;
      const trimmed = word.replace(/\s+/g, " ").trim();
      const key = trimmed.toLocaleLowerCase("tr-TR");
      if (!trimmed || trimmed.length > MAX_SIGNAL_WORD_LENGTH || seen.has(key)) continue;
      seen.add(key);
      signalWords.push(trimmed);
      if (signalWords.length >= MAX_SIGNAL_WORDS) break;
    }
  }

  return { goals: goals.length > 0 ? goals : ["coverage"], focus, signalWords };
}

const RANK: Record<string, number> = { low: 1, normal: 2, high: 3, critical: 4 };

/** low 1 · normal 2 · high 3 · critical 4 (the same order the database ranks `mentions.priority` in). */
export function priorityRank(priority: string | null | undefined): number {
  return RANK[priority ?? ""] ?? 0;
}

/** The lowest rank a story needs to be shown without asking. A monitoring with no intent shows everything. */
export function focusFloor(focus: FocusLevel | null | undefined): number {
  return focus === "essentials" ? RANK.high! : focus === "balanced" ? RANK.normal! : 0;
}

/** Whether a story of this priority is shown, rather than folded away, at this focus. */
export function visibleAtFocus(priority: string | null | undefined, focus: FocusLevel | null | undefined): boolean {
  return priorityRank(priority) >= focusFloor(focus);
}

export const FOCUS_OPTIONS: readonly { key: FocusLevel; label: string; description: string }[] = [
  {
    key: "essentials",
    label: "Only what matters",
    description: "Important stories only. Everything else stays one click away.",
  },
  {
    key: "balanced",
    label: "Balanced",
    description: "Important stories and ones worth a look. Passing mentions are folded away.",
  },
  {
    key: "everything",
    label: "Everything",
    description: "Every story that matches, with the most important first.",
  },
];
