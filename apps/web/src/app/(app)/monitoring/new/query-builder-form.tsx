"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@cim/ui";
import {
  astToBooleanQuery,
  autoKeywordClusters,
  countryName,
  collapseTypesToCategories,
  conceptKey,
  mergeKeywords,
  parseBooleanQuery,
  parseKeywordList,
  parseKeywordSpec,
  type QueryAst,
} from "@cim/core";
import type { TrackingTarget } from "@cim/validation";
import { TRACKING_TARGET_OPTIONS } from "@/lib/tracking-targets";
import { AliasGroups } from "./alias-groups";
import { RegionPicker } from "./region-picker";

type Project = { id: string; name: string };

/** A saved monitoring being edited. */
export type ExistingMonitoring = {
  id: string;
  projectId: string;
  name: string;
  trackingTarget: string;
  queryAst: QueryAst;
  sourceTypes: string[];
  regionScopes: string[];
  brandGroupId: string | null;
};
type BrandGroupOption = { id: string; name: string };

const SOURCE_CATEGORIES: { value: string; label: string }[] = [
  { value: "news", label: "News" },
  { value: "web", label: "Web" },
  { value: "social", label: "Social" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
  { value: "forums", label: "Forums" },
  { value: "comments", label: "Comments" },
];

type PreviewResult = {
  matchCount: number;
  windowDays: number;
  byCountry?: { code: string | null; count: number }[];
  sample: { title: string; sourceName: string; publishedAt: string | null }[];
  warning: string | null;
  aiAssessment: { text: string; confidence: number; method: string } | null;
};

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const hintId = hint ? `${label.toLowerCase().replace(/\s+/g, "-")}-hint` : undefined;
  const [draft, setDraft] = useState("");

  // One keyword = one comma-separated item (a word or a whole sentence);
  // pasting "a, b, c" adds three chips.
  function add() {
    const additions = parseKeywordList(draft);
    if (additions.length === 0) return;
    onChange(mergeKeywords(values, additions));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => {
            const spec = parseKeywordSpec(value);
            const rule = spec.caseSensitive
              ? "exact capitals, whole word"
              : spec.prefix
                ? "word starts with"
                : null;
            return (
            <li
              key={value}
              title={
                spec.caseSensitive
                  ? "Short all-caps abbreviation: matched as the whole word, with exactly these capitals."
                  : spec.prefix
                    ? "Matches words that start with this (any ending)."
                    : "Matches this word or phrase and its forms: plural, possessive and case endings (girişimci → girişimcilerin, girişimciye; startup → startups)."
              }
              className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground"
            >
              {value}
              {rule ? (
                <span className="rounded-sm bg-background/60 px-1.5 text-[11px] text-muted-foreground">{rule}</span>
              ) : null}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function QueryBuilderForm({
  projects,
  saveBlocked = false,
  existing,
  brandGroups = [],
}: {
  projects: Project[];
  /** The plan's monitoring cap is reached: keywords and preview still work, saving does not. */
  saveBlocked?: boolean;
  /** Set when editing a saved monitoring: the form starts from it and saves with PATCH. */
  existing?: ExistingMonitoring;
  /** Groups a monitoring can be filed under (Settings → Brand groups); used to read results together. */
  brandGroups?: BrandGroupOption[];
}) {
  const router = useRouter();
  const editing = Boolean(existing);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [name, setName] = useState(existing?.name ?? "");
  const [trackingTarget, setTrackingTarget] = useState<TrackingTarget>((existing?.trackingTarget as TrackingTarget | undefined) ?? "company");
  const [projectId, setProjectId] = useState(existing?.projectId ?? projects[0]?.id ?? "");
  const [include, setInclude] = useState<string[]>(existing?.queryAst.include ?? []);
  const [exclude, setExclude] = useState<string[]>(existing?.queryAst.exclude ?? []);
  const [exactPhrases, setExactPhrases] = useState<string[]>(existing?.queryAst.exactPhrases ?? []);
  const [advancedText, setAdvancedText] = useState("");
  const [sourceCategories, setSourceCategories] = useState<string[]>(
    existing ? collapseTypesToCategories(existing.sourceTypes) : ["news", "web"],
  );
  const [regionScopes, setRegionScopes] = useState<string[]>(existing?.regionScopes ?? []);
  const [aliasGroups, setAliasGroups] = useState<string[][]>(existing?.queryAst.aliasGroups ?? []);
  const [companyName, setCompanyName] = useState(existing?.queryAst.company?.name ?? "");
  const [companyShort, setCompanyShort] = useState(existing?.queryAst.company?.short ?? "");
  const [brandGroupId, setBrandGroupId] = useState(existing?.brandGroupId ?? "");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentAst: QueryAst = useMemo(
    () =>
      mode === "simple"
        ? { include, exclude, exactPhrases }
        : parseBooleanQuery(advancedText),
    [mode, include, exclude, exactPhrases, advancedText],
  );

  // Forms of one word (girişimci · girişimcilik · girişimcinin) are read together on their own.
  const autoClusters = useMemo(() => autoKeywordClusters(currentAst.include), [currentAst.include]);

  // A group only counts while its names are still keywords of the monitoring.
  const usableAliasGroups = useMemo(() => {
    const listed = new Set([...currentAst.include, ...currentAst.exactPhrases].map(conceptKey));
    return aliasGroups.map((group) => group.filter((name) => listed.has(conceptKey(name)))).filter((group) => group.length >= 2);
  }, [aliasGroups, currentAst.include, currentAst.exactPhrases]);

  function switchMode(next: "simple" | "advanced") {
    if (next === "advanced") {
      setAdvancedText(astToBooleanQuery({ include, exclude, exactPhrases }));
    } else {
      const parsed = parseBooleanQuery(advancedText);
      setInclude(parsed.include);
      setExclude(parsed.exclude);
      setExactPhrases(parsed.exactPhrases);
    }
    setMode(next);
  }

  function toggleSourceCategory(value: string) {
    setSourceCategories((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  async function handlePreview() {
    setError(null);
    setIsPreviewing(true);
    try {
      const response = await fetch("/api/monitoring/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentAst, regionScopes }),
      });
      if (response.ok) {
        setPreview(await response.json());
      } else {
        setError("Couldn't preview this query. Please try again.");
      }
    } catch {
      setError("Couldn't preview this query. Please try again.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    setError(null);
    setUpgradeUrl(null);
    if (!projectId) {
      setError("No project available — complete onboarding first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(existing ? `/api/monitoring/${existing.id}` : "/api/monitoring", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(existing ? {} : { projectId }),
          name:
            name ||
            currentAst.include[0] ||
            currentAst.exactPhrases[0] ||
            "Untitled monitoring",
          include: currentAst.include,
          exclude: currentAst.exclude,
          exactPhrases: currentAst.exactPhrases,
          aliasGroups: usableAliasGroups,
          sourceTypes: sourceCategories,
          regionScopes,
          trackingTarget,
          company: companyName.trim() ? { name: companyName.trim(), short: companyShort.trim() || undefined } : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (data.code === "plan_limit" && typeof data.upgradeUrl === "string") {
          setUpgradeUrl(`${data.upgradeUrl}#upgrade`);
        }
        return;
      }
      // Filing under a group is a separate, already-existing call.
      if (existing && brandGroupId !== (existing.brandGroupId ?? "")) {
        await fetch("/api/brand-groups/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queryId: existing.id, brandGroupId: brandGroupId || null }),
        }).catch(() => undefined);
      }
      router.push("/monitoring");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Field id="name" label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Brand monitoring"
        />
      </Field>

      <Field id="tracking-target" label="What does this track?" required>
        <Select
          value={trackingTarget}
          onChange={(e) => setTrackingTarget(e.target.value as TrackingTarget)}
        >
          {TRACKING_TARGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <span className="text-sm font-medium text-foreground">Company (optional)</span>
          <p className="text-xs text-muted-foreground">
            The full name and, if it has one, the short name. Both are searched, read as one thing, and the Dashboard
            lists the stories that name your company directly.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field id="company-name" label="Company name">
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. İstanbul Ticaret Odası" />
          </Field>
          <Field id="company-short" label="Short name">
            <Input value={companyShort} onChange={(e) => setCompanyShort(e.target.value)} placeholder="e.g. İTO" disabled={!companyName.trim()} />
          </Field>
        </div>
      </div>

      {projects.length > 1 && !editing ? (
        <Field id="project" label="Project" required>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "simple" ? "primary" : "secondary"}
            onClick={() => switchMode("simple")}
          >
            Simple
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "advanced" ? "primary" : "secondary"}
            onClick={() => switchMode("advanced")}
          >
            Advanced
          </Button>
        </div>

        {mode === "simple" ? (
          <div className="flex flex-col gap-4">
            <ChipInput
              label="Include"
              values={include}
              onChange={setInclude}
              placeholder="e.g. your brand, brand + product name"
              hint="Matched as whole words together with their endings: “girişimci” also finds girişimciler, girişimcinin, girişimciye; “startup” also finds startups and startup's. Apostrophes, hyphens and dots inside a keyword are tolerated (O'Reilly = O’Reilly). A short ALL-CAPS abbreviation keeps its capitals (“AK” ≠ “ak”) and takes only an apostrophe ending (THY'nin). Add * to open a word completely: banka* also finds bankacılık."
            />
            <ChipInput
              label="Exclude"
              values={exclude}
              onChange={setExclude}
              placeholder="e.g. job posting"
              hint="Stories containing these words are left out. Same whole-word rules."
            />
            <ChipInput
              label="Exact phrase"
              values={exactPhrases}
              onChange={setExactPhrases}
              placeholder='e.g. "full company name"'
            />
            <AliasGroups
              terms={[...include, ...exactPhrases]}
              groups={aliasGroups}
              onChange={setAliasGroups}
              onAddTerms={(names) => setInclude((current) => mergeKeywords(current, names))}
            />
            {autoClusters.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-md bg-surface-muted p-3">
                <span className="text-sm font-medium text-foreground">Grouped automatically</span>
                <p className="text-xs text-muted-foreground">
                  Forms of the same word are read under one heading in your results — you do not need to do anything.
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {autoClusters.map((cluster) => (
                    <li key={cluster.join("|")} className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-foreground">{cluster[0]}</strong>
                      <span className="text-muted-foreground">←</span>
                      {cluster.slice(1).map((word) => (
                        <span key={word} className="rounded-sm bg-background px-1.5 py-0.5 text-xs text-muted-foreground">{word}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <Field
            id="advanced"
            label="Boolean query"
            hint='Supports AND, OR, NOT, and "exact phrases". Words match whole words with their usual endings (plural, possessive, case); end a word with * to open it completely (banka*).'
          >
            <Textarea
              value={advancedText}
              onChange={(e) => setAdvancedText(e.target.value)}
              rows={4}
              className="font-mono"
            />
          </Field>
        )}
      </div>

      {editing && brandGroups.length > 0 ? (
        <Field
          id="brand-group"
          label="Group"
          hint="Monitorings in the same group are read together under one heading in Mentions (for example every version of the same brand). Leave it empty to group by name — “BTM Monitoring v1, v2, v3” are grouped as “BTM Monitoring” automatically."
        >
          <Select value={brandGroupId} onChange={(e) => setBrandGroupId(e.target.value)}>
            <option value="">Automatic (by name)</option>
            {brandGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Sources</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SOURCE_CATEGORIES.map((category) => (
            <label
              key={category.value}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={sourceCategories.includes(category.value)}
                onCheckedChange={() => toggleSourceCategory(category.value)}
              />
              {category.label}
            </label>
          ))}
        </div>
      </div>

      <RegionPicker value={regionScopes} onChange={setRegionScopes} />

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Preview results</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handlePreview}
            disabled={isPreviewing}
          >
            {isPreviewing ? "Checking…" : "Preview"}
          </Button>
        </div>
        {preview ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">
              Your query matched {preview.matchCount} result
              {preview.matchCount === 1 ? "" : "s"} from the last {preview.windowDays}{" "}
              days.
            </p>
            {preview.byCountry && preview.byCountry.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Where they come from:{" "}
                {preview.byCountry
                  .map((entry) => `${entry.code ? countryName(entry.code) : "Source country unknown"} ${entry.count}`)
                  .join(" · ")}
                {regionScopes.length > 0 ? " — only the places you chose are counted." : ""}
              </p>
            ) : null}
            {preview.warning ? <p className="text-warning">{preview.warning}</p> : null}
            {preview.aiAssessment ? (
              <div className="rounded-md bg-surface-muted p-2">
                <p className="text-foreground">{preview.aiAssessment.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  AI assessment · Confidence{" "}
                  {Math.round(preview.aiAssessment.confidence * 100)}% · Method:{" "}
                  {preview.aiAssessment.method}
                </p>
              </div>
            ) : null}
            {preview.sample.length > 0 ? (
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {preview.sample.map((item, i) => (
                  <li key={i}>
                    {item.title} <span className="text-xs">— {item.sourceName}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            See how many recent articles this query would have matched before saving it.
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
          {upgradeUrl ? (
            <>
              {" "}
              <a href={upgradeUrl} className="font-medium underline underline-offset-2">
                See plan &amp; upgrade
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSubmitting || saveBlocked}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Save monitoring"}
        </Button>
      </div>
    </div>
  );
}
