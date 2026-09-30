import type { ReactNode } from "react";

/** Endless horizontal ticker. The duplicate track is decorative (aria-hidden). */
export function Marquee({ items, label }: { items: ReactNode[]; label: string }) {
  const track = (hidden: boolean) => (
    <ul className="mk-marquee-track" aria-hidden={hidden || undefined}>
      {items.map((item, index) => (
        <li
          key={index}
          className="mk-chip whitespace-nowrap px-4 py-2 text-sm font-medium text-zinc-200"
        >
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mk-marquee" role="group" aria-label={label}>
      {track(false)}
      {track(true)}
    </div>
  );
}
