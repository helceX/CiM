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
