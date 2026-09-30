"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, Input, Select } from "@cim/ui";
import { BRAND_GROUP_COLORS, BRAND_GROUP_KINDS, type BrandGroupKindValue } from "@cim/core";
import { groupColorVar } from "@/lib/brand-group-colors";

export type BrandGroupItem = {
  id: string;
  projectId: string;
  name: string;
  kind: BrandGroupKindValue;
  color: string;
  queryCount: number;
};
export type GroupableQuery = {
  id: string;
  projectId: string;
  name: string;
  brandGroupId: string | null;
};
export type ProjectOption = { id: string; name: string };

const KIND_LABEL: Record<BrandGroupKindValue, string> = {
  own: "Own brands",
  competitor: "Competitor",
  category: "Category",
};

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return null;
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

/**
 * docs/product/NEXT_FEATURES_SPEC.md §1 — cluster monitoring queries into
 * named groups ("Our brands", "Competitor A", …) so the Dashboard can compare
 * groups rather than single queries.
 */
export function BrandGroupsSection({
  groups,
  queries,
  projects,
  canManage,
}: {
  groups: BrandGroupItem[];
  queries: GroupableQuery[];
  projects: ProjectOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BrandGroupKindValue>("own");
  const [color, setColor] = useState<string>("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const failure = await action();
    setBusy(false);
    if (failure) setError(failure);
    else router.refresh();
  }

  const groupsInProject = (id: string) => groups.filter((group) => group.projectId === id);

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Brand groups</h2>
      <p className="text-sm text-muted-foreground">
        Cluster your own brands and your competitors, then compare the groups on the Dashboard.
      </p>

      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No groups yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {groups.map((group) => (
            <li key={group.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm"
                  style={{ background: groupColorVar(group.color) }}
                />
                <span className="truncate text-sm text-foreground">{group.name}</span>
                <Badge tone="neutral">{KIND_LABEL[group.kind]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {group.queryCount} {group.queryCount === 1 ? "query" : "queries"}
                </span>
              </div>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Delete group ${group.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${group.name}”? Its queries are kept, just ungrouped.`)) {
                      void run(() => call(`/api/brand-groups/${group.id}`, "DELETE"));
                    }
                  }}
                >
                  Delete
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form
          className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const failure = await call("/api/brand-groups", "POST", {
                projectId,
                name,
                kind,
                color: color || undefined,
              });
              if (!failure) setName("");
              return failure;
            });
          }}
        >
          <Field id="brand-group-name" label="New group name">
            <Input
              id="brand-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Our brands"
              maxLength={80}
              required
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field id="brand-group-kind" label="Kind">
              <Select
                id="brand-group-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as BrandGroupKindValue)}
              >
                {BRAND_GROUP_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="brand-group-color" label="Colour">
              <Select id="brand-group-color" value={color} onChange={(event) => setColor(event.target.value)}>
                <option value="">Automatic</option>
                {BRAND_GROUP_COLORS.map((value) => (
                  <option key={value} value={value}>
                    {value[0]?.toUpperCase()}
                    {value.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            {projects.length > 1 ? (
              <Field id="brand-group-project" label="Project">
                <Select
                  id="brand-group-project"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div>
            <Button type="submit" size="sm" disabled={busy || name.trim() === "" || projectId === ""}>
              Create group
            </Button>
          </div>
        </form>
      ) : null}

      {queries.length > 0 && groups.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-foreground">Assign monitoring queries</h3>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {queries.map((query) => (
              <li key={query.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">{query.name}</span>
                <Select
                  aria-label={`Group for ${query.name}`}
                  value={query.brandGroupId ?? ""}
                  disabled={!canManage || busy}
                  onChange={(event) =>
                    void run(() =>
                      call("/api/brand-groups/assign", "POST", {
                        queryId: query.id,
                        brandGroupId: event.target.value === "" ? null : event.target.value,
                      }),
                    )
                  }
                >
                  <option value="">No group</option>
                  {groupsInProject(query.projectId).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
