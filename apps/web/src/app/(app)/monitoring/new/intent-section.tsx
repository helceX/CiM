"use client";

import { Checkbox } from "@cim/ui";
import { FOCUS_OPTIONS, SIGNAL_GOALS, type FocusLevel, type GoalKey } from "@cim/core";
import { ChipInput } from "./chip-input";

export type NotifyMode = "none" | "important" | "every";
export type NotifyChoice = { mode: NotifyMode; email: boolean };

const NOTIFY_OPTIONS: { mode: NotifyMode; label: string; description: string }[] = [
  { mode: "none", label: "I’ll look myself", description: "No alerts. The daily digest still arrives by e-mail." },
  { mode: "important", label: "Tell me about important stories", description: "An alert when a story that matters appears — not for every mention." },
  { mode: "every", label: "Tell me about every new story", description: "An alert for each batch of new stories. Expect more of them." },
];

const GOAL_CARDS = SIGNAL_GOALS.filter((goal) => goal.key !== "coverage");

function RadioCard({
  name,
  checked,
  onSelect,
  label,
  description,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
      }`}
    >
      <input type="radio" name={name} className="mt-1" checked={checked} onChange={onSelect} />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

/**
 * Keywords decide which stories match; these three questions decide which of them matter, and how much of
 * the rest to put in front of the person (docs/product/SIGNAL_AND_INTENT.md). Every answer changes
 * something real, and the section says what.
 */
export function IntentSection({
  goals,
  onGoalsChange,
  signalWords,
  onSignalWordsChange,
  focus,
  onFocusChange,
  notify,
  onNotifyChange,
}: {
  goals: GoalKey[];
  onGoalsChange: (next: GoalKey[]) => void;
  signalWords: string[];
  onSignalWordsChange: (next: string[]) => void;
  focus: FocusLevel;
  onFocusChange: (next: FocusLevel) => void;
  /** Set only when creating: editing a monitoring leaves its alert rules alone (they live in Alerts). */
  notify?: NotifyChoice;
  onNotifyChange?: (next: NotifyChoice) => void;
}) {
  function toggleGoal(goal: GoalKey) {
    onGoalsChange(goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal]);
  }

  return (
    <section aria-labelledby="intent-heading" className="flex flex-col gap-5 rounded-lg border border-border p-4">
      <div>
        <h2 id="intent-heading" className="text-sm font-semibold text-foreground">
          What matters to you?
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Keywords decide which stories this monitoring finds. These choices decide which of them to put first — nothing is
          ever deleted, and every story says why you are seeing it.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">What are you looking for?</legend>
        <p className="text-xs text-muted-foreground">
          Pick any. Stories that also use these words rank above the ones that only name what you track.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GOAL_CARDS.map((goal) => {
            const checked = goals.includes(goal.key);
            return (
              <label
                key={goal.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleGoal(goal.key)}
                  className="mt-0.5"
                  aria-label={goal.label}
                  aria-describedby={`goal-${goal.key}-hint`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{goal.label}</span>
                  <span id={`goal-${goal.key}-hint`} className="block text-xs text-muted-foreground">
                    {goal.description}
                  </span>
                  <span aria-hidden="true" className="mt-1 block truncate text-[11px] text-muted-foreground/80">
                    e.g. {goal.words.slice(0, 5).join(", ")}…
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <ChipInput
          label="Your own signal words"
          values={signalWords}
          onChange={onSignalWordsChange}
          placeholder="e.g. Q3 results, lisans, tender"
          hint="Words that make a story matter to you in particular. Same whole-word rules as keywords; up to 20."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">How much do you want to see?</legend>
        <div className="flex flex-col gap-2">
          {FOCUS_OPTIONS.map((option) => (
            <RadioCard
              key={option.key}
              name="focus"
              checked={focus === option.key}
              onSelect={() => onFocusChange(option.key)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Folded stories stay in this monitoring and in your archive; Mentions shows how many are folded and opens them in
          one click.
        </p>
      </fieldset>

      {notify && onNotifyChange ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">How should we tell you?</legend>
          <div className="flex flex-col gap-2">
            {NOTIFY_OPTIONS.map((option) => (
              <RadioCard
                key={option.mode}
                name="notify"
                checked={notify.mode === option.mode}
                onSelect={() => onNotifyChange({ ...notify, mode: option.mode })}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
          <label className={`flex items-center gap-2 text-sm ${notify.mode === "none" ? "text-muted-foreground" : "text-foreground"}`}>
            <Checkbox
              checked={notify.email && notify.mode !== "none"}
              disabled={notify.mode === "none"}
              onCheckedChange={(checked) => onNotifyChange({ ...notify, email: checked === true })}
            />
            Also send an e-mail
          </label>
          <p className="text-xs text-muted-foreground">
            This creates a normal alert rule. Alerts reach everyone in the organization; change or pause it any time in Alerts.
          </p>
        </fieldset>
      ) : null}
    </section>
  );
}
