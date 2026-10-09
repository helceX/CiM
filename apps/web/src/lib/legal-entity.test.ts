import { describe, expect, it } from "vitest";
import { DEFAULT_PRIVACY_EMAIL, entityLines, getLegalEntity } from "./legal-entity";

const text = (key: string, values: Record<string, string>) => `${key}: ${Object.values(values)[0]}`;

describe("getLegalEntity", () => {
  it("knows nothing but the contact address until the operator fills in the company", () => {
    const entity = getLegalEntity({});
    expect(entity).toEqual({ name: null, address: null, mersis: null, taxId: null, kep: null, email: DEFAULT_PRIVACY_EMAIL });
  });

  it("reads each detail from the environment and tidies whitespace", () => {
    const entity = getLegalEntity({
      LEGAL_ENTITY_NAME: "  Example   Teknoloji A.Ş. ",
      LEGAL_ENTITY_ADDRESS: "Örnek Mah.\n1. Sk. No:2 İstanbul",
      LEGAL_ENTITY_MERSIS: "0123456789012345",
      LEGAL_ENTITY_TAX_ID: "1234567890",
      LEGAL_ENTITY_KEP: "example@hs01.kep.tr",
      PRIVACY_CONTACT_EMAIL: "kvkk@example.com",
    });
    expect(entity.name).toBe("Example Teknoloji A.Ş.");
    expect(entity.address).toBe("Örnek Mah. 1. Sk. No:2 İstanbul");
    expect(entity.email).toBe("kvkk@example.com");
  });

  it("treats blank values as not set", () => {
    expect(getLegalEntity({ LEGAL_ENTITY_NAME: "   ", PRIVACY_CONTACT_EMAIL: "" }).name).toBeNull();
    expect(getLegalEntity({ PRIVACY_CONTACT_EMAIL: "" }).email).toBe(DEFAULT_PRIVACY_EMAIL);
  });
});

describe("entityLines", () => {
  it("names Mediaory and gives the contact when nothing else is known — no placeholders", () => {
    expect(entityLines(getLegalEntity({}), text)).toEqual(["Mediaory", "contact: hello@mediaory.io"]);
  });

  it("lists the known details in the order the notice needs them", () => {
    const entity = getLegalEntity({ LEGAL_ENTITY_NAME: "Example A.Ş.", LEGAL_ENTITY_KEP: "x@hs01.kep.tr", LEGAL_ENTITY_ADDRESS: "Istanbul" });
    expect(entityLines(entity, text)).toEqual([
      "Example A.Ş.",
      "address: Istanbul",
      "kep: x@hs01.kep.tr",
      "contact: hello@mediaory.io",
    ]);
  });
});
