import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { VerifyEmailClient } from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify your email">
      <Suspense fallback={null}>
        <VerifyEmailClient />
      </Suspense>
    </AuthCard>
  );
}
