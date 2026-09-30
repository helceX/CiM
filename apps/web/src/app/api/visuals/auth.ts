import { NextResponse } from "next/server";
import type { Permission } from "@cim/core";
import { requirePermission, type OrgContext } from "@/lib/tenant";

type Authorized =
  | { context: OrgContext; response?: undefined }
  | { context?: undefined; response: NextResponse };

/**
 * Custom visuals read monitoring data, so they are gated by the monitoring
 * permissions (read to view/preview, write to save or delete).
 * Callers: `const auth = await authorize(p); if (auth.response) return auth.response;`
 */
export async function authorize(permission: Permission): Promise<Authorized> {
  try {
    return { context: await requirePermission(permission) };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return {
        response: NextResponse.json({ error: "You don't have permission to manage visuals" }, { status: 403 }),
      };
    }
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
}
