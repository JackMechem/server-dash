"use client";

import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { LeafNode, PanelId, PANEL_LABELS, PANEL_SECTIONS } from "./types";
import {
	IconX, IconLayoutColumns, IconLayoutRows, IconRefresh,
} from "@tabler/icons-react";
import HelpTooltip from "../HelpTooltip";

const DashboardPanel  = lazy(() => import("../panels/DashboardPanel"));
const AnalyticsPanel  = lazy(() => import("../panels/AnalyticsPanel"));

function PanelContent({ panelId, isAuthed }: { panelId: PanelId; isAuthed: boolean }) {
	return (
		<Suspense fallback={<div className="p-4"><div className="skeleton h-32 rounded-2xl" /></div>}>
			{panelId === "dashboard"          && <DashboardPanel isAuthed={isAuthed} />}
			{panelId === "analytics-line"     && <AnalyticsPanel chartType="line" />}
			{panelId === "analytics-bar"      && <AnalyticsPanel chartType="bar" />}
			{panelId === "analytics-candle"   && <AnalyticsPanel chartType="candle" />}
		</Suspense>
	);
}

// ── View picker portal ────────────────────────────────────────────────────────

type SplitDir = "right" | "down";

function ViewPickerPortal({
	anchorRef,
	mode,
	currentView,
	onPick,
	onClose,
}: {
	anchorRef: React.RefObject<HTMLButtonElement | null>;
	mode: "change" | SplitDir;
	currentView: PanelId;
	onPick: (panelId: PanelId) => void;
	onClose: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ top: 0, left: 0 });

	useEffect(() => {
		const rect = anchorRef.current?.getBoundingClientRect();
		if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
	}, []);

	// Clamp to viewport after mount
	useEffect(() => {
		if (!menuRef.current) return;
		const r = menuRef.current.getBoundingClientRect();
		const pad = 8;
		let { left, top } = pos;
		if (r.right  > window.innerWidth  - pad) left = window.innerWidth  - r.width  - pad;
		if (r.left   < pad)                       left = pad;
		if (r.bottom > window.innerHeight - pad)  top  = window.innerHeight - r.height - pad;
		if (left !== pos.left || top !== pos.top) setPos({ top, left });
	}, [pos]);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node) &&
				!anchorRef.current?.contains(e.target as Node)) onClose();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [onClose]);

	const title = mode === "change" ? "Change View" : mode === "right" ? "Tile Right" : "Tile Down";

	// Dashboard entry + sections
	const dashboardActive = currentView === "dashboard";

	return createPortal(
		<div
			ref={menuRef}
			style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
			className="w-[220px] max-h-[420px] overflow-y-auto bg-primary border border-secondary rounded-xl shadow-2xl py-1"
		>
			<p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-foreground-sec uppercase tracking-wider">
				{title}
			</p>
			{/* Dashboard standalone */}
			<button
				onClick={() => { onPick("dashboard"); onClose(); }}
				className={[
					"w-[calc(100%-8px)] mx-[4px] flex items-center gap-2.5 px-2.5 py-[5px] rounded-lg text-left text-xs transition-colors cursor-pointer",
					dashboardActive
						? "bg-blue/12 border border-blue/30 text-blue font-medium"
						: "text-foreground hover:bg-secondary/60 border border-transparent",
				].join(" ")}
			>
				<span className={[
					"w-[28px] h-[28px] shrink-0 flex items-center justify-center rounded-[7px] border text-[10px] font-bold",
					dashboardActive
						? "bg-blue/15 border-blue/35 text-blue"
						: "bg-secondary/50 border-secondary text-foreground-sec",
				].join(" ")}>D</span>
				Dashboard
			</button>
			{/* Power Analytics section */}
			{PANEL_SECTIONS.map((section, si) => (
				<div key={section.id}>
					<div className="mx-2 my-1 h-px bg-secondary" />
					<p className="px-3 pt-1 pb-0.5 text-[9px] font-semibold text-foreground-sec/60 uppercase tracking-wider">
						{section.label}
					</p>
					{section.items.map(({ panelId, label }) => {
						const active = panelId === currentView;
						return (
							<button
								key={panelId}
								onClick={() => { onPick(panelId); onClose(); }}
								className={[
									"w-[calc(100%-8px)] mx-[4px] flex items-center gap-2.5 px-2.5 py-[5px] rounded-lg text-left text-xs transition-colors cursor-pointer",
									active
										? "bg-blue/12 border border-blue/30 text-blue font-medium"
										: "text-foreground hover:bg-secondary/60 border border-transparent",
								].join(" ")}
							>
								<span className={[
									"w-[28px] h-[28px] shrink-0 flex items-center justify-center rounded-[7px] border text-[10px] font-bold",
									active
										? "bg-blue/15 border-blue/35 text-blue"
										: "bg-secondary/50 border-secondary text-foreground-sec",
								].join(" ")}>
									{label.charAt(0)}
								</span>
								{label}
							</button>
						);
					})}
				</div>
			))}
		</div>,
		document.body,
	);
}

// ── Window controls pill ──────────────────────────────────────────────────────

type MenuMode = "change" | SplitDir;

