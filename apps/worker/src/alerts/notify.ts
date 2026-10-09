import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import type { SendEmailJobData } from "@cim/core";
import {
  asOrganizationId,
  createAlertEventIfNotInCooldown,
  createNotificationForOrgMembers,
  db,
  getOrganizationWebhookUrl,
  listActiveMemberEmails,
} from "@cim/db";
import type { AlertRule } from "@cim/db/schema";
import { safeFetch } from "@cim/ingestion";
import { queueOutboxEmail } from "../email";
import { MAX_ALERT_ITEMS, renderAlertEmailBody, type AlertItem } from "./alert-email";

/**
 * Fires one alert rule: atomic cooldown check + AlertEvent insert (brief
 * §19–20 alert fatigue — createAlertEventIfNotInCooldown serializes
 * concurrent callers for the same rule, since crawlSourceWorker runs
 * several crawl_source jobs at once) -> fan out to whichever channels
 * the rule has enabled. Returns false without any side effect if the
 * rule is still in its cooldown window — callers don't need to know why
 * nothing happened.
 */
export async function fireAlert(
  emailQueue: Queue<SendEmailJobData>,
  rule: AlertRule,
  input: { triggerSummary: string; mentionIds: string[]; items?: AlertItem[] },
): Promise<boolean> {
  const organizationId = asOrganizationId(rule.organizationId);
  const event = await createAlertEventIfNotInCooldown(db, organizationId, rule, input);
  if (!event) return false;

  if (rule.channels.includes("in_app")) {
    // Isolated like the email/webhook channels below (commit f3753d6) —
    // a failure here (e.g. a transient DB error on the bulk notification
    // insert) must not skip the channels that come after it or throw out
    // of fireAlert, which would abort the caller's whole rule-evaluation
    // loop for every rule still left to evaluate.
    try {
      await createNotificationForOrgMembers(db, organizationId, {
        kind: "alert",
        title: rule.name,
        body: input.triggerSummary,
        relatedAlertEventId: event.id,
      });
    } catch (error) {
      console.error(
        `[worker] in-app notification for alert "${rule.name}" failed:`,
        error,
      );
    }
  }

  if (rule.channels.includes("email")) {
    const recipients = await listActiveMemberEmails(db, organizationId);
    const link = `${getEnv().APP_URL}/alerts`;
    for (const toEmail of recipients) {
      // Same isolation principle as deliverWebhook below (queueOutboxEmail's
      // own doc comment): the AlertEvent above already committed, so a
      // failure here (e.g. a transient Redis blip enqueueing the job)
      // must not throw out of fireAlert — that would both skip every
      // recipient after this one and abort the caller's rule-evaluation
      // loop for every rule still to come.
      await queueOutboxEmail(
        emailQueue,
        {
          toEmail,
          subject: `[Alert] ${rule.name}`,
          bodyText: renderAlertEmailBody(input, link),
          kind: "alert",
        },
        `alert "${rule.name}"`,
      );
    }
  }

  if (rule.channels.includes("webhook")) {
    await deliverWebhook(organizationId, rule, event.id, input.triggerSummary, input.items);
  }

  return true;
}

/**
 * A user-supplied URL (docs/product/FEATURE_MATRIX.md P2 "Slack/Teams/
 * webhook channels" — Slack/Teams incoming webhooks are themselves plain
 * HTTPS POST endpoints), so this goes through the exact SSRF guarantees
 * safeFetch already gives every crawled URL (docs/architecture/
 * SECURITY.md) — resolve-then-connect, no unrevalidated redirects, a
 * capped timeout. A delivery failure (unreachable endpoint, non-2xx,
 * blocked address) is logged, never thrown — it must not undo the
 * in_app/email delivery this alert already fired.
 *
 * `text` is what actually makes this Slack/Teams-compatible, not just
 * Slack/Teams-URL-shaped: a Slack incoming webhook rejects any payload
 * without a top-level `text` string (HTTP 400 `no_text`), and Teams'
 * legacy Connector card renders the same field as its message body. A
 * generic/custom webhook receiver that only reads the structured fields
 * below simply ignores the extra key.
 */
async function deliverWebhook(
  organizationId: ReturnType<typeof asOrganizationId>,
  rule: AlertRule,
  alertEventId: string,
  triggerSummary: string,
  items: AlertItem[] = [],
): Promise<void> {
  const webhookUrl = await getOrganizationWebhookUrl(db, organizationId);
  if (!webhookUrl) return;

  try {
    const result = await safeFetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `Mediaory alert "${rule.name}": ${triggerSummary}`,
        alertEventId,
        alertRuleId: rule.id,
        alertRuleName: rule.name,
        triggerSummary,
        items: items.slice(0, MAX_ALERT_ITEMS),
        firedAt: new Date().toISOString(),
      }),
    });
    if (result.status < 200 || result.status >= 300) {
      console.error(
        `[worker] webhook delivery for alert "${rule.name}" got status ${result.status}`,
      );
    }
  } catch (error) {
    console.error(`[worker] webhook delivery for alert "${rule.name}" failed:`, error);
  }
}
