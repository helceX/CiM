import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a reset link.">
      <ForgotPasswordForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthCard>
  );
}
