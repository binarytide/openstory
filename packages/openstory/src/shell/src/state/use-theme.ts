import { useEffect, useState } from "react";
import { STORAGE_KEY_THEME } from "@/lib/constants";

export type ThemePreference = "light" | "dark" | "system";

const readPreference = (): ThemePreference => {
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY_THEME);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
};

const applyTheme = (preference: ThemePreference): void => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = preference === "dark" || (preference === "system" && prefersDark);
  root.classList.toggle("dark", isDark);
};

export interface ThemeApi {
  preference: ThemePreference;
  set: (next: ThemePreference) => void;
  toggle: () => void;
}

export const useTheme = (): ThemeApi => {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    applyTheme(preference);
    localStorage.setItem(STORAGE_KEY_THEME, preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => applyTheme("system");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [preference]);

  return {
    preference,
    set: setPreference,
    toggle: () => setPreference((previous) => (previous === "dark" ? "light" : "dark")),
  };
};
