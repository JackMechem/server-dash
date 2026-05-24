"use client";

import React, { useState, useCallback, useRef, useEffect, createContext, useContext, memo } from "react";
import { TileNode, LeafNode, ContainerNode, PanelId } from "./types";
import {
	splitLeaf, closeLeaf, updatePanelId, patchSizes,
	getFirstLeafId, countLeaves, getLeafPanel,
} from "./treeUtils";
import { setFocusedContext, subscribeViewChange, subscribeSplit } from "@/stores/windowStore";
import WindowPane from "./WindowPane";

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "wm-layout-v4";
const DEFAULT_TREE: TileNode = { type: "leaf", id: "root", panelId: "dashboard" };

function persist(t: TileNode) {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
}

// ── Internal context ──────────────────────────────────────────────────────────

interface WMCtx {
	focusedId: string | null;
	totalPanes: number;
	isAuthed: boolean;
	onFocus: (paneId: string, panelId: PanelId) => void;
	onSplit: (leafId: string, dir: "h" | "v", newFirst: boolean, panelId: PanelId) => void;
	onClose: (leafId: string) => void;
	onResizeContainer: (containerId: string, sizes: number[]) => void;
}

const WMContext = createContext<WMCtx>(null!);
const useWM = () => useContext(WMContext);

// ── Resize handle ─────────────────────────────────────────────────────────────

interface ResizeHandleProps {
	containerId: string;
	index: number;
	dir: "h" | "v";
	sizes: number[];
	containerRef: React.RefObject<HTMLDivElement | null>;
}

function ResizeHandle({ containerId, index, dir, sizes, containerRef }: ResizeHandleProps) {
	const { onResizeContainer } = useWM();
	const isCol = dir === "h";

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const container = containerRef.current;
		if (!container) return;

		const rect = container.getBoundingClientRect();
		const totalPx = isCol ? rect.width : rect.height;
		const totalRatio = sizes.reduce((a, b) => a + b, 0);
		const startPos = isCol ? e.clientX : e.clientY;
		const startSizes = [...sizes];

		const onMove = (mv: MouseEvent) => {
			const delta = (isCol ? mv.clientX : mv.clientY) - startPos;
			const deltaRatio = (delta / totalPx) * totalRatio;
			const minRatio = totalRatio * 0.08;
			const next = [...startSizes];
			next[index]     = Math.max(minRatio, startSizes[index] + deltaRatio);
			next[index + 1] = Math.max(minRatio, startSizes[index + 1] - deltaRatio);
			if (next[index] < minRatio) {
				next[index]     = minRatio;
				next[index + 1] = startSizes[index] + startSizes[index + 1] - minRatio;
			} else if (next[index + 1] < minRatio) {
				next[index + 1] = minRatio;
				next[index]     = startSizes[index] + startSizes[index + 1] - minRatio;
			}
			onResizeContainer(containerId, next);
		};

		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		document.body.style.cursor = isCol ? "col-resize" : "row-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	}, [containerId, index, dir, sizes, containerRef, onResizeContainer, isCol]);

	return (
		<div
			className={[
				"group/div shrink-0 flex items-center justify-center z-10",
				"hover:bg-blue/5 transition-colors",
				isCol ? "w-[6px] cursor-col-resize" : "h-[6px] cursor-row-resize",
			].join(" ")}
			onMouseDown={handleMouseDown}
		>
			<div className={[
				"rounded-full bg-secondary/40 group-hover/div:bg-blue/50 transition-colors",
				isCol ? "w-[2px] h-8" : "h-[2px] w-8",
			].join(" ")} />
		</div>
	);
}

// ── Recursive tree renderer ───────────────────────────────────────────────────

const LeafCard = memo(function LeafCard({ leaf }: { leaf: LeafNode }) {
	const { focusedId, totalPanes, isAuthed, onFocus, onSplit, onClose } = useWM();
	const isFocused = leaf.id === focusedId;

	return (
		<div className="p-[2px] flex flex-col w-full h-full min-w-0 min-h-0 box-border">
			<div
				className={[
					"flex-1 min-h-0 rounded-xl overflow-hidden border transition-colors duration-150",
					totalPanes > 1 && isFocused
						? "border-blue/60 shadow-[0_0_0_1px_rgba(66,140,226,0.2)]"
						: "border-secondary/60",
				].join(" ")}
				onClick={() => onFocus(leaf.id, leaf.panelId)}
			>
				<WindowPane
					node={leaf}
					isFocused={isFocused}
					canClose={totalPanes > 1}
					onSplit={onSplit}
					onClose={onClose}
					isAuthed={isAuthed}
				/>
			</div>
		</div>
	);
});

