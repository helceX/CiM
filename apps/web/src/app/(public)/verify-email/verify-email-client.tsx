"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@cim/ui";

type Status = "verifying" | "success" | "error" | "no-token";

export function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "no-token");
  // The verification token is single-use server-side, so this effect must
  // fire the request at most once per token — React Strict Mode (and any
  // accidental remount) double-invokes effects in development, which would
  // otherwise burn the token on a throwaway second request. The ref persists
  // across that mount/cleanup/remount cycle, so — deliberately, unlike the
  // usual "cancelled on cleanup" pattern — the in-flight request's result is
  // still applied even if the first effect instance's cleanup already ran;
  // there is only ever one real request in flight per token to race against.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || requestedTokenRef.current === token) return;
    requestedTokenRef.current = token;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (response.ok) {
          setStatus("success");
          setTimeout(() => {
            router.push("/onboarding");
            router.refresh();
          }, 1200);
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [token, router]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-4 w-48" />
        <p className="text-sm text-muted-foreground">Verifying your email…</p>
      </div>
    );
  }

  if (status === "success") {
    return <p className="text-sm text-foreground">Email verified. Redirecting…</p>;
  }

  if (status === "no-token") {
    return (
      <p className="text-sm text-muted-foreground">
        Open the verification link from your email to activate your account.
      </p>
    );
  }

  return (
    <p className="text-sm text-danger">
      This link is invalid or has expired. Request a new one from the sign-in page.
    </p>
  );
}
