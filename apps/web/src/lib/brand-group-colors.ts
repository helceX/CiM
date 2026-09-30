import { BRAND_GROUP_COLORS } from "@cim/core";

/** A group's colour key -> its themed CSS colour (tokens in @cim/ui styles). */
export function groupColorVar(key: string): string {
  return `var(--group-${(BRAND_GROUP_COLORS as readonly string[]).includes(key) ? key : "blue"})`;
}
