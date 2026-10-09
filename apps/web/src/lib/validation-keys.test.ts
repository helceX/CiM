import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptInvitationSchema, loginSchema, registerSchema, resetPasswordSchema } from "@cim/validation";
import { messageKey } from "./validation-keys";

const catalog = (locale: string) =>
  (JSON.parse(readFileSync(join(__dirname, `../../messages/${locale}/feedback.json`), "utf8")) as { validation: Record<string, string> }).validation;

/** Every message the sign-up, sign-in, reset and invitation forms can show, as the schemas really produce them. */
function schemaMessages(): string[] {
  const messages = new Set<string>();
  const collect = (result: { success: boolean; error?: { issues: { message: string }[] } }) => {
    if (!result.success) for (const issue of result.error!.issues) messages.add(issue.message);
  };
  const valid = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", companyName: "Analytical", jobTitle: "Engineer", password: "Str0ngPassword" };
  collect(registerSchema.safeParse({ ...valid, firstName: "", lastName: "", email: "nope", companyName: "", jobTitle: "" }));
  for (const password of ["short", "ALLUPPERCASE12", "alllowercase12", "NoDigitsAtAllHere", "A1b".repeat(60)]) {
    collect(registerSchema.safeParse({ ...valid, password }));
    collect(resetPasswordSchema.safeParse({ token: "t", password }));
    collect(acceptInvitationSchema.safeParse({ token: "t", firstName: "Ada", lastName: "L", password }));
  }
  collect(loginSchema.safeParse({ email: "nope", password: "" }));
  return [...messages];
}

describe("validation messages", () => {
  it("derives the catalog key from the message", () => {
    expect(messageKey("Password must be at least 10 characters")).toBe("password_must_be_at_least_10_characters");
    expect(messageKey("  Enter a valid email! ")).toBe("enter_a_valid_email");
  });

  it("finds the messages the forms can really show", () => {
    expect(schemaMessages().length).toBeGreaterThanOrEqual(10);
  });

  it.each(["en", "tr"])("has a %s entry for every message of the sign-up, sign-in, reset and invitation forms", (locale) => {
    const entries = catalog(locale);
    const missing = schemaMessages()
      // zod's own wording ("Invalid input: …", "Too small: …") is not a message we wrote.
      .filter((message) => !/^(Invalid|Too (small|big))/.test(message))
      .filter((message) => !(messageKey(message) in entries));
    expect(missing).toEqual([]);
  });

  it("keeps the English entries word for word what the schemas say", () => {
    const entries = catalog("en");
    for (const message of schemaMessages().filter((m) => messageKey(m) in entries)) {
      expect(entries[messageKey(message)]).toBe(message);
    }
  });
});
