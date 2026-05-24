"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	IconSearch, IconX, IconLayoutColumns, IconLayoutRows, IconRefresh,
} from "@tabler/icons-react";
import { ALL_PANELS, PANEL_LABELS, PANEL_SECTIONS, PanelId } from "@/app/components/windows/types";
import { requestViewChange, requestSplit, useFocusedWindowState } from "@/stores/windowStore";
import { useKeybindOS, fmtShortcut } from "@/stores/keybindStore";
import { cn } from "@/lib/utils";

// ── Data ──────────────────────────────────────────────────────────────────────

interface Entry {
	panelId: PanelId;
	label: string;
	sectionLabel: string | null;
}

const ALL_ENTRIES: Entry[] = [
	{ panelId: "dashboard", label: "Dashboard", sectionLabel: null },
	...PANEL_SECTIONS.flatMap((s) =>
		s.items.map((item) => ({
			panelId: item.panelId,
			label: item.label,
			sectionLabel: s.label,
		}))
	),
];

function filterEntries(query: string): Entry[] {
	const q = query.toLowerCase().trim();
	if (!q) return ALL_ENTRIES;
	return ALL_ENTRIES.filter((e) =>
		e.label.toLowerCase().includes(q) ||
		(e.sectionLabel?.toLowerCase().includes(q) ?? false) ||
		PANEL_LABELS[e.panelId].toLowerCase().includes(q)
	);
}

