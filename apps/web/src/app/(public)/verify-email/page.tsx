import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { VerifyEmailClient } from "./verify-email-client";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify your email">
      <Suspense fallback={null}>
        <VerifyEmailClient turnstileSiteKey={getTurnstileSiteKey()} />
      </Suspense>
    </AuthCard>
  );
}
