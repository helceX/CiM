"use client";

import { useEffect, useRef, useState } from "react";
import { ProductMockup, type ProductDemoCopy } from "./product-mockup";
import type { SignalSceneCopy } from "./signal-scene";

export type StoryStep = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  scene: SignalSceneCopy;
};

/** Native page scrolling drives the product; no wheel interception or background polling. */
export function ScrollStory({
  steps,
  label,
  demo,
}: {
  steps: StoryStep[];
  label: string;
  demo: ProductDemoCopy;
}) {
  const root = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const active = Math.min(steps.length - 1, Math.round(progress));

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    let frame = 0;
    const update = () => {
      frame = 0;
      const first = refs.current[0];
      const last = refs.current[steps.length - 1];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      const distance = b.top - a.top;
      if (distance <= 0) return;
      const next = Math.max(
        0,
        Math.min(
          steps.length - 1,
          ((innerHeight * (innerWidth < 1024 ? 0.82 : 0.48) -
            a.top -
            a.height * (innerWidth < 1024 ? 0.78 : 0.5)) /
            distance) *
            (steps.length - 1),
        ),
      );
      setProgress(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Observe only this section: other page scrolling never runs an animation loop.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        schedule();
      } else {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
      }
    });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", syncPreference);
    };
  }, [steps.length]);

  return (
    <div ref={root} className="product-story" data-progress={progress.toFixed(3)}>
      <div className="product-story-stage">
        <ProductMockup
          copy={demo}
          progress={reducedMotion ? Math.round(progress) : progress}
        />
        <nav className="product-chapters" aria-label={label}>
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              aria-current={active === index ? "step" : undefined}
              onClick={() => {
                const reduced = window.matchMedia(
                  "(prefers-reduced-motion: reduce)",
                ).matches;
                const el = refs.current[index];
                if (el)
                  window.scrollTo({
                    top:
                      window.scrollY +
                      el.getBoundingClientRect().top +
                      el.offsetHeight * (innerWidth < 1024 ? 0.78 : 0.5) -
                      innerHeight * (innerWidth < 1024 ? 0.82 : 0.48),
                    behavior: reduced ? "instant" : "smooth",
                  });
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>{step.kicker}</span>
            </button>
          ))}
        </nav>
      </div>
      <ol aria-label={label} className="product-story-copy">
        {steps.map((step, index) => (
          <li
            key={step.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            data-active={active === index}
          >
            <div>
              <span className="product-step-number">0{index + 1}</span>
              <p className="product-kicker">{step.kicker}</p>
              <h3>{step.title}</h3>
              <p className="mk-lead">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
