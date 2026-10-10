"use client";

import { useEffect, useRef, useState } from "react";
import { ProductMockup, type ProductDemoCopy } from "./product-mockup";

/** The first wheel movement starts the workflow before the larger pinned story. */
export function HeroProduct({ copy }: { copy: ProductDemoCopy }) {
  const root = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      frame = 0;
      if (!root.current) return;
      const bounds = root.current.getBoundingClientRect();
      const start = Math.max(0, bounds.top + window.scrollY - innerHeight * 0.25);
      const moved = Math.max(
        0,
        Math.min(1, (window.scrollY - start) / Math.max(1, bounds.height * 0.8)),
      );
      setProgress(preference.matches ? Math.round(moved) : moved);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        window.addEventListener("scroll", schedule, { passive: true });
        schedule();
      } else window.removeEventListener("scroll", schedule);
    });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={root} className="min-w-0">
      <ProductMockup copy={copy} progress={progress} hero />
    </div>
  );
}
