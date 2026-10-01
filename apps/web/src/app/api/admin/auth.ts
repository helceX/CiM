import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin";
import type { CurrentUser } from "@/lib/session";

type Authorized =
  | { user: CurrentUser; response?: undefined }
  | { user?: undefined; response: NextResponse };

/**
 * Platform-admin API guard. Anyone who isn't a signed-in super admin gets the
 * same 404 the /admin pages give, so these routes don't advertise themselves.
 * Callers: `const auth = await authorizeAdmin(); if (auth.response) return auth.response;`
 */
export async function authorizeAdmin(): Promise<Authorized> {
  try {
    return { user: await requireSuperAdmin() };
  } catch {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
}
