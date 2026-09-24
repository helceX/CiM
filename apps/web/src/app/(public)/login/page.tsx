import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" subtitle="Welcome back.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