function WindowControls({
	paneId,
	currentView,
	canClose,
	onClose,
	onSplit,
	onChangeView,
}: {
	paneId: string;
	currentView: PanelId;
	canClose: boolean;
	onClose: (id: string) => void;
	onSplit: (leafId: string, dir: "h" | "v", newFirst: boolean, panelId: PanelId) => void;
	onChangeView: (panelId: PanelId) => void;
}) {
	const [menu, setMenu] = useState<MenuMode | null>(null);
	const [pillHovered, setPillHovered] = useState(false);

	const changeRef = useRef<HTMLButtonElement>(null);
	const rightRef  = useRef<HTMLButtonElement>(null);
	const downRef   = useRef<HTMLButtonElement>(null);

	const handlePick = (panelId: PanelId) => {
		if (menu === "change") onChangeView(panelId);
		else if (menu === "right") onSplit(paneId, "h", false, panelId);
		else if (menu === "down")  onSplit(paneId, "v", false, panelId);
		setMenu(null);
	};

	const anchorRef = menu === "change" ? changeRef : menu === "right" ? rightRef : downRef;

	const BTN = "w-[26px] h-[26px] flex items-center justify-center rounded-full transition-colors cursor-pointer text-foreground-sec hover:text-foreground";

	return (
		<>
			<div
				className="flex items-center gap-0.5 px-1 py-0.5 rounded-full border transition-colors duration-150"
				style={{
					borderColor: pillHovered ? "rgba(66,140,226,0.35)" : "var(--color-secondary)",
					background:  pillHovered ? "color-mix(in srgb, var(--color-blue) 8%, var(--color-primary))" : "var(--color-primary)",
					boxShadow:   pillHovered ? "none" : "0 1px 4px rgba(0,0,0,0.18)",
					transition:  "background 150ms, border-color 150ms, box-shadow 150ms",
				}}
				onMouseEnter={() => setPillHovered(true)}
				onMouseLeave={() => setPillHovered(false)}
			>
				{canClose && (
					<HelpTooltip text="Close this panel pane.">
						<button
							onClick={(e) => { e.stopPropagation(); onClose(paneId); }}
							className={`${BTN} hover:text-red-400 hover:bg-red-500/10`}
							title="Close"
						>
							<IconX size={13} />
						</button>
					</HelpTooltip>
				)}
				<HelpTooltip text="Change what this pane displays — pick a different analytics view.">
					<button
						ref={changeRef}
						onClick={(e) => { e.stopPropagation(); setMenu(m => m === "change" ? null : "change"); }}
						className={`${BTN} ${menu === "change" ? "text-blue bg-blue/10" : "hover:bg-secondary/60"}`}
						title="Change view"
					>
						<IconRefresh size={13} />
					</button>
				</HelpTooltip>
				<HelpTooltip text="Split this pane and open a new panel to the right.">
					<button
						ref={rightRef}
						onClick={(e) => { e.stopPropagation(); setMenu(m => m === "right" ? null : "right"); }}
						className={`${BTN} ${menu === "right" ? "text-blue bg-blue/10" : "hover:bg-secondary/60"}`}
						title="Tile right"
					>
						<IconLayoutColumns size={13} />
					</button>
				</HelpTooltip>
				<HelpTooltip text="Split this pane and open a new panel below.">
					<button
						ref={downRef}
						onClick={(e) => { e.stopPropagation(); setMenu(m => m === "down" ? null : "down"); }}
						className={`${BTN} ${menu === "down" ? "text-blue bg-blue/10" : "hover:bg-secondary/60"}`}
						title="Tile down"
					>
						<IconLayoutRows size={13} />
					</button>
				</HelpTooltip>
			</div>

			{menu && (
				<ViewPickerPortal
					anchorRef={anchorRef}
					mode={menu}
					currentView={currentView}
					onPick={handlePick}
					onClose={() => setMenu(null)}
				/>
			)}
		</>
	);
}

// ── WindowPane ────────────────────────────────────────────────────────────────

export default function WindowPane({
	node,
	isFocused,
	canClose,
	onSplit,
	onClose,
	isAuthed,
}: {
	node: LeafNode;
	isFocused: boolean;
	canClose: boolean;
	onSplit: (leafId: string, dir: "h" | "v", newFirst: boolean, panelId: PanelId) => void;
	onClose: (leafId: string) => void;
	isAuthed: boolean;
}) {
	const [hovered, setHovered] = useState(false);

	const handleChangeView = (panelId: PanelId) => {
		import("@/stores/windowStore").then(({ requestViewChange }) => requestViewChange(panelId));
	};

	return (
		<div
			className="relative w-full h-full flex flex-col bg-primary"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{/* Title bar */}
			<div className="shrink-0 h-[28px] flex items-center justify-between px-3 border-b border-secondary/40">
				<span className="text-[11px] font-medium text-foreground-sec truncate select-none">
					{PANEL_LABELS[node.panelId]}
				</span>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
				<PanelContent panelId={node.panelId} isAuthed={isAuthed} />
			</div>

			{/* Floating controls pill */}
			<div
				className="absolute top-[4px] right-[8px] z-20 transition-opacity duration-150 pointer-events-none"
				style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
			>
				<WindowControls
					paneId={node.id}
					currentView={node.panelId}
					canClose={canClose}
					onClose={onClose}
					onSplit={onSplit}
					onChangeView={handleChangeView}
				/>
			</div>
		</div>
	);
}
