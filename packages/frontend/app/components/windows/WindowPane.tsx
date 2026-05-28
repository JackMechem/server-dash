"use client";

import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { LeafNode, PanelId, PANEL_LABELS, PANEL_SECTIONS } from "./types";
import {
	IconX, IconLayoutColumns, IconLayoutRows, IconRefresh,
} from "@tabler/icons-react";

const DashboardPanel        = lazy(() => import("../panels/DashboardPanel"));
const AnalyticsPanel        = lazy(() => import("../panels/AnalyticsPanel"));
const SummaryPanel          = lazy(() => import("../panels/SummaryPanel"));
const SmartButtonsPanel     = lazy(() => import("../panels/SmartButtonsPanel"));
const TapoPanel             = lazy(() => import("../panels/TapoPanel"));
const DevicesOverviewPanel  = lazy(() => import("../panels/DevicesOverviewPanel"));
const AutomationsPanel      = lazy(() => import("../panels/AutomationsPanel"));

function PanelContent({ panelId, isAuthed }: { panelId: PanelId; isAuthed: boolean }) {
	return (
		<Suspense fallback={<div className="p-4"><div className="skeleton h-32 rounded-2xl" /></div>}>
			{panelId === "dashboard"         && <DashboardPanel isAuthed={isAuthed} />}
			{panelId === "analytics-past"    && <AnalyticsPanel mode="past" />}
			{panelId === "analytics-live"    && <AnalyticsPanel mode="live" />}
			{panelId === "summary-cost"      && <SummaryPanel type="cost" />}
			{panelId === "summary-power"     && <SummaryPanel type="power" />}
			{panelId === "summary-energy"    && <SummaryPanel type="energy" />}
			{panelId === "devices-jmiot"        && <SmartButtonsPanel />}
			{panelId === "devices-tapo"         && <TapoPanel />}
			{panelId === "devices-overview"     && <DevicesOverviewPanel />}
			{panelId === "devices-automations"  && <AutomationsPanel />}
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
	mouseX,
	mouseY,
}: {
	anchorRef: React.RefObject<HTMLButtonElement | null>;
	mode: "change" | SplitDir;
	currentView: PanelId;
	onPick: (panelId: PanelId) => void;
	onClose: () => void;
	mouseX: number;
	mouseY: number;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ top: mouseY + 8, left: mouseX });
	const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

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

	const itemCls = (active: boolean) => [
		"w-[calc(100%-8px)] mx-[4px] flex items-center gap-2.5 rounded-lg text-left transition-colors cursor-pointer border",
		isMobile ? "px-3 py-3 text-sm" : "px-2.5 py-[5px] text-xs",
		active
			? "bg-blue/12 border-blue/30 text-blue font-medium"
			: "text-foreground hover:bg-secondary/60 border-transparent",
	].join(" ");

	const iconCls = (active: boolean) => [
		"shrink-0 flex items-center justify-center rounded-[7px] border font-bold",
		isMobile ? "w-9 h-9 text-sm" : "w-[28px] h-[28px] text-[10px]",
		active ? "bg-blue/15 border-blue/35 text-blue" : "bg-secondary/50 border-secondary text-foreground-sec",
	].join(" ");

	return createPortal(
		<div
			ref={menuRef}
			style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
			className={isMobile ? "w-[260px] max-h-[520px] overflow-y-auto bg-primary border border-secondary rounded-xl shadow-2xl py-1.5" : "w-[220px] max-h-[420px] overflow-y-auto bg-primary border border-secondary rounded-xl shadow-2xl py-1"}
		>
			<p className={isMobile ? "px-4 pt-2 pb-1.5 text-xs font-semibold text-foreground-sec" : "px-3 pt-1.5 pb-1 text-[11px] font-semibold text-foreground-sec"}>
				{title}
			</p>
			<button onClick={() => { onPick("dashboard"); onClose(); }} className={itemCls(dashboardActive)}>
				<span className={iconCls(dashboardActive)}>D</span>
				Dashboard
			</button>
			{PANEL_SECTIONS.map((section) => (
				<div key={section.id}>
					<div className="mx-2 my-1 h-px bg-secondary" />
					<p className={isMobile ? "px-4 pt-1.5 pb-1 text-[11px] font-semibold text-foreground-sec/60" : "px-3 pt-1 pb-0.5 text-[11px] font-semibold text-foreground-sec/60"}>
						{section.label}
					</p>
					{section.items.map(({ panelId, label }) => (
						<button key={panelId} onClick={() => { onPick(panelId); onClose(); }} className={itemCls(panelId === currentView)}>
							<span className={iconCls(panelId === currentView)}>{label.charAt(0)}</span>
							{label}
						</button>
					))}
				</div>
			))}
		</div>,
		document.body,
	);
}

// ── Window controls (title bar inline) ───────────────────────────────────────

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
	const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

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

	const BTN = "w-[30px] h-[30px] lg:w-[20px] lg:h-[20px] flex items-center justify-center rounded-md transition-colors cursor-pointer text-foreground-sec/50 hover:text-foreground hover:bg-secondary/70";

	return (
		<>
			<div className="flex items-center gap-px shrink-0">
				{canClose && (
					<button
						onClick={(e) => { e.stopPropagation(); onClose(paneId); }}
						className={`${BTN} hover:!text-red-400 hover:!bg-red-500/10`}
						title="Close pane"
					>
						<IconX size={11} />
					</button>
				)}
				<button
					ref={changeRef}
					onClick={(e) => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); setMenu(m => m === "change" ? null : "change"); }}
					className={`${BTN} ${menu === "change" ? "!text-blue !bg-blue/10" : ""}`}
					title="Change view"
				>
					<IconRefresh size={11} />
				</button>
				<button
					ref={rightRef}
					onClick={(e) => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); setMenu(m => m === "right" ? null : "right"); }}
					className={`${BTN} ${menu === "right" ? "!text-blue !bg-blue/10" : ""}`}
					title="Tile right"
				>
					<IconLayoutColumns size={11} />
				</button>
				<button
					ref={downRef}
					onClick={(e) => { e.stopPropagation(); setMenuPos({ x: e.clientX, y: e.clientY }); setMenu(m => m === "down" ? null : "down"); }}
					className={`${BTN} ${menu === "down" ? "!text-blue !bg-blue/10" : ""}`}
					title="Tile down"
				>
					<IconLayoutRows size={11} />
				</button>
			</div>

			{menu && (
				<ViewPickerPortal
					anchorRef={anchorRef}
					mode={menu}
					currentView={currentView}
					onPick={handlePick}
					onClose={() => setMenu(null)}
					mouseX={menuPos.x}
					mouseY={menuPos.y}
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
	const handleChangeView = (panelId: PanelId) => {
		import("@/stores/windowStore").then(({ requestViewChange }) => requestViewChange(panelId));
	};

	return (
		<div className="relative w-full h-full flex flex-col bg-primary">
			{/* Title bar */}
			<div className="shrink-0 h-[40px] lg:h-[28px] flex items-center gap-2 px-3 border-b border-secondary/40">
				<span className="text-[12px] lg:text-[11px] font-medium text-foreground-sec truncate select-none flex-1">
					{PANEL_LABELS[node.panelId]}
				</span>
				<WindowControls
					paneId={node.id}
					currentView={node.panelId}
					canClose={canClose}
					onClose={onClose}
					onSplit={onSplit}
					onChangeView={handleChangeView}
				/>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
				<PanelContent panelId={node.panelId} isAuthed={isAuthed} />
			</div>
		</div>
	);
}
