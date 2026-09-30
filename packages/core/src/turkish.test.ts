import { describe, expect, it } from "vitest";
import { turkishFold } from "./turkish";

describe("turkishFold", () => {
  it("folds dotted İ to dotted lowercase i", () => {
    expect(turkishFold("İstanbul")).toBe("istanbul");
  });

  it("folds dotless I to dotless lowercase ı", () => {
    expect(turkishFold("ISPARTA")).toBe("ısparta");
  });

  it("leaves already-lowercase Turkish characters unchanged", () => {
    expect(turkishFold("çığöşü")).toBe("çığöşü");
  });

  it("differs from naive toLowerCase for the dotless I case", () => {
    expect(turkishFold("I")).not.toBe("I".toLowerCase());
  });
});
