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
  listActiveMemberEmails,
} from "@cim/db";
import type { AlertRule } from "@cim/db/schema";

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

  return true;
}
