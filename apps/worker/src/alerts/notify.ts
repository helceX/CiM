import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import {
  asOrganizationId,
  createAlertEvent,
  createNotificationForOrgMembers,
  db,
  enqueueEmail,
  findRecentAlertEvent,
  getOrganizationWebhookUrl,
  listActiveMemberEmails,
} from "@cim/db";
import type { AlertRule } from "@cim/db/schema";
import { safeFetch } from "@cim/ingestion";

/**
 * Fires one alert rule: cooldown check (brief §19–20 alert fatigue) ->
 * one AlertEvent -> fan out to whichever channels the rule has enabled.
 * Returns false without any side effect if the rule is still in its
 * cooldown window — callers don't need to know why nothing happened.
 */
export async function fireAlert(
  emailQueue: Queue<SendEmailJobData>,
  rule: AlertRule,
  input: { triggerSummary: string; mentionIds: string[] },
): Promise<boolean> {
  const inCooldown = await findRecentAlertEvent(db, rule.id, rule.cooldownMinutes);
  if (inCooldown) return false;

  const organizationId = asOrganizationId(rule.organizationId);
  const event = await createAlertEvent(db, organizationId, {
    alertRuleId: rule.id,
    triggerSummary: input.triggerSummary,
    mentionIds: input.mentionIds,
  });

  if (rule.channels.includes("in_app")) {
    await createNotificationForOrgMembers(db, organizationId, {
      kind: "alert",
      title: rule.name,
      body: input.triggerSummary,
      relatedAlertEventId: event.id,
    });
  }

  if (rule.channels.includes("email")) {
    const recipients = await listActiveMemberEmails(db, organizationId);
    const link = `${getEnv().APP_URL}/alerts`;
    for (const toEmail of recipients) {
      const outboxEntry = await enqueueEmail(db, {
        toEmail,
        subject: `[Alert] ${rule.name}`,
        bodyText: `${input.triggerSummary}\n\nOpen alerts: ${link}`,
        kind: "alert",
      });
      await emailQueue.add(
        QUEUE_NAMES.sendEmail,
        { emailOutboxId: outboxEntry.id },
        { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
      );
    }
  }

  if (rule.channels.includes("webhook")) {
    await deliverWebhook(organizationId, rule, event.id, input.triggerSummary);
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
 */
async function deliverWebhook(
  organizationId: ReturnType<typeof asOrganizationId>,
  rule: AlertRule,
  alertEventId: string,
  triggerSummary: string,
): Promise<void> {
  const webhookUrl = await getOrganizationWebhookUrl(db, organizationId);
  if (!webhookUrl) return;

  try {
    const result = await safeFetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        alertEventId,
        alertRuleId: rule.id,
        alertRuleName: rule.name,
        triggerSummary,
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
