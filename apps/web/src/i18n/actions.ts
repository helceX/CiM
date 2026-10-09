"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, updateUserLocale } from "@cim/db";
import { getCurrentUser } from "@/lib/session";
import { LOCALE_COOKIE, isLocale } from "./config";

/**
 * Remembers the visitor's explicit language choice (it beats Accept-Language). When someone is signed in the
 * choice is also stored on their account, so the e-mails and reports we send them follow it.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  try {
    const user = await getCurrentUser();
    if (user) await updateUserLocale(db, user.id, locale);
  } catch (error) {
    // The cookie already did the job for the screen; the stored copy is a convenience.
    console.error("[i18n] could not store the language on the account:", error);
  }
  revalidatePath("/", "layout");
}
