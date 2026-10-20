import { expect, it } from "vitest";
import { registerSchema } from "./auth";

it("allows signup without a position while preserving identity and password validation", () => {
  const valid = { firstName: "Ada", lastName: "Test", email: "ada@example.test", companyName: "Example", password: "StrongPassword123" };
  expect(registerSchema.parse(valid).jobTitle).toBe("");
  expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  expect(registerSchema.safeParse({ ...valid, jobTitle: "x".repeat(121) }).success).toBe(false);
});
