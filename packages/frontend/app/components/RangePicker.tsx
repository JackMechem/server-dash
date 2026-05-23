"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

export type RangeUnit = "hours" | "days" | "months" | "years";

export const RANGE_UNIT_HOURS: Record<RangeUnit, number> = {
	hours: 1, days: 24, months: 720, years: 8760,
};

export function initRangeFromHours(h: number): { count: number; unit: RangeUnit } {
	if (h < 24)   return { count: h,                   unit: "hours"  };
	if (h < 720)  return { count: Math.round(h / 24),  unit: "days"   };
	if (h < 8760) return { count: Math.round(h / 720), unit: "months" };
	return          { count: Math.round(h / 8760),     unit: "years"  };
}

const UNITS: { value: RangeUnit; label: string }[] = [
	{ value: "hours",  label: "Hours"  },
	{ value: "days",   label: "Days"   },
	{ value: "months", label: "Months" },
	{ value: "years",  label: "Years"  },
];

export default function RangePicker({
	count, unit,
	onCountChange, onUnitChange,
	mobile,
}: {
	count: number;
	unit: RangeUnit;
	onCountChange: (v: number) => void;
	onUnitChange: (u: RangeUnit) => void;
	mobile?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef    = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ top: 0, left: 0, w: 0 });

	const fs = mobile ? 15 : 13;
	const pad = mobile ? "10px 12px" : "7px 10px";

	// Position menu below (or above) trigger
	useEffect(() => {
		if (!open || !triggerRef.current) return;
		const r = triggerRef.current.getBoundingClientRect();
		const menuH = UNITS.length * (mobile ? 44 : 36) + 8;
		const below = r.bottom + 4 + menuH < window.innerHeight - 8;
		setPos({
			top:  below ? r.bottom + 4 : r.top - menuH - 4,
			left: r.left,
			w:    r.width,
		});
	}, [open, mobile]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const h = (e: MouseEvent) => {
			if (!triggerRef.current?.contains(e.target as Node) &&
				!menuRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", h);
		return () => document.removeEventListener("mousedown", h);
	}, [open]);

	const currentLabel = UNITS.find(o => o.value === unit)?.label ?? unit;

	const base: React.CSSProperties = {
		borderRadius: 8,
		border: "1px solid var(--color-secondary)",
		background: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
		color: "var(--color-foreground)",
		fontSize: fs, fontWeight: 500,
		outline: "none",
		transition: "border-color 100ms, background 100ms",
	};

	return (
		<div style={{ display: "flex", gap: 6 }}>
			{/* Number — spinners hidden via .no-spinner global class */}
			<input
				type="number"
				min={1}
				value={count}
				onChange={e => onCountChange(Math.max(1, parseInt(e.target.value) || 1))}
				className="no-spinner"
				style={{
					...base,
					width: mobile ? 68 : 58,
					padding: pad,
					textAlign: "center",
					cursor: "text",
				}}
			/>

			{/* Unit dropdown trigger */}
			<button
				ref={triggerRef}
				onClick={() => setOpen(o => !o)}
				style={{
					...base,
					flex: 1,
					display: "flex", alignItems: "center", gap: 6,
					padding: pad,
					cursor: "pointer",
					border: `1px solid ${open ? "var(--color-blue)" : "var(--color-secondary)"}`,
					background: open
						? "color-mix(in srgb, var(--color-blue) 8%, var(--color-secondary) 28%)"
						: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
					userSelect: "none",
					WebkitUserSelect: "none",
				} as React.CSSProperties}
			>
				<span style={{ flex: 1, textAlign: "left" }}>{currentLabel}</span>
				<IconChevronDown
					size={12}
					style={{
						color: "var(--color-foreground-sec)",
						flexShrink: 0,
						transition: "transform 150ms",
						transform: open ? "rotate(180deg)" : "rotate(0deg)",
					}}
				/>
			</button>

			{open && createPortal(
				<div
					ref={menuRef}
					style={{
						position: "fixed",
						top: pos.top,
						left: pos.left,
						minWidth: Math.max(pos.w, 130),
						background: "var(--color-primary)",
						border: "1px solid var(--color-secondary)",
						borderRadius: 10,
						boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
						zIndex: 9999,
						padding: 4,
					}}
				>
					{UNITS.map(opt => {
						const active = opt.value === unit;
						return (
							<button
								key={opt.value}
								onClick={() => { onUnitChange(opt.value); setOpen(false); }}
								style={{
									width: "100%", display: "flex", alignItems: "center", gap: 8,
									padding: mobile ? "10px 12px" : "7px 10px",
									borderRadius: 7, border: "none",
									background: active
										? "color-mix(in srgb, var(--color-blue) 12%, transparent)"
										: "transparent",
									color: active ? "var(--color-blue)" : "var(--color-foreground)",
									fontSize: fs, fontWeight: active ? 600 : 400,
									cursor: "pointer", textAlign: "left",
									transition: "background 80ms",
								}}
								onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--color-secondary) 55%, transparent)"; }}
								onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
							>
								<span style={{ flex: 1 }}>{opt.label}</span>
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
