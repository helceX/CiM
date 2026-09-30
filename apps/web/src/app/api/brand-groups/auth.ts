import { NextResponse } from "next/server";
import type { Permission } from "@cim/core";
import { requirePermission, type OrgContext } from "@/lib/tenant";

type Authorized =
  | { context: OrgContext; response?: undefined }
  | { context?: undefined; response: NextResponse };

/**
 * Brand groups are managed with the same permission that governs the
 * monitoring queries they cluster (docs/product/NEXT_FEATURES_SPEC.md §1).
 * Callers: `const auth = await authorize(p); if (auth.response) return auth.response;`
 */
export async function authorize(permission: Permission): Promise<Authorized> {
  try {
    return { context: await requirePermission(permission) };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return {
        response: NextResponse.json(
          { error: "You don't have permission to manage brand groups" },
          { status: 403 },
        ),
      };
    }
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
}
