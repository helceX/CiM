"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Fades + lifts its children in as they scroll into view.
 *
 * Progressive by construction: the server renders the content fully
 * visible, and only after hydration are elements that are still below the
 * fold hidden and armed — so no-JS visitors, crawlers and above-the-fold
 * content never flash invisible. Skipped entirely for reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        // Two frames so the hidden state is painted before transitioning.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.dataset.reveal = "shown";
          }),
        );
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={delay ? ({ "--d": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
