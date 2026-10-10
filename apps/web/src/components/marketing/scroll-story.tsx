"use client";

import { SignalScene, type SignalSceneCopy } from "./signal-scene";
import { useEffect, useRef, useState } from "react";

export type StoryStep = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  scene: SignalSceneCopy;
};

/** Scroll updates one signal flow; all text and mobile scenes remain readable without JavaScript. */
export function ScrollStory({ steps, label }: { steps: StoryStep[]; label: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = refs.current.indexOf(entry.target as HTMLLIElement);
            if (index >= 0) setActive(index);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <ol aria-label={label} className="flex flex-col gap-16 lg:gap-0">
        {steps.map((step, index) => (
          <li
            key={step.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className="flex flex-col justify-center gap-5 transition-opacity duration-500 lg:min-h-[78vh]"
            data-active={active === index}
          >
            <div
              className={`flex flex-col gap-4 transition-opacity duration-500 ${
                active === index ? "lg:opacity-100" : "lg:opacity-75"
              }`}
            >
              <span className="mk-gradient-text font-[family-name:var(--mk-display)] text-5xl font-semibold tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mk-cyan)]">
                {step.kicker}
              </p>
              <h3 className="text-3xl font-semibold sm:text-4xl">{step.title}</h3>
              <p className="mk-lead max-w-md">{step.body}</p>
            </div>
            <div className="lg:hidden">
              <SignalScene copy={step.scene} stage={index} />
            </div>
          </li>
        ))}
      </ol>

      <div className="sticky top-24 hidden lg:block" aria-hidden="true">
        <SignalScene copy={steps[active]!.scene} stage={active} />
        <div className="mt-10 flex justify-center gap-2">
          {steps.map((step, index) => (
            <span
              key={step.id}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: active === index ? "2.25rem" : "0.5rem",
                background:
                  active === index ? "var(--mk-gradient-solid)" : "var(--mk-line)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
