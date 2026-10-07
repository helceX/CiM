import { conceptKey, monitoringFamilyName } from "@cim/core";

export type MonitoringFamily = {
  /** Stable key; monitorings with the same key are read together. */
  key: string;
  label: string;
  /** True when a person filed it under a group (otherwise the name decided). */
  mapped: boolean;
};

/**
 * Which family a monitoring belongs to: the group a person filed it under (Settings → Brand groups,
 * or the Group box when editing), otherwise its name without a trailing version — "BTM Monitoring v1",
 * "v2" and "v3" are one family, "BTM Monitoring".
 */
export function monitoringFamily(
  query: { name: string; brandGroupId?: string | null },
  groupNames: ReadonlyMap<string, string>,
): MonitoringFamily {
  const groupName = query.brandGroupId ? groupNames.get(query.brandGroupId) : undefined;
  if (query.brandGroupId && groupName) return { key: `group:${query.brandGroupId}`, label: groupName, mapped: true };
  const label = monitoringFamilyName(query.name);
  return { key: `name:${conceptKey(label) || label.toLowerCase()}`, label, mapped: false };
}
