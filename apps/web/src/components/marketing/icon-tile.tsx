import type { LucideIcon } from "lucide-react";

/** Gradient-outlined icon tile used on every marketing card. */
export function IconTile({ icon: Icon, tone = "violet" }: { icon: LucideIcon; tone?: "violet" | "magenta" | "coral" | "cyan" }) {
  const glow = {
    violet: "123 92 255",
    magenta: "255 79 163",
    coral: "255 138 76",
    cyan: "47 214 255",
  }[tone];
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-11 items-center justify-center rounded-2xl border border-white/15"
      style={{ background: `linear-gradient(145deg, rgb(${glow} / 0.35), rgb(${glow} / 0.06))`, boxShadow: `0 8px 24px -8px rgb(${glow} / 0.6)` }}
    >
      <Icon className="size-5 text-white" />
    </span>
  );
}
