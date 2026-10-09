# Signal and intent — from "everything that matches" to "what matters"

## The problem

Keywords decide which stories **match** a monitoring. Nothing decided which of them **matter**. A world-wide
monitoring on a common word returns hundreds of stories a day, every one looking the same, so people stop
reading — or read only what the dashboard happens to put on top.

Two findings from reading the code before changing anything:

1. `mentions.priority` existed (`low | normal | high | critical`) and fed alerts, the digest, the dashboard and
   reports — but the pipeline only ever set it to `high` when an *exact phrase* was in the headline, otherwise
   `normal`. Almost everything was `normal`, so the signal carried no information.
2. Onboarding asks "How should we notify you?" (instant / high priority only / daily digest / weekly summary)
   and then **recorded the answer in the audit log and did nothing with it**. A user who chose "instant" never
   received a notification, because notifications only come from alert rules and none was created. Saving a
   monitoring afterwards also created none.

## What a story now carries

Every mention has three derived fields (migration `0043`):

| Field | Meaning |
|---|---|
| `priority` | the level: `high` ("Important"), `normal` ("Worth a look"), `low` ("Passing mention"). `critical` is reserved. |
| `signal_score` | an ordering key inside a level — not a percentage |
| `signal_reasons` | the plain facts behind both, as codes the UI turns into sentences |

`null` reasons mean "not scored yet" (a mention saved before this existed, or one whose monitoring was just edited);
the scoring job fills them in, newest first.

### How the score is made (`@cim/core` `signal.ts`)

Deterministic. No model, no AI key, no per-story cost, and every point can be traced to a sentence:

| Factor | Points | Reason shown |
|---|---|---|
| Tracked words in the **headline** — a name (company, brand, product, person, competitor, campaign) | 55 | "The headline names “X”" |
| … the same for a **topic** or industry (a subject, not a thing) | 32 | same |
| Only in the **opening lines** (first 200 characters, the stretch the product stores) — name / topic | 32 / 14 | "The opening lines name “X”" |
| Only deeper in the story (found by the word fingerprint) | 8 | "Found deeper in the story" |
| An exact company name or exact phrase matched | +8 | "Exact match on “X”" |
| Several *different* things tracked appear (two names of one thing, or word forms of one word, count once) | +7 each, max 14 | "Touches N of the things you track" |
| Words that point at a **chosen goal** (below) — in the headline / in the text | +12 / +7 each, max 24 per goal, 36 in all | "Risks & crises: “lawsuit” in the headline" |
| Published by a news outlet (news, agency, newspaper, magazine) | +6 | "Published by a news outlet" |
| Carried by 3+ / 6+ outlets (story clusters) | +10 / +18 | "Reported by N outlets" |

Levels: **high ≥ 60**, **normal ≥ 30**, otherwise low. A name in the headline of a news outlet is therefore
important by itself; a topic word in a headline is worth a look; the same word only in the lead is a passing
mention — until goals or reach lift it. The constants live at the top of `signal.ts`; the tests pin the
scenarios, so a tuning change shows up as a failing expectation, not a silent drift.

A story that starts alone and is picked up by more outlets **climbs**: when a story joins a cluster of three or
more outlets, every scored mention of that story recomputes its reach (`applyCoverageToCluster`). It is
recomputed, never added to, so it is safe to repeat.

## What a monitoring now asks

Stored in the query AST (`QueryAst.intent`, like `company` and `aliasGroups` before it — no column needed):

```ts
{ goals: ("coverage" | "risk" | "opportunity" | "competitor" | "policy" | "trend")[],
  focus: "essentials" | "balanced" | "everything",
  signalWords: string[] }   // the person's own words, max 20
```

| Question | Answer | What the system does |
|---|---|---|
| What are you looking for? | goals | A story that also uses a goal's words ranks above one that only names the thing. The word lists are public (`signal-goals.ts`, Turkish and English) and shown in the form. |
| What matters to you in particular? | signal words | Same, for the person's own words ("Q3 results", "lisans"). |
| How much do you want to see? | focus | Only what matters = `high`; Balanced = `high` + `normal`; Everything = all. Stories below the focus are **folded, not deleted** — one click shows them. |
| How should we tell you? | notify | "Important stories" creates a high-relevance alert rule; "Every new story" a keyword rule; in-app, plus e-mail when asked. It appears in Alerts like any rule. |

