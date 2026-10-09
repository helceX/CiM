import type { Tag } from "@cim/db";
import type { FilterBarSelectDef } from "@/components/filter-bar";

/** The filter dropdowns shared by the list view and the by-day view of Mentions. */
export function buildMentionSelects(tags: Tag[], brandGroups: { id: string; name: string }[]): FilterBarSelectDef[] {
  return [
    {
      key: "sentiment",
      label: "Sentiment",
      options: [
        { value: "positive", label: "Positive" },
        { value: "neutral", label: "Neutral" },
        { value: "negative", label: "Negative" },
        { value: "unclassified", label: "Unclassified" },
      ],
    },
    {
      key: "min",
      label: "Importance",
      options: [
        { value: "high", label: "Important only" },
        { value: "normal", label: "Worth a look and up" },
        { value: "low", label: "Passing mentions only" },
      ],
    },
    {
      key: "since",
      label: "Date",
      options: [
        { value: "1", label: "Today" },
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
      ],
    },
    {
      key: "assigned",
      label: "Assignment",
      options: [
        { value: "me", label: "Assigned to me" },
        { value: "unassigned", label: "Unassigned" },
      ],
    },
    ...(tags.length > 0
      ? [{ key: "tag", label: "Tag", options: tags.map((tag) => ({ value: tag.id, label: tag.name })) }]
      : []),
    ...(brandGroups.length > 0
      ? [{ key: "group", label: "Group", options: brandGroups.map((group) => ({ value: group.id, label: group.name })) }]
      : []),
  ];
}
