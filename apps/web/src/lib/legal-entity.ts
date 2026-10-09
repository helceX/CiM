/**
 * Who the data controller is, for the privacy notice (KVKK Art. 10 and the
 * Aydınlatma Tebliği require the controller's identity and address).
 *
 * The details come from environment variables on the web service, so the
 * operator fills them in when the company is registered and nothing here
 * has to be invented or edited in code. A field that is not set is simply
 * left out of the notice — never shown as a placeholder.
 */
export type LegalEntity = {
  /** Trade name (ticaret unvanı) */
  name: string | null;
  address: string | null;
  mersis: string | null;
  taxId: string | null;
  /** Registered e-mail address (kayıtlı elektronik posta, KEP) */
  kep: string | null;
  /** Where privacy questions and requests go */
  email: string;
};

export const DEFAULT_PRIVACY_EMAIL = "hello@mediaory.io";

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 300) : null;
};

export function getLegalEntity(env: Record<string, string | undefined> = process.env): LegalEntity {
  return {
    name: clean(env.LEGAL_ENTITY_NAME),
    address: clean(env.LEGAL_ENTITY_ADDRESS),
    mersis: clean(env.LEGAL_ENTITY_MERSIS),
    taxId: clean(env.LEGAL_ENTITY_TAX_ID),
    kep: clean(env.LEGAL_ENTITY_KEP),
    email: clean(env.PRIVACY_CONTACT_EMAIL) ?? DEFAULT_PRIVACY_EMAIL,
  };
}

type EntityText = (key: "address" | "mersis" | "taxId" | "kep" | "contact", values: Record<string, string>) => string;

/**
 * The identity lines of the notice, in the order the Tebliğ lists them: name first,
 * then whichever of address, MERSIS, tax number and KEP are known, then the contact.
 */
export function entityLines(entity: LegalEntity, text: EntityText): string[] {
  const lines: string[] = [entity.name ?? "Mediaory"];
  if (entity.address) lines.push(text("address", { address: entity.address }));
  if (entity.mersis) lines.push(text("mersis", { mersis: entity.mersis }));
  if (entity.taxId) lines.push(text("taxId", { taxId: entity.taxId }));
  if (entity.kep) lines.push(text("kep", { kep: entity.kep }));
  lines.push(text("contact", { email: entity.email }));
  return lines;
}
