import Link from "next/link";
import { Badge, EmptyState } from "@cim/ui";
import { AtSign } from "lucide-react";
import { countUnreadSocialEvents, db, listSocialConnections, listSocialEvents } from "@cim/db";
import { SOCIAL_PROVIDERS } from "@cim/ingestion";
import { requireOrgContext } from "@/lib/tenant";
import { MarkReadButton } from "./mark-read-button";

const KIND_LABEL: Record<string, string> = { mention: "Mention", comment: "Comment", reply: "Reply" };

/**
 * Everything that happened to the organization's connected accounts — mentions,
 * tags, comments on its videos — newest first, each with a link straight to
 * the post. Collected by the worker through the platforms' official APIs.
 */
export default async function SocialMentionsPage() {
  const context = await requireOrgContext();
  const [events, connections, unread] = await Promise.all([
    listSocialEvents(db, context.organizationId, 100),
    listSocialConnections(db, context.organizationId),
    countUnreadSocialEvents(db, context.organizationId),
  ]);
  const label = (platform: string) => SOCIAL_PROVIDERS.find((provider) => provider.key === platform)?.label ?? platform;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm">
            <Link href="/social" className="text-primary underline underline-offset-2">
              ← Social listening
            </Link>
          </p>
          <h1 className="mt-2">Mentions &amp; tags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Posts that mention or tag your connected accounts, and comments on your videos — each opens on the platform.
          </p>
        </div>
        {unread > 0 ? <MarkReadButton /> : null}
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon={<AtSign className="size-6" aria-hidden="true" />}
          title="No account connected yet"
          description="Connect your own social accounts in Settings and their mentions and comments will be collected here."
          action={
            <Link href="/settings#connected-accounts" className="text-sm text-primary underline underline-offset-2">
              Connect an account
            </Link>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<AtSign className="size-6" aria-hidden="true" />}
          title="Nothing yet"
          description="Connected accounts are checked every so often. New mentions and comments will appear here and in your notifications."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{label(event.platform)}</Badge>
                <Badge tone="neutral">{KIND_LABEL[event.kind] ?? event.kind}</Badge>
                {!event.readAt ? <Badge tone="warning">New</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {event.authorHandle ?? event.authorName ?? "Someone"} → {event.connectionHandle} ·{" "}
                  <time dateTime={event.occurredAt.toISOString()}>
                    {event.occurredAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" })}
                  </time>
                </span>
              </div>
              {event.excerpt ? <p className="mt-1.5 text-sm text-foreground">{event.excerpt}</p> : null}
              <p className="mt-1.5">
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline underline-offset-2"
                >
                  Open on {label(event.platform)}
                  <span className="sr-only"> (new tab)</span>
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
