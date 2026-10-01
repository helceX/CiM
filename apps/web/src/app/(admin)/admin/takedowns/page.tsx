import Link from "next/link";
import { Badge } from "@cim/ui";
import { db, listBlockedDomains, listTakedownRequests } from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { BlockDomainForm, ResolveTakedownForm, UnblockButton } from "./takedown-controls";

/**
 * Publisher requests to be removed, and the list of blocked domains. A blocked
 * domain is never crawled again and cannot be re-added as a source.
 */
export default async function AdminTakedownsPage() {
  await requireSuperAdmin();
  const [open, handled, blocked] = await Promise.all([
    listTakedownRequests(db, "open"),
    Promise.all([listTakedownRequests(db, "resolved"), listTakedownRequests(db, "rejected")]).then(([a, b]) =>
      [...a, ...b].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, 20),
    ),
    listBlockedDomains(db),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm">
          <Link href="/admin" className="text-primary underline underline-offset-2">
            ← Platform overview
          </Link>
        </p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">Takedown requests &amp; blocked publishers</h1>
        <p className="text-sm text-muted-foreground">
          Answer publishers promptly — a fast, courteous removal is the best protection against a dispute. Blocking
          pauses every source on the domain; “block and remove stored content” also deletes the articles already stored
          (and customers&apos; mentions of them).
        </p>
      </div>

      <section aria-labelledby="open-heading">
        <h2 id="open-heading" className="text-sm font-semibold text-foreground">
          Open requests ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No open requests.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {open.map((req) => (
              <li key={req.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{req.publisher}</span>
                  <span className="text-xs text-muted-foreground">{req.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {req.requesterName} &lt;{req.requesterEmail}&gt;
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{req.targets}</p>
                {req.message ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{req.message}</p>
                ) : null}
                <div className="mt-3">
                  <ResolveTakedownForm id={req.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="blocked-heading">
        <h2 id="blocked-heading" className="text-sm font-semibold text-foreground">
          Blocked publishers ({blocked.length})
        </h2>
        <div className="mt-3">
          <BlockDomainForm />
        </div>
        {blocked.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {blocked.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{item.domain}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.reason}</div>
                </div>
                <UnblockButton id={item.id} domain={item.domain} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {handled.length > 0 ? (
        <section aria-labelledby="handled-heading">
          <h2 id="handled-heading" className="text-sm font-semibold text-foreground">
            Recently handled
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {handled.map((req) => (
              <li key={req.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground">{req.publisher}</span>
                <Badge tone={req.status === "resolved" ? "success" : "neutral"}>{req.status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
