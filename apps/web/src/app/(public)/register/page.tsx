import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { RegisterForm } from "./register-form";

// Read per request: the Turnstile key comes from runtime environment variables.
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" subtitle="Set up your organization in under a minute.">
      <RegisterForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthCard>
  );
}
