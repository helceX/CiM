/**
 * Which namespaces each part of the site hands to its client components (see pick.ts). The tests check
 * these lists against the catalogs, so a namespace added to a catalog cannot be forgotten here.
 */

/** Everything in `messages/<locale>/marketing.json`. */
export const MARKETING_NAMESPACES = [
  "meta",
  "nav",
  "footer",
  "common",
  "home",
  "devices",
  "features",
  "solutions",
  "security",
  "resources",
  "pricing",
  "contact",
  "legal",
] as const;

/** Sign-in, sign-up, password and invitation pages: the marketing frame around them plus their own text. */
export const AUTH_NAMESPACES = [...MARKETING_NAMESPACES, "auth", "validation", "ui"] as const;

/** The setup wizard shown once, right after the e-mail is verified. */
// "errors" holds the short generic sentences ("Something went wrong…") the wizard shows when a request fails.
export const ONBOARDING_NAMESPACES = ["onboarding", "trackingTargets", "validation", "errors"] as const;

/** The signed-in panel (grows with each translated area). */
export const PANEL_NAMESPACES = ["ui", "shell", "notifications", "palette", "validation"] as const;

/** Read on the server (API messages); sent to a browser only where a group above lists it. */
export const SERVER_NAMESPACES = ["errors"] as const;
