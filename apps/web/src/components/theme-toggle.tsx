"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@cim/ui";

const STORAGE_KEY = "mediaory-panel-theme";
type Theme = "dark" | "light";

function apply(theme: Theme) {
  document.querySelector<HTMLElement>(".mp")?.setAttribute("data-mp-theme", theme);
}

/** Dark ("ink") is the default; light is the paper variant. The choice is remembered per browser. */
export function ThemeToggle() {
  const t = useTranslations("shell.theme");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // storage blocked — stay on the default
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not persisted; still applied for this visit
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? t("toLight") : t("toDark")}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
