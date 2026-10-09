import type { Locale } from "../src/i18n/config";
import type { Messages } from "./types";

/**
 * A language's catalog is split into areas — one JSON file per area under `messages/<locale>/` — and
 * merged here (docs/product/PANEL_I18N.md). Adding an area: add its file in every language, list it here
 * and in `types.ts`, and add its namespaces to `src/i18n/groups.ts`.
 */
export const AREAS = ["marketing", "shell", "auth", "feedback", "opportunities"] as const;
export type Area = (typeof AREAS)[number];

export async function loadMessages(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(
    AREAS.map(async (area) => ((await import(`./${locale}/${area}.json`)) as { default: object }).default),
  );
  return Object.assign({}, ...parts) as Messages;
}
