// Light/dark toggle. Light = Swedish Beach Tour brand, dark = Vercel mono; the choice flips the
// `.dark` class on <html>, which swaps every token in index.css. The class is applied before first
// paint by the inline bootstrap in index.html (default: saved choice, else OS preference), so this
// component only reads/writes from there on. Picker and wizard never mount at once, so a single
// local state per instance stays in sync with the DOM class.

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/ui/shadcn/ui/button";

type Theme = "light" | "dark";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  const set = (next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={className}
      onClick={() => set(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
