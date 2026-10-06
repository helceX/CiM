import { execFileSync } from "node:child_process";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://cim:cim@localhost:5432/cim";

/**
 * E2E tests never have a real inbox — per docs/testing/TEST_STRATEGY.md
 * this is what "mock email provider capture" means in practice: read the
 * verification/reset link straight out of `email_outbox`, the same table
 * EMAIL_PROVIDER=console writes to (apps/web/src/lib/email.ts).
 */
export function latestEmailLinkFor(
  toEmail: string,
  kind: "verify_email" | "password_reset" | "invitation",
): string {
  const output = execFileSync(
    "psql",
    [
      DATABASE_URL,
      "-t",
      "-A",
      "-c",
      `select body_text from email_outbox where to_email = '${toEmail}' and kind = '${kind}' order by created_at desc limit 1;`,
    ],
    { encoding: "utf-8" },
  );
  const match = output.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error(`No ${kind} email found in outbox for ${toEmail}`);
  }
  return match[0];
}

function sql(statement: string): string {
  return execFileSync("psql", [DATABASE_URL, "-t", "-A", "-c", statement], { encoding: "utf-8" }).trim();
}

/** Test-only: grant the platform-admin flag the way the owner does it by hand in production. */
export function makePlatformAdmin(email: string): void {
  sql(`update users set is_platform_super_admin = true where email = '${email}';`);
}

/**
 * Test-only: forget the stories a brand-new monitoring picked up from articles that earlier tests
 * already stored (a new monitoring now matches the stored last 30 days). A test about what a crawl
 * newly finds — an alert, say — needs those matches to be genuinely new.
 */
export function clearMentionsFor(email: string): void {
  sql(
    `delete from mentions where organization_id in (select organization_id from organization_memberships where user_id = (select id from users where email = '${email}'));`,
  );
}

export function isEmailVerified(email: string): boolean {
  return sql(`select email_verified_at is not null from users where email = '${email}';`) === "t";
}

/** Test-only: three crawlable sources (TR news, TR forum, DE blog) sharing a name prefix. */
export function seedSources(tag: string): void {
  const row = (key: string, country: string, type: string) =>
    `('${tag}-${key}', '${tag}-${key}.example', 'https://${tag}-${key}.example/feed', '${country}', 'tr', '${type}', 'rss', 'healthy')`;
  sql(
    `insert into sources (name, domain, url, country, language, type, connector, status) values ${[
      row("tr-news", "TR", "news"),
      row("tr-forum", "TR", "forum"),
      row("de-blog", "DE", "blog"),
    ].join(", ")};`,
  );
}

export function sourceStatus(name: string): string {
  return sql(`select status from sources where name = '${name}';`);
}

/** Test-only: mark the stories matching a title fragment as printed-edition clippings. */
export function markArticlesAsPrint(titleFragment: string): void {
  const print = JSON.stringify({
    publication: "Test Gazetesi",
    editionDate: "2026-10-01",
    page: 12,
    section: "Ekonomi",
    pageUrl: "https://epaper.example/test-gazetesi/2026-10-01/12",
    pageImageUrl: null,
  }).replace(/'/g, "''");
  sql(`update articles set print = '${print}'::jsonb where title ilike '%${titleFragment.replace(/'/g, "''")}%';`);
}
