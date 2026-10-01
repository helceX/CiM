import Link from "next/link";
import { Badge } from "@cim/ui";
import { getEnv } from "@cim/config";
import { db, listRecentEmailsForAdmin, listUnverifiedUsersForAdmin } from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { TestEmailButton, VerifyUserButton } from "./actions";

const when = (date: Date | null) => (date ? date.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—");

/**
 * Email delivery diagnostics for the platform admin: what this process is
 * configured to do, what actually happened to recent messages, and a manual
 * "mark verified" bridge for accounts stuck waiting on a mail that never came.
 * Bodies are never shown (they hold verification/reset links).
 */
export default async function AdminEmailPage() {
  const user = await requireSuperAdmin();
  const env = getEnv();
  const [emails, unverified] = await Promise.all([
    listRecentEmailsForAdmin(db, 20).catch((error: unknown) => {
      console.error("[admin] listRecentEmailsForAdmin failed:", error);
      return null;
    }),
    listUnverifiedUsersForAdmin(db, 50).catch((error: unknown) => {
      console.error("[admin] listUnverifiedUsersForAdmin failed:", error);
      return null;
    }),
  ]);

  const configured = env.EMAIL_PROVIDER !== "console";
  const keyMissing = env.EMAIL_PROVIDER === "resend" && !env.EMAIL_API_KEY;

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="underline underline-offset-2">
            Admin
          </Link>
        </p>
        <h1 className="text-lg font-semibold text-foreground">Email delivery</h1>
        <p className="text-sm text-muted-foreground">
          Is Mediaory actually able to send email, and what happened to the latest messages?
        </p>
      </div>

      <section aria-labelledby="email-config">
        <h2 id="email-config" className="text-sm font-semibold text-foreground">
          Configuration of the web service
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={configured && !keyMissing ? "success" : "danger"}>
            Provider: {env.EMAIL_PROVIDER}
          </Badge>
          <Badge tone={env.EMAIL_API_KEY ? "success" : env.EMAIL_PROVIDER === "resend" ? "danger" : "neutral"}>
            API key {env.EMAIL_API_KEY ? "set" : "not set"}
          </Badge>
          <Badge tone="neutral">From: {env.EMAIL_FROM}</Badge>
        </div>
        {!configured ? (
          <p role="alert" className="mt-3 rounded-md border border-danger/30 p-3 text-sm text-foreground">
            Email is <strong>not configured</strong>: with the “console” provider messages are only written to a log
            and nobody receives them. Set <code>EMAIL_PROVIDER=resend</code> and <code>EMAIL_API_KEY</code> on the
            worker <em>and</em> web services (see docs/product/INTEGRATIONS.md §3.1).
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          This shows the <em>web</em> service&apos;s settings. The <em>worker</em> sends the mail and has its own
          variables — the “Delivered via” column below shows what it really did.
        </p>
        <div className="mt-4">
          <TestEmailButton to={user.email} />
        </div>
      </section>

      <section aria-labelledby="email-recent">
        <h2 id="email-recent" className="text-sm font-semibold text-foreground">
          Recent emails
        </h2>
        {emails === null ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            Could not load recent emails.
          </p>
        ) : emails.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No emails have been queued yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Most recent outgoing emails</caption>
              <thead className="bg-surface-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Queued</th>
                  <th scope="col" className="px-3 py-2 font-medium">To</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kind</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Delivered via</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => {
                  const logOnly = email.sentAt !== null && email.deliveredVia === "console";
                  return (
                    <tr key={email.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{when(email.createdAt)}</td>
                      <td className="px-3 py-2 text-foreground">{email.toEmail}</td>
                      <td className="px-3 py-2 text-muted-foreground">{email.kind}</td>
                      <td className="px-3 py-2">
                        {logOnly ? (
                          <Badge tone="danger">Logged only — not delivered</Badge>
                        ) : email.sentAt ? (
                          <Badge tone="success">Sent</Badge>
                        ) : email.lastError ? (
                          <Badge tone="danger">Failing</Badge>
                        ) : (
                          <Badge tone="warning">Pending</Badge>
                        )}
                        {email.lastError ? (
                          <p className="mt-1 max-w-xs break-words text-xs text-danger">{email.lastError}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{email.deliveredVia ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="email-unverified">
        <h2 id="email-unverified" className="text-sm font-semibold text-foreground">
          Accounts waiting for email verification
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          If a verification email never arrived you can confirm the address yourself. Only do this for people you
          know are who they say they are.
        </p>
        {unverified === null ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            Could not load accounts.
          </p>
        ) : unverified.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nobody is waiting.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {unverified.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-foreground">
                  {account.email}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {account.name} · registered {when(account.createdAt)}
                  </span>
                </span>
                <VerifyUserButton id={account.id} email={account.email} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
