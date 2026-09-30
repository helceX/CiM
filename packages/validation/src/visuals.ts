import { z } from "zod";
import {
  VISUAL_CHART_TYPES,
  VISUAL_DIMENSIONS,
  VISUAL_KINDS,
  VISUAL_MAX_ROWS,
  VISUAL_MEASURES,
  VISUAL_PERIOD_DAYS,
} from "@cim/core";

const periodDays = z
  .number()
  .int()
  .refine((value) => (VISUAL_PERIOD_DAYS as readonly number[]).includes(value), {
    message: `Period must be one of ${VISUAL_PERIOD_DAYS.join(", ")} days`,
  });

/**
 * The whole visual definition. Closed enums and UUID lists only: there is no
 * free-text field a user could smuggle SQL through, and unknown keys are
 * rejected (strict) rather than silently stored.
 */
export const visualSpecSchema = z
  .object({
    measure: z.enum(VISUAL_MEASURES),
    dimension: z.enum(VISUAL_DIMENSIONS),
    periodDays: periodDays.default(30),
    filters: z
      .object({
        projectId: z.uuid().optional(),
        sentiments: z.array(z.enum(["positive", "neutral", "negative"])).max(3).optional(),
        sourceTypes: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        brandGroupIds: z.array(z.uuid()).max(50).optional(),
        queryIds: z.array(z.uuid()).max(100).optional(),
      })
      .strict()
      .default({}),
    chartType: z.enum(VISUAL_CHART_TYPES).default("bar"),
    sort: z.enum(["label_asc", "value_desc", "value_asc"]).default("value_desc"),
    limit: z.number().int().min(1).max(VISUAL_MAX_ROWS).default(50),
  })
  .strict();
export type VisualSpec = z.infer<typeof visualSpecSchema>;

const nameSchema = z.string().trim().min(1, "Name is required").max(120);

export const createVisualSchema = z.object({
  name: nameSchema,
  kind: z.enum(VISUAL_KINDS).default("chart"),
  spec: visualSpecSchema,
});
export type CreateVisualInput = z.infer<typeof createVisualSchema>;

export const updateVisualSchema = z
  .object({
    name: nameSchema.optional(),
    kind: z.enum(VISUAL_KINDS).optional(),
    spec: visualSpecSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateVisualInput = z.infer<typeof updateVisualSchema>;