function Highlight({ text, query }: { text: string; query: string }) {
	if (!query.trim()) return <>{text}</>;
	const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
	if (idx === -1) return <>{text}</>;
	return (
		<>
			{text.slice(0, idx)}
			<span className="bg-primary/25 text-foreground rounded-[3px]">
				{text.slice(idx, idx + query.trim().length)}
			</span>
			{text.slice(idx + query.trim().length)}
		</>
	);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const { paneId: focusedPaneId } = useFocusedWindowState();
	const keybindOS = useKeybindOS();

	const entries = filterEntries(query);

	// Global keybind: Cmd+K / Ctrl+K
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	// Reset & focus on open
	useEffect(() => {
		if (open) {
			setQuery("");
			setSelectedIndex(0);
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [open]);

	// Reset selection when query changes
	useEffect(() => { setSelectedIndex(0); }, [query]);

	// Scroll selected item into view
	useEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.querySelector<HTMLElement>("[data-selected=true]");
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	const execute = useCallback((action: "replace" | "right" | "down", panelId: PanelId) => {
		setOpen(false);
		if (action === "replace") {
			requestViewChange(panelId);
		} else if (focusedPaneId) {
			requestSplit(focusedPaneId, action === "right" ? "h" : "v", false, panelId);
		}
	}, [focusedPaneId]);

	// Keyboard navigation
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					setOpen(false);
					break;
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					break;
				case "Enter":
					if (entries[selectedIndex]) execute("replace", entries[selectedIndex].panelId);
					break;
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, entries, selectedIndex, execute]);

	if (typeof document === "undefined") return null;

	return createPortal(
		<>
			{open && (
				<div
					className="fixed inset-0 z-[9998] flex items-start justify-center"
					style={{ paddingTop: "15vh", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
					onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
				>
					<div className="w-full max-w-[520px] mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

						{/* Search bar */}
						<div className="flex items-center gap-3 px-4 py-3 border-b border-border">
							<IconSearch size={15} className="text-muted-foreground shrink-0" />
							<input
								ref={inputRef}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search views…"
								className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
							/>
							{query ? (
								<button
									onClick={() => setQuery("")}
									className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								>
									<IconX size={14} />
								</button>
							) : (
								<kbd className="text-[10px] text-muted-foreground bg-muted/40 border border-border rounded-md px-1.5 py-0.5 font-mono">
									Esc
								</kbd>
							)}
						</div>

						{/* Results */}
						<div ref={listRef} className="overflow-y-auto max-h-[360px] py-2">
							{entries.length === 0 ? (
								<div className="px-4 py-10 text-center text-sm text-muted-foreground">
									No views match &ldquo;{query}&rdquo;
								</div>
							) : (() => {
								const nodes: React.ReactNode[] = [];
								let lastSection: string | null | undefined = undefined;

								entries.forEach((entry, i) => {
									// Section separator / header
									if (entry.sectionLabel !== lastSection) {
										if (lastSection !== undefined) {
											nodes.push(
												<div key={`sep-${i}`} className="mx-3 my-1.5 h-px bg-border" />
											);
										}
										if (entry.sectionLabel) {
											nodes.push(
												<p key={`sec-${i}`} className="px-4 pt-1 pb-0.5 text-[11px] font-semibold text-muted-foreground/60 select-none">
													{entry.sectionLabel}
												</p>
											);
										}
										lastSection = entry.sectionLabel;
									}

									const isSelected = i === selectedIndex;

									nodes.push(
										<div
											key={entry.panelId}
											data-selected={isSelected}
											className={cn(
												"group flex items-center gap-3 px-3 py-2 mx-2 rounded-xl cursor-pointer transition-colors border",
												isSelected ? "bg-blue/12 border-blue/30 text-blue" : "border-transparent hover:bg-secondary/60"
											)}
											onMouseEnter={() => setSelectedIndex(i)}
											onClick={() => execute("replace", entry.panelId)}
										>
											{/* Icon */}
											<span className={cn(
												"w-7 h-7 flex items-center justify-center rounded-lg border text-[10px] font-bold shrink-0 transition-colors",
												isSelected
													? "bg-blue/15 border-blue/35 text-blue"
													: "bg-secondary/50 border-secondary text-foreground-sec"
											)}>
												{entry.label.charAt(0)}
											</span>

											{/* Label */}
											<span className={cn("flex-1 text-sm truncate select-none font-medium", isSelected ? "text-blue" : "text-foreground")}>
												<Highlight text={entry.label} query={query} />
											</span>

											{/* Action buttons */}
											<div className={cn(
												"flex items-center gap-1 transition-opacity",
												isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
											)}>
												<button
													onClick={(e) => { e.stopPropagation(); execute("replace", entry.panelId); }}
													title="Replace current view"
													className="w-6 h-6 flex items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
												>
													<IconRefresh size={11} />
												</button>
												<button
													onClick={(e) => { e.stopPropagation(); execute("right", entry.panelId); }}
													title="Tile right"
													className="w-6 h-6 flex items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
												>
													<IconLayoutColumns size={11} />
												</button>
												<button
													onClick={(e) => { e.stopPropagation(); execute("down", entry.panelId); }}
													title="Tile down"
													className="w-6 h-6 flex items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
												>
													<IconLayoutRows size={11} />
												</button>
											</div>
										</div>
									);
								});

								return nodes;
							})()}
						</div>

						{/* Footer */}
						<div className="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/10 text-[11px] text-muted-foreground select-none">
							<span className="flex items-center gap-1">
								<kbd className="bg-muted/60 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
								navigate
							</span>
							<span className="flex items-center gap-1">
								<kbd className="bg-muted/60 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↵</kbd>
								replace
							</span>
							<span className="flex items-center gap-1">
								<kbd className="bg-muted/60 border border-border rounded px-1 py-0.5 font-mono text-[10px]">{fmtShortcut("K", keybindOS)}</kbd>
								toggle
							</span>
							<span className="ml-auto flex items-center gap-2">
								<span className="flex items-center gap-1"><IconRefresh size={10} /> replace</span>
								<span className="flex items-center gap-1"><IconLayoutColumns size={10} /> tile right</span>
								<span className="flex items-center gap-1"><IconLayoutRows size={10} /> tile down</span>
							</span>
						</div>
					</div>
				</div>
			)}
		</>,
		document.body
	);
}
