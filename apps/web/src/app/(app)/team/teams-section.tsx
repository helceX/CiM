"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select } from "@cim/ui";

export type TeamView = {
  id: string;
  name: string;
  description: string;
  canManage: boolean;
  members: { userId: string; name: string; email: string; role: "lead" | "member" }[];
};
export type OrgPerson = { userId: string; name: string };

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: response.ok, error: data.error };
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function NewTeamDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await call("/api/teams", "POST", { name, description });
      if (!result.ok) {
        setError(result.error ?? "Could not create the team.");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      onDone();
    } catch {
      setError("Could not create the team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" /> New team
        </Button>
      </DialogTrigger>
      <DialogContent title="Create a team">
        <p className="mt-1 text-sm text-muted-foreground">
          A team groups the people who work together. You become its lead and can add anyone from your organization.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <Field id="team-name" label="Team name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Press office" maxLength={60} required />
          </Field>
          <Field id="team-description" label="What does it do? (optional)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? "Creating…" : "Create team"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamCard({ team, people, currentUserId }: { team: TeamView; people: OrgPerson[]; currentUserId: string }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberIds = new Set(team.members.map((member) => member.userId));
  const candidates = people.filter((person) => !memberIds.has(person.userId));

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="mp-glass p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            {team.name}
            <span className="text-xs font-normal text-muted-foreground">
              {team.members.length} member{team.members.length === 1 ? "" : "s"}
            </span>
          </h3>
          {team.description ? <p className="mt-0.5 text-sm text-muted-foreground">{team.description}</p> : null}
        </div>
        {team.canManage ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Delete team ${team.name}`}
            onClick={() => {
              if (window.confirm(`Delete the team “${team.name}”? People stay in your organization.`)) {
                void run(() => call(`/api/teams/${team.id}`, "DELETE"));
              }
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Members of ${team.name}`}>
        {team.members.map((member) => {
          const isMe = member.userId === currentUserId;
          const canRemove = team.canManage || isMe;
          return (
            <li
              key={member.userId}
              className="flex items-center gap-2 rounded-full border border-border bg-background/40 py-1 pl-1 pr-2 text-sm"
              title={member.email}
            >
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full text-[10px] font-extrabold text-white"
                style={{ background: "var(--mp-gradient-solid)" }}
              >
                {initials(member.name)}
              </span>
              <span className="text-foreground">{member.name}</span>
              {member.role === "lead" ? (
                <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">lead</span>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => call(`/api/teams/${team.id}/members/${member.userId}`, "DELETE"))}
                  aria-label={isMe ? `Leave ${team.name}` : `Remove ${member.name} from ${team.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {team.canManage && candidates.length > 0 ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pick) return;
            void run(async () => {
              const result = await call(`/api/teams/${team.id}/members`, "POST", { userId: pick });
              if (result.ok) setPick("");
              return result;
            });
          }}
        >
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Add someone to ${team.name}`} className="max-w-56">
            <option value="">Add a member…</option>
            {candidates.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !pick}>
            Add
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function TeamsSection({
  teams,
  people,
  currentUserId,
  canCreate,
}: {
  teams: TeamView[];
  people: OrgPerson[];
  currentUserId: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  return (
    <section aria-labelledby="teams-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="teams-heading" className="text-sm font-semibold text-foreground">
            Teams
          </h2>
          <p className="text-sm text-muted-foreground">Group the people who work together — a press office, a regional desk, an agency team.</p>
        </div>
        {canCreate ? <NewTeamDialog onDone={() => router.refresh()} /> : null}
      </div>
      {teams.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No teams yet.{canCreate ? " Create the first one to organise who does what." : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} people={people} currentUserId={currentUserId} />
          ))}
        </ul>
      )}
    </section>
  );
}
