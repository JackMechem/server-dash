"use client";

import { useSyncExternalStore } from "react";
import { PanelId } from "@/app/components/windows/types";

// ── State ─────────────────────────────────────────────────────────────────────

interface WindowFocus {
	paneId: string | null;
	panelId: PanelId | null;
}

let focus: WindowFocus = { paneId: null, panelId: null };
const focusListeners = new Set<() => void>();
const INITIAL_FOCUS: WindowFocus = { paneId: null, panelId: null };

export function setFocusedContext(paneId: string, panelId: PanelId) {
	focus = { paneId, panelId };
	focusListeners.forEach((l) => l());
}

export function useFocusedWindowState(): WindowFocus {
	return useSyncExternalStore(
		(cb) => { focusListeners.add(cb); return () => focusListeners.delete(cb); },
		() => focus,
		() => INITIAL_FOCUS,
	);
}

// ── View change requests (sidebar → focused pane) ─────────────────────────────

type ViewChangeListener = (panelId: PanelId) => void;
const viewChangeListeners = new Set<ViewChangeListener>();

export function requestViewChange(panelId: PanelId) {
	viewChangeListeners.forEach((l) => l(panelId));
}

export function subscribeViewChange(fn: ViewChangeListener): () => void {
	viewChangeListeners.add(fn);
	return () => { viewChangeListeners.delete(fn); };
}

// ── Split requests (command palette → focused pane) ───────────────────────────

interface SplitRequest {
	leafId: string;
	dir: "h" | "v";
	newFirst: boolean;
	panelId: PanelId;
}

type SplitListener = (req: SplitRequest) => void;
const splitListeners = new Set<SplitListener>();

export function requestSplit(leafId: string, dir: "h" | "v", newFirst: boolean, panelId: PanelId) {
	splitListeners.forEach((l) => l({ leafId, dir, newFirst, panelId }));
}

export function subscribeSplit(fn: SplitListener): () => void {
	splitListeners.add(fn);
	return () => { splitListeners.delete(fn); };
}
