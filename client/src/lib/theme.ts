import { useSyncExternalStore } from "react";

export type Skin = "pink" | "vscode" | "dbz" | "cream" | "earth";
export type Mode = "auto" | "light" | "dark";

export const SKINS: { id: Skin; name: string; swatch: [string, string, string, string] }[] = [
  { id: "pink", name: "Sakura pink", swatch: ["#FFF4F7", "#B8466F", "#281820", "#E895B2"] },
  { id: "vscode", name: "VS Code", swatch: ["#FFFFFF", "#005FB8", "#1E1E1E", "#007ACC"] },
  { id: "dbz", name: "Dragon Ball", swatch: ["#EEF4FF", "#F57C00", "#0A0F24", "#FFB020"] },
  { id: "cream", name: "Cream", swatch: ["#FBF6EC", "#8A6A3B", "#1E1B16", "#E3C79A"] },
  { id: "earth", name: "Earth", swatch: ["#F4EFE6", "#5F6E44", "#1C1A16", "#A9B98A"] },
];

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

let theme = { skin: read("ft.skin", "pink") as Skin, mode: read("ft.mode", "auto") as Mode };
if (!SKINS.some((s) => s.id === theme.skin)) theme = { ...theme, skin: "pink" };
const listeners = new Set<() => void>();
const mq = window.matchMedia("(prefers-color-scheme: dark)");

function apply() {
  const root = document.documentElement;
  const dark = theme.mode === "dark" || (theme.mode === "auto" && mq.matches);
  root.dataset.skin = theme.skin;
  root.dataset.mode = dark ? "dark" : "light";
  // Match the browser/OS chrome to the page background.
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
mq.addEventListener("change", apply);
apply();

export function setTheme(patch: Partial<typeof theme>) {
  theme = { ...theme, ...patch };
  write("ft.skin", theme.skin);
  write("ft.mode", theme.mode);
  apply();
  listeners.forEach((l) => l());
}

export function useTheme() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => theme,
  );
}
