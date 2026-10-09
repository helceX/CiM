"use client";

import { useTranslations } from "next-intl";
import { messageKey } from "./validation-keys";

/** Turns a validation message (English, from @cim/validation) into the person's language when the catalog has it. */
export function useLocalizedIssue(): (message: string) => string {
  const t = useTranslations("validation");
  return (message) => {
    const key = messageKey(message) as Parameters<typeof t.has>[0];
    return t.has(key) ? t(key) : message;
  };
}
