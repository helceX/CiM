/** One story an alert is about: enough to read the notification without opening the app. */
export type AlertItem = { title: string; sourceName: string; why: string | null };

/** An alert lists this many stories; the rest are counted. */
export const MAX_ALERT_ITEMS = 5;

/** The e-mail: what happened, the stories it is about and why each ranks, then the link. */
export function renderAlertEmailBody(input: { triggerSummary: string; items?: AlertItem[] }, link: string): string {
  const shown = (input.items ?? []).slice(0, MAX_ALERT_ITEMS);
  const more = (input.items?.length ?? 0) - shown.length;
  return [
    input.triggerSummary,
    ...(shown.length > 0
      ? [
          "",
          ...shown.flatMap((item) => [`- ${item.title} (${item.sourceName})`, ...(item.why ? [`  ${item.why}`] : [])]),
          ...(more > 0 ? [`  …and ${more} more`] : []),
        ]
      : []),
    "",
    `Open alerts: ${link}`,
  ].join("\n");
}
