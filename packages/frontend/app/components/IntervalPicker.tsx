"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

export const INTERVAL_UNITS: { value: string; label: string }[] = [
	{ value: "minute", label: "min"   },
	{ value: "hour",   label: "hour"  },
	{ value: "day",    label: "day"   },
	{ value: "week",   label: "week"  },
	{ value: "month",  label: "month" },
	{ value: "year",   label: "year"  },
];

export const INTERVAL_N_PRESETS = [
	1, 5, 10, 15, 20, 25, 30, 35, 40, 45,
	50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

export default function IntervalPicker({
	n, unit, onNChange, onUnitChange,
	units = INTERVAL_UNITS,
	presets = INTERVAL_N_PRESETS,
	maxN = 100,
	mobile,
}: {
	n: number;
	unit: string;
	onNChange: (n: number) => void;
	onUnitChange: (unit: string) => void;
	units?: { value: string; label: string }[];
	presets?: number[];
	maxN?: number;
	mobile?: boolean;
}) {
	const [nDropOpen, setNDropOpen]       = useState(false);
	const [nIsCustom, setNIsCustom]       = useState(() => !presets.includes(n));
	const [unitDropOpen, setUnitDropOpen] = useState(false);
	const [nDropPos, setNDropPos]         = useState({ top: 0, left: 0, w: 0 });
	const [unitDropPos, setUnitDropPos]   = useState({ top: 0, left: 0, w: 0 });

	const nTriggerRef    = useRef<HTMLButtonElement>(null);
	const unitTriggerRef = useRef<HTMLButtonElement>(null);
	const nMenuRef       = useRef<HTMLDivElement>(null);
	const unitMenuRef    = useRef<HTMLDivElement>(null);

	const rowH = mobile ? 44 : 36;
	const fs   = mobile ? 15 : 13;
	const pad  = mobile ? "10px 10px" : "7px 10px";

	useEffect(() => {
		if (!nDropOpen || !nTriggerRef.current) return;
		const r = nTriggerRef.current.getBoundingClientRect();
		const visibleRows = Math.min(presets.length, 8);
		const menuH = visibleRows * rowH + rowH + 8 + 9;
		const below = r.bottom + 4 + menuH < window.innerHeight - 8;
		setNDropPos({ top: below ? r.bottom + 4 : r.top - menuH - 4, left: r.left, w: r.width });
		const h = (e: MouseEvent) => {
			if (!nTriggerRef.current?.contains(e.target as Node) &&
				!nMenuRef.current?.contains(e.target as Node)) setNDropOpen(false);
		};
		document.addEventListener("mousedown", h);
		return () => document.removeEventListener("mousedown", h);
	}, [nDropOpen, presets.length, rowH]);

	useEffect(() => {
		if (!unitDropOpen || !unitTriggerRef.current) return;
		const r = unitTriggerRef.current.getBoundingClientRect();
		const menuH = units.length * rowH + 8;
		const below = r.bottom + 4 + menuH < window.innerHeight - 8;
		setUnitDropPos({ top: below ? r.bottom + 4 : r.top - menuH - 4, left: r.left, w: r.width });
		const h = (e: MouseEvent) => {
			if (!unitTriggerRef.current?.contains(e.target as Node) &&
				!unitMenuRef.current?.contains(e.target as Node)) setUnitDropOpen(false);
		};
		document.addEventListener("mousedown", h);
		return () => document.removeEventListener("mousedown", h);
	}, [unitDropOpen, units.length, rowH]);

	const triggerBase: React.CSSProperties = {
		display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
		padding: pad, borderRadius: 8,
		color: "var(--color-foreground)", fontSize: fs, fontWeight: 500,
		cursor: "pointer",
	};

	const menuBase: React.CSSProperties = {
		position: "fixed",
		background: "var(--color-primary)", border: "1px solid var(--color-secondary)",
		borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.2)", zIndex: 9999, padding: 4,
	};

	const unitLabel = units.find(u => u.value === unit)?.label ?? unit;

	const menuItemStyle = (active: boolean): React.CSSProperties => ({
		width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
		padding: mobile ? "10px 12px" : "7px 10px", borderRadius: 7, border: "none",
		background: active ? "color-mix(in srgb, var(--color-blue) 12%, transparent)" : "transparent",
		color: active ? "var(--color-blue)" : "var(--color-foreground)",
		fontSize: mobile ? 14 : 13, fontWeight: active ? 600 : 400, cursor: "pointer",
	});

	const hoverOn  = (e: React.MouseEvent, active: boolean) => { if (!active) (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--color-secondary) 55%, transparent)"; };
	const hoverOff = (e: React.MouseEvent, active: boolean) => { (e.currentTarget as HTMLElement).style.background = active ? "color-mix(in srgb, var(--color-blue) 12%, transparent)" : "transparent"; };

	return (
		<div style={{ display: "flex", gap: 6 }}>
			{/* ── Number picker ── */}
			{nIsCustom ? (
				<input
					type="text" inputMode="numeric" pattern="[0-9]*"
					value={n} autoFocus
					onChange={e => onNChange(Math.min(maxN, Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1)))}
					onBlur={() => { if (presets.includes(n)) setNIsCustom(false); }}
					className="no-spinner"
					style={{
						flex: 1, padding: pad, borderRadius: 8, textAlign: "center",
						border: "1px solid var(--color-blue)",
						background: "color-mix(in srgb, var(--color-blue) 8%, var(--color-secondary) 28%)",
						color: "var(--color-foreground)", fontSize: fs, fontWeight: 500, outline: "none",
					}}
				/>
			) : (
				<button ref={nTriggerRef} onClick={() => setNDropOpen(o => !o)} style={{
					...triggerBase, flex: 1,
					border: `1px solid ${nDropOpen ? "var(--color-blue)" : "var(--color-secondary)"}`,
					background: nDropOpen
						? "color-mix(in srgb, var(--color-blue) 8%, var(--color-secondary) 28%)"
						: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
				} as React.CSSProperties}>
					<span>{n}</span>
					<IconChevronDown size={mobile ? 13 : 11} style={{ color: "var(--color-foreground-sec)", flexShrink: 0, transition: "transform 150ms", transform: nDropOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
				</button>
			)}

			{/* ── Unit picker ── */}
			<button ref={unitTriggerRef} onClick={() => setUnitDropOpen(o => !o)} style={{
				...triggerBase, flex: 1.4,
				border: `1px solid ${unitDropOpen ? "var(--color-blue)" : "var(--color-secondary)"}`,
				background: unitDropOpen
					? "color-mix(in srgb, var(--color-blue) 8%, var(--color-secondary) 28%)"
					: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
			} as React.CSSProperties}>
				<span>{unitLabel}</span>
				<IconChevronDown size={mobile ? 13 : 11} style={{ color: "var(--color-foreground-sec)", flexShrink: 0, transition: "transform 150ms", transform: unitDropOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
			</button>

			{/* ── N dropdown portal ── */}
			{nDropOpen && typeof document !== "undefined" && createPortal(
				<div ref={nMenuRef} style={{ ...menuBase, top: nDropPos.top, left: nDropPos.left, minWidth: Math.max(nDropPos.w, 100), maxHeight: 300, overflowY: "auto" }}>
					{presets.map(pn => {
						const active = n === pn && !nIsCustom;
						return (
							<button key={pn} onClick={() => { onNChange(pn); setNIsCustom(false); setNDropOpen(false); }}
								style={menuItemStyle(active)}
								onMouseEnter={e => hoverOn(e, active)} onMouseLeave={e => hoverOff(e, active)}
							>
								<span>{pn}</span>
								{active && <IconCheck size={12} style={{ color: "var(--color-blue)", flexShrink: 0 }} />}
							</button>
						);
					})}
					<div style={{ height: 1, background: "var(--color-secondary)", margin: "4px 4px" }} />
					<button onClick={() => { setNIsCustom(true); setNDropOpen(false); }}
						style={{ ...menuItemStyle(nIsCustom), justifyContent: "flex-start" }}
						onMouseEnter={e => hoverOn(e, nIsCustom)} onMouseLeave={e => hoverOff(e, nIsCustom)}
					>Custom…</button>
				</div>,
				document.body
			)}

			{/* ── Unit dropdown portal ── */}
			{unitDropOpen && typeof document !== "undefined" && createPortal(
				<div ref={unitMenuRef} style={{ ...menuBase, top: unitDropPos.top, left: unitDropPos.left, minWidth: Math.max(unitDropPos.w, 110) }}>
					{units.map(({ value: v, label: lbl }) => {
						const active = unit === v;
						return (
							<button key={v} onClick={() => { onUnitChange(v); setUnitDropOpen(false); }}
								style={menuItemStyle(active)}
								onMouseEnter={e => hoverOn(e, active)} onMouseLeave={e => hoverOff(e, active)}
							>
								<span>{lbl}</span>
								{active && <IconCheck size={12} style={{ color: "var(--color-blue)", flexShrink: 0 }} />}
							</button>
						);
					})}
				</div>,
				document.body
			)}
		</div>
	);
}
