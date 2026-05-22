"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useHelpMode } from "@/stores/helpModeStore";

interface HelpTooltipProps {
	text: string;
	children: React.ReactNode;
	/** Use block=true for full-width elements so the ? sits to the right without breaking layout */
	block?: boolean;
	/** Set hidden=true to suppress the ? badge (e.g. collapsed sidebar items) */
	hidden?: boolean;
}

export default function HelpTooltip({ text, children, block = false, hidden = false }: HelpTooltipProps) {
	const helpMode = useHelpMode();
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
	const btnRef = useRef<HTMLButtonElement>(null);
	const flyoutRef = useRef<HTMLDivElement>(null);
	const touchHandled = useRef(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => { setMounted(true); }, []);

	useEffect(() => {
		if (!helpMode) setOpen(false);
	}, [helpMode]);

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent | TouchEvent) => {
			const target = e.target as Node;
			if (!btnRef.current?.contains(target) && !flyoutRef.current?.contains(target)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("touchstart", close, { passive: true });
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("touchstart", close);
		};
	}, [open]);

	const calcPos = useCallback(() => {
		if (!btnRef.current) return;
		const rect = btnRef.current.getBoundingClientRect();
		const flyW = 210;
		const x = rect.right + 8 + flyW > window.innerWidth
			? Math.max(4, rect.left - flyW - 8)
			: rect.right + 8;
		const y = Math.min(rect.top - 4, window.innerHeight - 130);
		setPos({ x, y });
	}, []);

	const handleClick = useCallback((e: React.MouseEvent) => {
		if (touchHandled.current) { touchHandled.current = false; return; }
		e.stopPropagation();
		calcPos();
		setOpen((v) => !v);
	}, [calcPos]);

	const handleTouchEnd = useCallback((e: React.TouchEvent) => {
		e.preventDefault();
		e.stopPropagation();
		touchHandled.current = true;
		calcPos();
		setOpen((v) => !v);
	}, [calcPos]);

	if (!helpMode || hidden) return <>{children}</>;

	const qBtn = (
		<button
			ref={btnRef}
			onClick={handleClick}
			onTouchEnd={handleTouchEnd}
			aria-label="Help"
			style={{
				display: "inline-flex", alignItems: "center", justifyContent: "center",
				width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
				border: "1px solid var(--color-blue)",
				background: "color-mix(in srgb, var(--color-blue) 15%, transparent)",
				color: "var(--color-blue)",
				fontSize: 9, fontWeight: 700, lineHeight: 1,
				cursor: "pointer", padding: 0,
			}}
		>
			?
		</button>
	);

	return (
		<>
			{block ? (
				<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<div style={{ flex: 1, minWidth: 0 }}>{children}</div>
					{qBtn}
				</div>
			) : (
				<span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
					{children}
					{qBtn}
				</span>
			)}
			{open && mounted && pos && createPortal(
				<div
					ref={flyoutRef}
					style={{
						position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
						width: 210,
						background: "var(--color-primary)",
						border: "1px solid var(--color-secondary)",
						borderRadius: 10,
						padding: "10px 12px",
						fontSize: 12,
						color: "var(--color-foreground)",
						lineHeight: 1.55,
						boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
					}}
				>
					{text}
				</div>,
				document.body
			)}
		</>
	);
}
