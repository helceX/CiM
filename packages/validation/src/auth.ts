import { z } from "zod";

/**
 * Shared across apps/web (form + API route) so client and server never
 * validate against two different definitions of "valid".
 */

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password is too long")
  .refine((value) => /[a-z]/.test(value), "Add a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter")
  .refine((value) => /[0-9]/.test(value), "Add a number");

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.email("Enter a valid work email").max(255).toLowerCase(),
  companyName: z.string().trim().min(1, "Company name is required").max(160),
  jobTitle: z.string().trim().min(1, "Position is required").max(120),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email("Enter a valid email").max(255).toLowerCase(),
  password: z.string().min(1, "Password is required").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.email().max(255).toLowerCase(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
