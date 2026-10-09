# Opportunity Radar — Phase 1

Opportunity Radar reuses Mediaory's existing tenant-scoped Mentions and
publisher sources. It does not search grant directories independently and
does not claim that a story is an open or eligible program.

## What the first version does

- Keeps one private organization profile with organization type, sector and
  stage, operating regions, sectors, technologies, themes, opportunity types,
  eligibility constraints, and preferred source languages.
- Shows only non-archived Mentions from active monitorings whose stored signal
  reasons include the existing `opportunity` goal.
- Explains profile overlap deterministically using exact, Turkish-aware
  keyword matching over the stored headline and permitted stored excerpt.
- Shows the publisher/source, original article URL, publication date when
  supplied, and when Mediaory observed the Mention.
- Lets active organization members record follow-up status, assignee, target
  date, internal note, and whether a team member checked the publisher page.
- Writes profile and follow-up changes to the organization audit log.

## Evidence and privacy rules

The overlap score is the fraction of distinct profile terms present in the
stored title or excerpt. It is not a probability, ranking supplied by a
grant-maker, or eligibility decision. Profile region, organization type,
constraints are review context; preferred languages narrow known-language
results while articles with unknown language remain visible. The app does not
infer official eligibility from profile fields. Amounts, application windows, deadlines, and
availability must be checked on the publisher page. Missing dates remain
unknown.

Profiles and follow-ups are tenant-owned. Repository methods take the
session-derived organization ID, follow-up writes verify that the Mention and
assignee belong to that organization, and the database composite foreign key
prevents attaching a Mention from another organization. Article details link
to the recorded publisher source; the system does not copy publisher content
beyond the source's existing storage policy.

Phase 1 excludes crawling grant directories, AI eligibility claims, generated
deadlines or amounts, automatic application drafting, reminders, and external
opportunity APIs. Those need separate source evidence, retention, and product
decisions.
