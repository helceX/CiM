"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Drives the hero laptop's "opens toward you" perspective from scroll
 * position by writing a 0→1 progress value to a CSS variable (--p); the
 * actual transform lives in marketing.css (.mk-tilt). Runs on rAF and only
 * touches a custom property, so it never triggers layout.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--p", "1");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)));
      el.style.setProperty("--p", p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={`mk-tilt ${className ?? ""}`}>
      {children}
    </div>
  );
}
