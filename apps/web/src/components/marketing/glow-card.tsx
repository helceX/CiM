"use client";

import type { ReactNode } from "react";

/** A .mk-card whose lit edge follows the pointer. Pure decoration. */
export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mk-card ${className ?? ""}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}
