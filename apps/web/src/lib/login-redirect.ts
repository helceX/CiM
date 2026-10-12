/** Only local application destinations, shared by password and provider login. */
export function safeLoginNext(value: string | null) {
  return value && /^\/(dashboard|monitoring|mentions|alerts|analytics|reports|opportunities|settings|onboarding)(\/|\?|$)/.test(value) && !/[\\\r\n]/.test(value) ? value : "/dashboard";
}