A monitoring saved before this existed has no intent: it shows everything, as before — but its stories are now ranked and
explained like any other (the scoring job gives them their signals), and its card offers to choose what matters.

Matching is untouched: intent never changes **which** stories a monitoring holds, only how they are ordered and
what is shown first. That keeps the evidence archive complete.

## Where a person sees it

| Place | What changed |
|---|---|
| **New / edit monitoring** | "What matters to you?": what are you looking for (goals + own words), how much do you want to see (focus), and — when creating — how should we tell you. The preview then splits the matches into important / worth a look / passing mentions for *those* choices and shows what ranks highest and why, before anything is saved. |
| **Mentions → by day** | Each day says how many stories are important. Inside a monitoring the stories are ranked (most important first), every one carries "Why you see this: …", the stories below the monitoring's focus are folded under "N more stories folded away" (counted, one click to open, or "Show every story" for all), and the same story from several outlets is one row with "Also reported by N other outlets". When a busy day does not fit, the stories kept are the most important, then the newest. |
| **Mentions → list** | The reason under every headline; one **Importance** filter (important only / worth a look and up / passing mentions only) replaces the old Priority one. |
| **Story drawer** | "Why you are seeing this": the level and every reason in plain language, and — for a story that matters — what to do next for what the monitoring looks for (risks: tag "Needs response" / assign to me; opportunities: tag "Opportunity" / assign; competitor, policy, research: a tag). Uses the tags and assignment that already exist. |
| **Alerts** | A *high-relevance* rule now fires for stories that are important by this definition (a name in a news headline, a goal word, wide coverage …), not only for an exact phrase. The alert e-mail and webhook list the stories with the reason each ranks — readable without opening the app. |
| **Daily digest** | Leads with how many of the day's mentions are important, lists the most important first, each with its reason. |
| **Monitoring list** | Each card says what it looks for and how much it shows; a monitoring saved before this existed says "Shows every story" and offers to choose. |
| **Onboarding** | "How should we notify you?" is no longer ignored: "every new story" and "important stories only" create an alert rule for the first monitoring (the default is important stories only); the digest and weekly-archive options need no rule — those e-mails reach everyone. |

## How it stays current

- **New stories**: scored at ingest with the monitoring's own intent.
- **Backfill** (saving or editing a monitoring): the same function scores the stories it picks up.
- **Editing a monitoring** clears its old signals and rescoring starts immediately for the newest 1,500; the
  `score_signals` job (every 2 minutes, 500 × up to 10 per run) does the rest and also the mentions that predate
  signals. When nothing is unscored it is one indexed look at an empty list (`mentions_unscored_idx`).
  Rescoring rewrites rows, so on a database that is nearly full it waits: with `DB_VOLUME_MB` set (the same
  variable the catalog import and the pruning use) the job pauses past 85% of the volume and logs why; stories
  arriving meanwhile are still scored at ingest. Without the variable it runs.
- **Reach**: see above.

## Calibration

The weights are a first, reasoned set — not fitted to production data, which the development environment cannot
see. Check the distribution after the job has caught up:

```sql
select priority, count(*), round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from mentions where signal_reasons is not null group by 1 order by 1;
```

A healthy spread for a name-tracking monitoring is a small `high` slice (single-digit to low double-digit
percent), most `normal`, a visible `low` tail. If `high` is a third of everything, raise `HIGH_AT`; if nothing is
ever `high`, lower the headline weight. Change the constants in one place and the scenarios in `signal.test.ts`
show exactly what moved.

## What it deliberately does not do (yet)

- **Learn from feedback.** "Relevant / irrelevant" on a mention is stored but does not feed back. The natural
  next step is per-monitoring mute (a source, a word) from "irrelevant".
- **Use sentiment.** AI sentiment arrives later and asynchronously; re-scoring on it (negative + risk goal) is a
  follow-up, and only where an AI key is configured.
- **Personalise per person.** Focus and alerts are per monitoring and per organization, like the rest.
- **Rank by outlet reach.** There is no audience data per outlet; "news outlet" and "how many outlets" are the
  honest proxies available.
