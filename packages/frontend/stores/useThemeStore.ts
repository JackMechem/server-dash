"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";

export type Theme = "light" | "dark" | "black";

function getTheme(): Theme {
    if (typeof document === "undefined") return "light";
    if (document.documentElement.classList.contains("black-theme")) return "black";
    if (document.documentElement.classList.contains("dark-theme")) return "dark";
    return "light";
}

function getThemeSnapshot(): Theme {
    return getTheme();
}

function getServerSnapshot(): Theme {
    return "light";
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function notifyListeners() {
    listeners.forEach((cb) => cb());
}

export function useTheme(): Theme {
    return useSyncExternalStore(subscribe, getThemeSnapshot, getServerSnapshot);
}

export function useSetTheme() {
    return function setTheme(theme: Theme) {
        document.documentElement.classList.remove("dark-theme", "black-theme");
        if (theme === "dark") document.documentElement.classList.add("dark-theme");
        if (theme === "black") document.documentElement.classList.add("black-theme");
        try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
        notifyListeners();
    };
}