function RenderTree({ node }: { node: TileNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const { focusedId } = useWM();

	if (node.type === "leaf") return <LeafCard leaf={node as LeafNode} />;

	const container = node as ContainerNode;
	const isCol = container.dir === "h";

	return (
		<div
			ref={containerRef}
			className="flex w-full h-full min-w-0 min-h-0"
			style={{ flexDirection: isCol ? "row" : "column" }}
		>
			{container.children.map((child, i) => (
				<React.Fragment key={child.id}>
					<div
						className="min-w-0 min-h-0 flex"
						style={{
							flex: container.sizes[i] ?? 1,
							flexDirection: isCol ? "row" : "column",
						}}
					>
						<RenderTree node={child} />
					</div>
					{i < container.children.length - 1 && (
						<ResizeHandle
							containerId={container.id}
							index={i}
							dir={container.dir}
							sizes={container.sizes}
							containerRef={containerRef}
						/>
					)}
				</React.Fragment>
			))}
		</div>
	);
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function WindowManager({ isAuthed }: { isAuthed: boolean }) {
	const [tree, setTree] = useState<TileNode>(DEFAULT_TREE);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	// Refs for stale-closure-safe callbacks
	const treeRef = useRef(tree);
	const focusedIdRef = useRef(focusedId);
	treeRef.current = tree;
	focusedIdRef.current = focusedId;

	// Load persisted layout
	useEffect(() => {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) setTree(JSON.parse(saved));
		} catch {}
		setReady(true);
	}, []);

	// Sync focused context to store whenever tree or focus changes
	useEffect(() => {
		const id = focusedId ?? getFirstLeafId(tree);
		const panelId = getLeafPanel(tree, id);
		if (id && panelId) setFocusedContext(id, panelId);
	}, [tree, focusedId]);

	// Listen for split requests (command palette)
	useEffect(() => {
		const unsub = subscribeSplit(({ leafId, dir, newFirst, panelId }) => {
			setTree((prev) => {
				const next = splitLeaf(prev, leafId, dir, newFirst, panelId);
				persist(next);
				return next;
			});
		});
		return unsub;
	}, []);

	// Listen for sidebar view-change requests
	useEffect(() => {
		const unsub = subscribeViewChange((panelId) => {
			const id = focusedIdRef.current ?? getFirstLeafId(treeRef.current);
			setTree((prev) => {
				const next = updatePanelId(prev, id, panelId);
				persist(next);
				return next;
			});
			// Update store immediately so sidebar highlight updates
			setFocusedContext(id, panelId);
		});
		return unsub;
	}, []);

	const onFocus = useCallback((paneId: string, panelId: PanelId) => {
		setFocusedId(paneId);
		setFocusedContext(paneId, panelId);
	}, []);

	const onSplit = useCallback((leafId: string, dir: "h" | "v", newFirst: boolean, panelId: PanelId) => {
		setTree((prev) => {
			const next = splitLeaf(prev, leafId, dir, newFirst, panelId);
			persist(next);
			return next;
		});
	}, []);

	const onClose = useCallback((leafId: string) => {
		setTree((prev) => {
			const next = closeLeaf(prev, leafId);
			if (!next) return prev;
			persist(next);
			// If closed pane was focused, move focus to first leaf
			if (focusedIdRef.current === leafId) {
				const firstId = getFirstLeafId(next);
				const panelId = getLeafPanel(next, firstId);
				setFocusedId(firstId);
				if (panelId) setFocusedContext(firstId, panelId);
			}
			return next;
		});
	}, []);

	const onResizeContainer = useCallback((containerId: string, sizes: number[]) => {
		setTree((prev) => {
			const next = patchSizes(prev, containerId, sizes);
			persist(next);
			return next;
		});
	}, []);

	const total = countLeaves(tree);

	const ctx: WMCtx = {
		focusedId: focusedId ?? (ready ? getFirstLeafId(tree) : null),
		totalPanes: total,
		isAuthed,
		onFocus,
		onSplit,
		onClose,
		onResizeContainer,
	};

	if (!ready) return null;

	return (
		<WMContext.Provider value={ctx}>
			<div className="w-full h-full overflow-hidden">
				<RenderTree node={tree} />
			</div>
		</WMContext.Provider>
	);
}
