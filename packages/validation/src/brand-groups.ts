import { z } from "zod";
import { BRAND_GROUP_COLORS, BRAND_GROUP_KINDS } from "@cim/core";

const nameSchema = z.string().trim().min(1, "Name is required").max(80);

export const createBrandGroupSchema = z.object({
  projectId: z.uuid(),
  name: nameSchema,
  kind: z.enum(BRAND_GROUP_KINDS).default("own"),
  color: z.enum(BRAND_GROUP_COLORS).optional(),
});
export type CreateBrandGroupInput = z.infer<typeof createBrandGroupSchema>;

export const updateBrandGroupSchema = z
  .object({
    name: nameSchema.optional(),
    kind: z.enum(BRAND_GROUP_KINDS).optional(),
    color: z.enum(BRAND_GROUP_COLORS).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateBrandGroupInput = z.infer<typeof updateBrandGroupSchema>;

export const assignQueryToGroupSchema = z.object({
  queryId: z.uuid(),
  // null removes the query from its group.
  brandGroupId: z.uuid().nullable(),
});
export type AssignQueryToGroupInput = z.infer<typeof assignQueryToGroupSchema>;
