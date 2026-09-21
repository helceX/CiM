import { AuthCard } from "@/components/auth-card";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthCard title="Create your account" subtitle="Set up your organization in under a minute.">
      <RegisterForm />
    </AuthCard>
  );
}
