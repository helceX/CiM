import { getMessages } from "next-intl/server";
import { pickPaths } from "./pick-paths";

/** `pickPaths` over the current request's catalog. */
export async function pickMessages(paths: readonly string[]): Promise<Record<string, unknown>> {
  return pickPaths((await getMessages()) as Record<string, unknown>, paths);
}
