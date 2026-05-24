"use client";

import { useSyncExternalStore } from "react";

export type KeybindOS = "linux" | "mac";

const STORAGE_KEY = "keybind-os";
const DEFAULT_OS: KeybindOS = "linux";

let current: KeybindOS = DEFAULT_OS;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }

function init() {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "linux" || stored === "mac") current = stored;
	} catch {}
}

if (typeof window !== "undefined") init();

export function setKeybindOS(os: KeybindOS) {
	current = os;
	try { localStorage.setItem(STORAGE_KEY, os); } catch {}
	notify();
}

export function useKeybindOS(): KeybindOS {
	return useSyncExternalStore(
		(cb) => { listeners.add(cb); return () => listeners.delete(cb); },
		() => current,
		() => DEFAULT_OS,
	);
}

// ── Shortcut formatter ────────────────────────────────────────────────────────

export function fmtShortcut(key: string, os: KeybindOS): string {
	return os === "mac" ? `⌘${key}` : `Ctrl+${key}`;
}
