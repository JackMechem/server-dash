"use client";

import { useSyncExternalStore } from "react";

function read(): boolean {
	if (typeof localStorage === "undefined") return false;
	return localStorage.getItem("helpMode") === "true";
}

let helpMode = read();
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function notify() {
	listeners.forEach((cb) => cb());
}

export function useHelpMode(): boolean {
	return useSyncExternalStore(subscribe, () => helpMode, () => false);
}

export function useToggleHelpMode() {
	return function toggle() {
		helpMode = !helpMode;
		try { localStorage.setItem("helpMode", String(helpMode)); } catch {}
		notify();
	};
}
