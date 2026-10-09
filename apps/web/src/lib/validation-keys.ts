/**
 * The English messages of @cim/validation reach the browser as `issue.message`. To show them in the person's
 * language each one has an entry in the `validation` catalog, keyed by the message itself in lower case with
 * everything that is not a letter or a digit turned into "_": "Password is too long" → `password_is_too_long`.
 * A message without an entry is shown as it is.
 */
export function messageKey(message: string): string {
  return message.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
