"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	IconRefresh, IconBolt, IconClock, IconCalendarStats,
	IconEye, IconChevronDown, IconChartBar, IconArrowsHorizontal,
} from "@tabler/icons-react";
import HelpTooltip from "../HelpTooltip";

const ctrlLabelStyle: React.CSSProperties = {
	fontSize: 10, fontWeight: 500,
	color: "var(--color-foreground-sec)", paddingLeft: 2,
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeviceReading { name: string; watts: number; on: boolean; today_wh: number; month_wh: number; }
interface HistoryEntry { ts: string; devices: DeviceReading[]; }
interface Candle { open: number; close: number; high: number; low: number; }
type ChartType = "line" | "bar" | "candle";
type Metric = "watts" | "energy" | "cost";
type GroupBy = "auto" | "hour" | "day" | "month" | "year";
type CandleInterval = "auto" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
type FlyoutId = "metric" | "range" | "groupby" | "devices" | "interval" | "xaxis";
type BarXAxis = "device" | "hour-of-day" | "day-of-week" | "day-of-month" | "month-of-year" | "year" | "custom";
type BarXAxisUnit = "minute" | "hour" | "day" | "week" | "month";

// ── Constants ─────────────────────────────────────────────────────────────────

const COST_PER_KWH = 0.24;

const PRESETS = [
	{ label: "1h",  h: 1 },
	{ label: "6h",  h: 6 },
	{ label: "12h", h: 12 },
	{ label: "24h", h: 24 },
	{ label: "3d",  h: 72 },
	{ label: "7d",  h: 168 },
	{ label: "30d", h: 720 },
];

const METRICS: { id: Metric; label: string }[] = [
	{ id: "watts",  label: "Power" },
	{ id: "energy", label: "Energy" },
	{ id: "cost",   label: "Cost" },
];

const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
	{ id: "auto",  label: "Auto" },
	{ id: "hour",  label: "Hour" },
	{ id: "day",   label: "Day" },
	{ id: "month", label: "Month" },
	{ id: "year",  label: "Year" },
];

const CANDLE_INTERVALS: { id: CandleInterval; label: string; ms: number }[] = [
	{ id: "auto", label: "Auto", ms: 0 },
	{ id: "1m",   label: "1m",   ms: 60_000 },
	{ id: "5m",   label: "5m",   ms: 300_000 },
	{ id: "15m",  label: "15m",  ms: 900_000 },
	{ id: "30m",  label: "30m",  ms: 1_800_000 },
	{ id: "1h",   label: "1h",   ms: 3_600_000 },
	{ id: "4h",   label: "4h",   ms: 14_400_000 },
	{ id: "1d",   label: "1d",   ms: 86_400_000 },
	{ id: "1w",   label: "1w",   ms: 604_800_000 },
];

const BAR_X_AXIS_OPTIONS: { id: BarXAxis; label: string }[] = [
	{ id: "device",        label: "Device" },
	{ id: "hour-of-day",   label: "Hour of day" },
	{ id: "day-of-week",   label: "Day of week" },
	{ id: "day-of-month",  label: "Day of month" },
	{ id: "month-of-year", label: "Month of year" },
	{ id: "year",          label: "Year" },
	{ id: "custom",        label: "Custom" },
];

const BAR_X_UNIT_MS: Record<BarXAxisUnit, number> = {
	minute: 60_000, hour: 3_600_000, day: 86_400_000,
	week: 604_800_000, month: 30 * 86_400_000,
};
const BAR_X_UNIT_SHORT: Record<BarXAxisUnit, string> = {
	minute: "min", hour: "hr", day: "d", week: "wk", month: "mo",
};
const BAR_X_DOM_LABELS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const BAR_X_MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CHART_PALETTE = [
	"#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa",
	"#f472b6", "#22d3ee", "#a3e635", "#fb923c", "#818cf8",
];
function chartColor(i: number) { return CHART_PALETTE[i % CHART_PALETTE.length]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBarXMinHours(xAxis: BarXAxis, customUnit: BarXAxisUnit): number {
	if (xAxis === "device" || xAxis === "hour-of-day") return 1;
	if (xAxis === "day-of-week" || xAxis === "day-of-month") return 24;
	if (xAxis === "month-of-year" || xAxis === "year") return 720;
	// custom
	if (customUnit === "minute" || customUnit === "hour") return 1;
	if (customUnit === "day") return 24;
	if (customUnit === "week") return 168;
	return 720; // month
}

function getBucketKey(d: Date, groupBy: GroupBy): number {
	const n = new Date(d);
	if      (groupBy === "hour")  { n.setMinutes(0, 0, 0); }
	else if (groupBy === "day")   { n.setHours(0, 0, 0, 0); }
	else if (groupBy === "month") { n.setDate(1); n.setHours(0, 0, 0, 0); }
	else if (groupBy === "year")  { n.setMonth(0, 1); n.setHours(0, 0, 0, 0); }
	return n.getTime();
}

function fmtTs(ts: string, groupBy: GroupBy, spanH: number): string {
	const d = new Date(ts);
	if (groupBy === "year")  return String(d.getFullYear());
	if (groupBy === "month") return d.toLocaleDateString([], { month: "short", year: "2-digit" });
	if (groupBy === "day")   return d.toLocaleDateString([], { month: "short", day: "numeric" });
	if (groupBy === "hour")  return spanH > 24
		? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" })
		: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	if (spanH <= 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMetricVal(v: number, metric: Metric): string {
	if (metric === "watts")  return `${v.toFixed(1)} W`;
	if (metric === "energy") return v >= 1000 ? `${(v / 1000).toFixed(3)} kWh` : `${v.toFixed(1)} Wh`;
	return `$${v.toFixed(4)}`;
}

function fmtMetricTick(v: number, metric: Metric): string {
	if (metric === "watts")  return `${v}W`;
	if (metric === "energy") return v >= 1000 ? `${(v / 1000).toFixed(1)}kWh` : `${v}Wh`;
	return `$${v.toFixed(2)}`;
}

function computeYTicks(maxVal: number): number[] {
	if (maxVal <= 0) return [0];
	const rawStep = maxVal / 5;
	const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
	const n = rawStep / mag;
	const niceStep = n <= 1 ? mag : n <= 2 ? mag * 2 : n <= 5 ? mag * 5 : mag * 10;
	const ticks: number[] = [];
	for (let v = 0; v <= maxVal * 1.001 + niceStep; v += niceStep) {
		ticks.push(v);
		if (ticks.length >= 7) break;
	}
	return ticks;
}

function catmullRomPath(pts: [number, number][], yFloor: number): string {
	if (pts.length === 0) return "";
	const cy = (y: number) => Math.min(y, yFloor);
	const atFloor = (y: number) => y >= yFloor - 0.5;
	let d = `M ${pts[0][0].toFixed(1)} ${cy(pts[0][1]).toFixed(1)}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p1 = pts[i], p2 = pts[i + 1];
		if (atFloor(p1[1]) && atFloor(p2[1])) { d += ` L ${p2[0].toFixed(1)} ${yFloor.toFixed(1)}`; continue; }
		const p0 = pts[Math.max(0, i - 1)];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const cp1x = Math.max(p1[0], Math.min(p2[0], p1[0] + (p2[0] - p0[0]) / 6));
		const cp1y = cy(p1[1] + (p2[1] - p0[1]) / 6);
		const cp2x = Math.max(p1[0], Math.min(p2[0], p2[0] - (p3[0] - p1[0]) / 6));
		const cp2y = cy(p2[1] - (p3[1] - p1[1]) / 6);
		d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2[0].toFixed(1)} ${cy(p2[1]).toFixed(1)}`;
	}
	return d;
}

function aggregateReadings(readings: HistoryEntry[], groupBy: GroupBy): HistoryEntry[] {
	if (groupBy === "auto") return readings;
	const buckets = new Map<number, Map<string, { watts: number[]; on: boolean }>>();
	for (const r of readings) {
		const key = getBucketKey(new Date(r.ts), groupBy);
		if (!buckets.has(key)) buckets.set(key, new Map());
		const b = buckets.get(key)!;
		for (const d of r.devices) {
			if (!b.has(d.name)) b.set(d.name, { watts: [], on: d.on });
			b.get(d.name)!.watts.push(d.watts);
			b.get(d.name)!.on = d.on;
		}
	}
	return [...buckets.entries()].sort(([a], [b]) => a - b).map(([key, devMap]) => ({
		ts: new Date(key).toISOString(),
		devices: [...devMap.entries()].map(([name, { watts, on }]) => ({
			name,
			watts: watts.reduce((s, w) => s + w, 0) / watts.length,
			on, today_wh: 0, month_wh: 0,
		})),
	}));
}

function buildSeriesData(readings: HistoryEntry[], deviceNames: string[], metric: Metric): Map<string, number[]> {
	const watts = new Map<string, number[]>();
	for (const n of deviceNames) watts.set(n, new Array(readings.length).fill(0));
	readings.forEach((r, i) => {
		for (const d of r.devices) {
			if (watts.has(d.name)) watts.get(d.name)![i] = d.watts;
		}
	});
	if (metric === "watts") return watts;
	const result = new Map<string, number[]>();
	for (const [name, w] of watts) {
		const cum = new Array(readings.length).fill(0);
		for (let i = 1; i < readings.length; i++) {
			const dtH = (new Date(readings[i].ts).getTime() - new Date(readings[i - 1].ts).getTime()) / 3_600_000;
			cum[i] = cum[i - 1] + (w[i] + w[i - 1]) / 2 * dtH;
		}
		result.set(name, metric === "cost" ? cum.map(wh => wh / 1000 * COST_PER_KWH) : cum);
	}
	return result;
}

// ── Flyout ────────────────────────────────────────────────────────────────────

interface FlyoutPos { x: number; y: number; alignRight: boolean; anchor: HTMLElement; }

function Flyout({ pos, onClose, title, children }: {
	pos: FlyoutPos;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (
				ref.current && !ref.current.contains(e.target as Node) &&
				!pos.anchor.contains(e.target as Node)
			) onClose();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [pos.anchor, onClose]);

	return createPortal(
		<div ref={ref} style={{
			position: "fixed",
			[pos.alignRight ? "right" : "left"]: pos.x,
			top: pos.y,
			zIndex: 99999,
			background: "var(--color-primary)",
			border: "1px solid var(--color-secondary)",
			borderRadius: 14,
			padding: "10px 8px 8px",
			boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
			minWidth: 180,
		}}>
			<p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-foreground-sec)", margin: "0 4px 8px" }}>{title}</p>
			{children}
		</div>,
		document.body
	);
}

function FlyoutOpt({ label, selected, color, onClick }: {
	label: string; selected: boolean; color?: string; onClick: () => void;
}) {
	return (
		<button onClick={onClick} style={{
			width: "100%", display: "flex", alignItems: "center", gap: 8,
			padding: "7px 10px", borderRadius: 8, border: "none",
			background: selected ? "color-mix(in srgb, var(--color-blue) 14%, transparent)" : "transparent",
			color: selected ? "var(--color-blue)" : "var(--color-foreground)",
			cursor: "pointer", fontSize: 12, fontWeight: selected ? 600 : 400, textAlign: "left",
			transition: "background 100ms",
		}}>
			<span style={{
				width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
				background: selected ? (color ?? "var(--color-blue)") : "var(--color-secondary)",
				boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${color ?? "var(--color-blue)"} 25%, transparent)` : "none",
			}} />
			{label}
		</button>
	);
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function CtrlBtn({ icon, label, isOpen, onClick }: {
	icon: React.ReactNode; label: string; isOpen: boolean;
	onClick: (rect: DOMRect, el: HTMLButtonElement) => void;
}) {
	const btnRef = useRef<HTMLButtonElement>(null);
	return (
		<button ref={btnRef} onClick={() => {
			if (btnRef.current) onClick(btnRef.current.getBoundingClientRect(), btnRef.current);
		}} style={{
			display: "flex", alignItems: "center", gap: 5,
			padding: "5px 10px", borderRadius: 8, cursor: "pointer",
			border: `1px solid ${isOpen ? "var(--color-blue)" : "var(--color-secondary)"}`,
			background: isOpen ? "color-mix(in srgb, var(--color-blue) 10%, transparent)" : "transparent",
			color: isOpen ? "var(--color-blue)" : "var(--color-foreground-sec)",
			fontSize: 11, fontWeight: 500, transition: "all 150ms",
		}}>
			{icon}
			<span>{label}</span>
			<IconChevronDown size={10} style={{
				opacity: 0.5, marginLeft: 1,
				transform: isOpen ? "rotate(180deg)" : "none",
				transition: "transform 150ms",
			}} />
		</button>
	);
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ label, mouseX, mouseY, children }: {
	label: string; mouseX: number; mouseY: number; children: React.ReactNode;
}) {
	const flipX = mouseX > window.innerWidth - 190;
	return (
		<div style={{
			position: "fixed",
			left: flipX ? mouseX - 16 : mouseX + 16,
			top: mouseY,
			transform: flipX ? "translate(-100%, -50%)" : "translateY(-50%)",
			pointerEvents: "none", zIndex: 99999,
			background: "var(--color-primary)", border: "1px solid var(--color-secondary)",
			borderRadius: 10, padding: "8px 12px",
			boxShadow: "0 4px 16px rgba(0,0,0,0.3)", minWidth: 120, fontSize: 11,
		}}>
			{label && <div style={{ color: "var(--color-foreground-sec)", marginBottom: 6, fontSize: 10, fontWeight: 500 }}>{label}</div>}
			{children}
		</div>
	);
}

// ── Line Chart ────────────────────────────────────────────────────────────────

const LM = { top: 8, right: 16, bottom: 64, left: 56 };

function LineChart({ readings, deviceNames, colors, visible, hours, metric, groupBy }: {
	readings: HistoryEntry[]; deviceNames: string[]; colors: Map<string, string>;
	visible: Set<string>; hours: number; metric: Metric; groupBy: GroupBy;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [uid] = useState(() => `lc${Math.random().toString(36).slice(2, 7)}`);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [hoverIdx, setHoverIdx] = useState<number | null>(null);
	const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
	const [mouse, setMouse] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState({ sx: 1, px: 0, sy: 1 });
	const [dragging, setDragging] = useState(false);

	const zoomRef = useRef(zoom); zoomRef.current = zoom;
	const isDrag = useRef(false);
	const dragStart = useRef({ x: 0, pan: 0 });
	const innerWRef = useRef(0);
	const lastMx = useRef(0);

	useEffect(() => {
		const el = containerRef.current; if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	useEffect(() => { setZoom({ sx: 1, px: 0, sy: 1 }); }, [hours, groupBy]);

	useEffect(() => {
		const el = containerRef.current; if (!el) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			const f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
			if (e.shiftKey) {
				setZoom(p => ({ ...p, sy: Math.max(0.05, Math.min(20, p.sy * f)) }));
			} else {
				const mx = lastMx.current, iW = innerWRef.current;
				const { sx, px } = zoomRef.current;
				const nsx = Math.max(1, sx * f);
				const npx = Math.min(0, Math.max(iW * (1 - nsx), mx - (mx - px) * (nsx / sx)));
				setZoom(p => ({ ...p, sx: nsx, px: npx }));
			}
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
	}, []);

	useEffect(() => {
		const onUp = () => { if (!isDrag.current) return; isDrag.current = false; setDragging(false); };
		window.addEventListener("mouseup", onUp);
		return () => window.removeEventListener("mouseup", onUp);
	}, []);

	const timestamps = useMemo(() => readings.map(r => r.ts), [readings]);
	const seriesData = useMemo(() => buildSeriesData(readings, deviceNames, metric), [readings, deviceNames, metric]);

	if (timestamps.length === 0) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)" }}>No data</div>;

	const { w, h } = size;
	const iW = Math.max(0, w - LM.left - LM.right);
	const iH = Math.max(0, h - LM.top - LM.bottom);
	innerWRef.current = iW;

	const visEntries = [...seriesData.entries()].filter(([n]) => visible.has(n));
	const allVals = visEntries.flatMap(([, v]) => v);
	const maxVal = Math.max(...allVals, 0.001);
	const yMaxShown = maxVal / zoom.sy;
	const yTicks = computeYTicks(yMaxShown);
	const yMax = yTicks[yTicks.length - 1];

	const xBase = (i: number) => timestamps.length <= 1 ? iW / 2 : (i / (timestamps.length - 1)) * iW;
	const xS = (i: number) => xBase(i) * zoom.sx + zoom.px;
	const yS = (v: number) => iH - (v / Math.max(yMax, 0.001)) * iH;

	const viXIdx = timestamps.map((_, i) => i).filter(i => xS(i) >= -20 && xS(i) <= iW + 20);
	const step = Math.max(1, Math.floor(viXIdx.length / 8));
	const labelIdx = viXIdx.filter((_, j) => j % step === 0);

	const onMD = (e: React.MouseEvent) => {
		isDrag.current = true; setDragging(true);
		dragStart.current = { x: e.clientX, pan: zoomRef.current.px };
		setHoverIdx(null);
	};
	const onMM = (e: React.MouseEvent<SVGRectElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const mx = e.clientX - rect.left, my = e.clientY - rect.top;
		lastMx.current = mx;
		if (isDrag.current) {
			const dx = e.clientX - dragStart.current.x;
			const { sx } = zoomRef.current;
			setZoom(p => ({ ...p, px: Math.min(0, Math.max(iW * (1 - sx), dragStart.current.pan + dx)) }));
		} else {
			setHoverPos({ x: mx, y: my });
			const raw = ((mx - zoomRef.current.px) / (iW * zoomRef.current.sx)) * (timestamps.length - 1);
			setHoverIdx(Math.max(0, Math.min(timestamps.length - 1, Math.round(raw))));
			setMouse({ x: e.clientX, y: e.clientY });
		}
	};
	const onML = () => { if (!isDrag.current) { setHoverIdx(null); setHoverPos(null); } };

	const cursor = dragging ? "grabbing" : zoom.sx > 1 ? "grab" : "crosshair";
	const tipItems = hoverIdx !== null && !dragging
		? visEntries.map(([n, v]) => ({ name: n, val: v[hoverIdx] ?? 0, color: colors.get(n) ?? "#888" })).filter(x => x.val > 0)
		: [];

	return (
		<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
			{w > 0 && h > 0 && (
				<svg width={w} height={h} style={{ display: "block", cursor }}>
					<defs>
						<clipPath id={`${uid}clip`}><rect x={0} y={0} width={iW} height={iH} /></clipPath>
						{visEntries.map(([n]) => {
							const c = colors.get(n) ?? "#888";
							return (
								<linearGradient key={n} id={`${uid}g${n.replace(/\W/g, '_')}`} x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor={c} stopOpacity="0.22" />
									<stop offset="100%" stopColor={c} stopOpacity="0" />
								</linearGradient>
							);
						})}
					</defs>
					<g transform={`translate(${LM.left},${LM.top})`}>
						{yTicks.map(v => (
							<g key={v}>
								<line x1={0} x2={iW} y1={yS(v)} y2={yS(v)} stroke="var(--color-secondary)" strokeDasharray="3,3" strokeWidth={1} />
								<text x={-6} y={yS(v)} textAnchor="end" dominantBaseline="middle" fill="var(--color-foreground-sec)" fontSize={10}>{fmtMetricTick(v, metric)}</text>
							</g>
						))}
						{labelIdx.map(i => (
							<text key={i} textAnchor="end" transform={`translate(${xS(i)},${iH + 8}) rotate(-45)`} fill="var(--color-foreground-sec)" fontSize={10}>
								{fmtTs(timestamps[i], groupBy, hours)}
							</text>
						))}
						{(zoom.sx !== 1 || zoom.sy !== 1) && (() => {
							const bs: string[] = [];
							if (zoom.sx !== 1) bs.push(`↔ ${zoom.sx.toFixed(1)}×`);
							if (zoom.sy !== 1) bs.push(`↕ ${zoom.sy.toFixed(2)}×`);
							const bw = 64, bh = 17, gap = 4;
							return <g>{bs.map((b, j) => (
								<g key={b} transform={`translate(${iW - (bs.length - j) * (bw + gap)}, 2)`}>
									<rect width={bw} height={bh} rx={4} fill="var(--color-primary)" stroke="var(--color-secondary)" strokeWidth={1} />
									<text x={bw / 2} y={bh / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="var(--color-foreground-sec)" fontSize={10}>{b}</text>
								</g>
							))}</g>;
						})()}
						<g clipPath={`url(#${uid}clip)`}>
							{visEntries.map(([n, v]) => {
								const c = colors.get(n) ?? "#888";
								const pts: [number, number][] = v.map((val, i) => [xS(i), yS(val)]);
								const linePath = catmullRomPath(pts, iH);
								if (!linePath || pts.length < 2) return null;
								const fillPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${iH.toFixed(1)} L ${pts[0][0].toFixed(1)} ${iH.toFixed(1)} Z`;
								return (
									<g key={n}>
										<path d={fillPath} fill={`url(#${uid}g${n.replace(/\W/g, '_')})`} />
										<path d={linePath} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
									</g>
								);
							})}
							{hoverIdx !== null && !dragging && visEntries.map(([n, v]) => (
								<circle key={`d${n}`} cx={xS(hoverIdx)} cy={yS(v[hoverIdx] ?? 0)} r={4} fill={colors.get(n) ?? "#888"} stroke="var(--color-primary)" strokeWidth={2} />
							))}
						</g>
						{hoverPos && !dragging && (
							<>
								<line x1={hoverPos.x} x2={hoverPos.x} y1={0} y2={iH} stroke="var(--color-foreground-sec)" strokeWidth={1} strokeDasharray="4,2" opacity={0.5} />
								<line x1={0} x2={iW} y1={hoverPos.y} y2={hoverPos.y} stroke="var(--color-foreground-sec)" strokeWidth={1} strokeDasharray="4,2" opacity={0.5} />
							</>
						)}
						<rect x={0} y={0} width={iW} height={iH} fill="transparent"
							onMouseDown={onMD} onMouseMove={onMM} onMouseLeave={onML}
							onDoubleClick={() => setZoom({ sx: 1, px: 0, sy: 1 })} />
					</g>
				</svg>
			)}
			{hoverIdx !== null && !dragging && tipItems.length > 0 && typeof document !== "undefined" && createPortal(
				<ChartTooltip label={fmtTs(timestamps[hoverIdx], groupBy, hours)} mouseX={mouse.x} mouseY={mouse.y}>
					{tipItems.map(item => (
						<div key={item.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
							<span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
							<span style={{ color: "var(--color-foreground)", fontWeight: 500, textTransform: "capitalize", flex: 1 }}>{item.name}</span>
							<span style={{ color: item.color, fontWeight: 700 }}>{fmtMetricVal(item.val, metric)}</span>
						</div>
					))}
				</ChartTooltip>,
				document.body
			)}
		</div>
	);
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

const BM = { top: 16, right: 16, bottom: 56, left: 64 };
const BAR_X_HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h.toString().padStart(2, "0")}:00`);
const BAR_X_DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function BarChart({ readings, deviceNames, colors, visible, metric, xAxis, xAxisCustomN, xAxisCustomUnit }: {
	readings: HistoryEntry[]; deviceNames: string[]; colors: Map<string, string>;
	visible: Set<string>; metric: Metric; xAxis: BarXAxis;
	xAxisCustomN: number; xAxisCustomUnit: BarXAxisUnit;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [uid] = useState(() => `bc${Math.random().toString(36).slice(2, 7)}`);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [hover, setHover] = useState<{ label: string; name: string } | null>(null);
	const [mouse, setMouse] = useState({ x: 0, y: 0 });

	// Always render the container div so ResizeObserver fires on mount
	useEffect(() => {
		const el = containerRef.current; if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	const groups = useMemo((): Array<{ label: string; bars: Array<{ name: string; val: number }> }> => {
		const vis = deviceNames.filter(n => visible.has(n));

		if (xAxis === "device") {
			const map = new Map<string, number>();
			for (const name of deviceNames) {
				const pts = readings
					.map(r => { const d = r.devices.find(x => x.name === name); return d ? { ts: new Date(r.ts).getTime(), w: d.watts } : null; })
					.filter(Boolean).sort((a, b) => a!.ts - b!.ts) as { ts: number; w: number }[];
				let wh = 0;
				for (let i = 1; i < pts.length; i++) {
					wh += (pts[i].w + pts[i - 1].w) / 2 * (pts[i].ts - pts[i - 1].ts) / 3_600_000;
				}
				const avgW = pts.length ? pts.reduce((s, p) => s + p.w, 0) / pts.length : 0;
				map.set(name, metric === "watts" ? avgW : metric === "energy" ? wh : wh / 1000 * COST_PER_KWH);
			}
			return vis.map(name => ({ label: name, bars: [{ name, val: map.get(name) ?? 0 }] }));
		}

		// Cyclical grouping helper: group by a repeating key (hour 0-23, dow 0-6, etc.)
		const makeCyclical = (keyFn: (ts: string) => number, allLabels: string[], keyOffset = 0) => {
			const buckets = new Map<number, Map<string, number[]>>();
			for (const r of readings) {
				const key = keyFn(r.ts);
				if (!buckets.has(key)) buckets.set(key, new Map());
				for (const d of r.devices) {
					if (!visible.has(d.name)) continue;
					if (!buckets.get(key)!.has(d.name)) buckets.get(key)!.set(d.name, []);
					buckets.get(key)!.get(d.name)!.push(d.watts);
				}
			}
			return allLabels
				.map((label, i) => ({
					label,
					bars: vis.map(name => {
						const vals = buckets.get(i + keyOffset)?.get(name) ?? [];
						return { name, val: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
					}),
				}))
				.filter(g => g.bars.some(b => b.val > 0));
		};

		// Absolute grouping helper: group by a computed key, sort by time
		const makeAbsolute = (keyFn: (ts: string) => number, labelFn: (key: number) => string) => {
			const buckets = new Map<number, Map<string, number[]>>();
			for (const r of readings) {
				const key = keyFn(r.ts);
				if (!buckets.has(key)) buckets.set(key, new Map());
				for (const d of r.devices) {
					if (!visible.has(d.name)) continue;
					if (!buckets.get(key)!.has(d.name)) buckets.get(key)!.set(d.name, []);
					buckets.get(key)!.get(d.name)!.push(d.watts);
				}
			}
			return [...buckets.entries()]
				.sort(([a], [b]) => a - b)
				.map(([key, devMap]) => ({
					label: labelFn(key),
					bars: vis.map(name => {
						const vals = devMap.get(name) ?? [];
						return { name, val: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
					}),
				}))
				.filter(g => g.bars.some(b => b.val > 0));
		};

		if (xAxis === "hour-of-day")   return makeCyclical(ts => new Date(ts).getHours(),        BAR_X_HOUR_LABELS);
		if (xAxis === "day-of-week")   return makeCyclical(ts => new Date(ts).getDay(),           BAR_X_DOW_LABELS);
		if (xAxis === "day-of-month")  return makeCyclical(ts => new Date(ts).getDate(),          BAR_X_DOM_LABELS, 1);
		if (xAxis === "month-of-year") return makeCyclical(ts => new Date(ts).getMonth(),         BAR_X_MONTH_LABELS);
		if (xAxis === "year")          return makeAbsolute(ts => new Date(ts).getFullYear(),       key => String(key));

		// Custom: absolute bucket of N units
		const bucketMs = Math.max(60_000, xAxisCustomN * BAR_X_UNIT_MS[xAxisCustomUnit]);
		return makeAbsolute(
			ts => Math.floor(new Date(ts).getTime() / bucketMs) * bucketMs,
			key => {
				const d = new Date(key);
				if (xAxisCustomUnit === "minute" || xAxisCustomUnit === "hour")
					return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
				if (xAxisCustomUnit === "day" || xAxisCustomUnit === "week")
					return d.toLocaleDateString([], { month: "short", day: "numeric" });
				return d.toLocaleDateString([], { month: "short", year: "2-digit" });
			}
		);
	}, [readings, deviceNames, metric, xAxis, xAxisCustomN, xAxisCustomUnit, visible]);

	const visDev = deviceNames.filter(n => visible.has(n));
	const noData = visDev.length === 0 || readings.length === 0;
	const effectiveMetric: Metric = xAxis !== "device" ? "watts" : metric;

	const { w, h } = size;
	const iW = Math.max(0, w - BM.left - BM.right);
	const iH = Math.max(0, h - BM.top - BM.bottom);

	const allVals = groups.flatMap(g => g.bars.map(b => b.val));
	const maxVal = Math.max(...allVals, 0.001);
	const yTicks = computeYTicks(maxVal);
	const yMax = yTicks[yTicks.length - 1];
	const yS = (v: number) => iH - (v / Math.max(yMax, 0.001)) * iH;

	const numGroups = Math.max(groups.length, 1);
	const barsPerGroup = groups[0]?.bars.length ?? Math.max(visDev.length, 1);
	const groupW = iW / numGroups;
	const groupPad = Math.max(4, groupW * 0.15);
	const barSlot = (groupW - groupPad) / Math.max(barsPerGroup, 1);
	const barGap = Math.max(1, barSlot * 0.1);
	const barW = Math.max(4, barSlot - barGap);

	const hoverVal = hover
		? groups.find(g => g.label === hover.label)?.bars.find(b => b.name === hover.name)?.val ?? 0
		: 0;

	return (
		<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
			{noData ? (
				<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)" }}>No data</div>
			) : w > 0 && h > 0 ? (
				<svg width={w} height={h} style={{ display: "block" }}>
					<defs>
						{visDev.map(n => {
							const c = colors.get(n) ?? "#888";
							return (
								<linearGradient key={n} id={`${uid}g${n.replace(/\W/g, '_')}`} x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor={c} stopOpacity="0.9" />
									<stop offset="100%" stopColor={c} stopOpacity="0.6" />
								</linearGradient>
							);
						})}
					</defs>
					<g transform={`translate(${BM.left},${BM.top})`}>
						{yTicks.map(v => (
							<g key={v}>
								<line x1={0} x2={iW} y1={yS(v)} y2={yS(v)} stroke="var(--color-secondary)" strokeDasharray="3,3" strokeWidth={1} />
								<text x={-6} y={yS(v)} textAnchor="end" dominantBaseline="middle" fill="var(--color-foreground-sec)" fontSize={10}>{fmtMetricTick(v, effectiveMetric)}</text>
							</g>
						))}
						{groups.map((g, gi) => {
							const gx = gi * groupW + groupPad / 2;
							const groupCenter = gi * groupW + groupW / 2;
							return (
								<g key={g.label}>
									{g.bars.map((bar, bi) => {
										const bx = gx + bi * barSlot;
										const bh = Math.max(0, iH - yS(bar.val));
										const isHovered = hover?.label === g.label && hover?.name === bar.name;
										return (
											<g key={bar.name}
												onMouseEnter={e => { setHover({ label: g.label, name: bar.name }); setMouse({ x: e.clientX, y: e.clientY }); }}
												onMouseMove={e => setMouse({ x: e.clientX, y: e.clientY })}
												onMouseLeave={() => setHover(null)}
												style={{ cursor: "default" }}
											>
												<rect x={bx} y={yS(bar.val)} width={barW} height={bh}
													fill={`url(#${uid}g${bar.name.replace(/\W/g, '_')})`}
													opacity={isHovered ? 1 : 0.85} rx={3} />
											</g>
										);
									})}
									<text
										transform={`translate(${groupCenter},${iH + 8}) rotate(-35)`}
										textAnchor="end" fill="var(--color-foreground-sec)" fontSize={10}
										style={{ textTransform: "capitalize" }}
									>{g.label}</text>
								</g>
							);
						})}
						<line x1={0} x2={iW} y1={iH} y2={iH} stroke="var(--color-secondary)" strokeWidth={1} />
					</g>
				</svg>
			) : null}
			{hover !== null && typeof document !== "undefined" && createPortal(
				<ChartTooltip label={hover.label} mouseX={mouse.x} mouseY={mouse.y}>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.get(hover.name) ?? "#888", flexShrink: 0 }} />
						<span style={{ color: "var(--color-foreground)", fontWeight: 500, textTransform: "capitalize" }}>{hover.name}</span>
						<span style={{ color: colors.get(hover.name) ?? "#888", fontWeight: 700 }}>{fmtMetricVal(hoverVal, effectiveMetric)}</span>
					</div>
				</ChartTooltip>,
				document.body
			)}
		</div>
	);
}

// ── Candle Chart ──────────────────────────────────────────────────────────────

const CM = { top: 8, right: 16, bottom: 40, left: 52 };

function getAutoCandleMs(spanH: number): number {
	if (spanH <= 2)   return 60_000;
	if (spanH <= 6)   return 300_000;
	if (spanH <= 24)  return 1_800_000;
	if (spanH <= 72)  return 3_600_000;
	if (spanH <= 168) return 14_400_000;
	if (spanH <= 720) return 86_400_000;
	return 604_800_000;
}

function fmtCandleLabel(ts: number, candleMs: number, spanH: number): string {
	const d = new Date(ts);
	if (candleMs < 3_600_000)  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	if (candleMs < 86_400_000) return spanH > 24
		? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
		: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function bucketCandles(readings: HistoryEntry[], spanH: number, candleInterval: CandleInterval) {
	const entry = CANDLE_INTERVALS.find(c => c.id === candleInterval);
	const ms = entry && entry.ms > 0 ? entry.ms : getAutoCandleMs(spanH);
	const bucketKey = (d: Date) => Math.floor(d.getTime() / ms) * ms;
	const map = new Map<number, Map<string, number[]>>();
	for (const r of readings) {
		const key = bucketKey(new Date(r.ts));
		if (!map.has(key)) map.set(key, new Map());
		for (const d of r.devices) {
			if (!map.get(key)!.has(d.name)) map.get(key)!.set(d.name, []);
			map.get(key)!.get(d.name)!.push(d.watts);
		}
	}
	return [...map.entries()].sort(([a], [b]) => a - b).map(([ts, devWatts]) => {
		const label = fmtCandleLabel(ts, ms, spanH);
		const candles: Record<string, Candle> = {};
		for (const [name, watts] of devWatts) {
			const s = [...watts].sort((a, b) => a - b);
			candles[name] = { open: watts[0], close: watts[watts.length - 1], high: s[s.length - 1], low: s[0] };
		}
		return { ts, label, candles };
	});
}

function CandleChart({ readings, deviceNames, colors, visible, hours, candleInterval }: {
	readings: HistoryEntry[]; deviceNames: string[]; colors: Map<string, string>;
	visible: Set<string>; hours: number; candleInterval: CandleInterval;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: ReturnType<typeof bucketCandles>[0] } | null>(null);

	useEffect(() => {
		const el = containerRef.current; if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	const buckets = useMemo(() => bucketCandles(readings, hours, candleInterval), [readings, hours, candleInterval]);
	const visDev = deviceNames.filter(n => visible.has(n));

	if (buckets.length === 0) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)" }}>No data</div>;

	const { w, h } = size;
	const iW = Math.max(0, w - CM.left - CM.right);
	const iH = Math.max(0, h - CM.top - CM.bottom);

	let yMin = Infinity, yMax = -Infinity;
	for (const b of buckets) for (const n of visDev) {
		const c = b.candles[n]; if (c) { yMin = Math.min(yMin, c.low); yMax = Math.max(yMax, c.high); }
	}
	if (yMin === Infinity) { yMin = 0; yMax = 500; }
	const pad = Math.max((yMax - yMin) * 0.08, 5);
	const effMin = Math.max(0, yMin - pad), effMax = yMax + pad;
	const yS = (v: number) => CM.top + iH - ((v - effMin) / (effMax - effMin)) * iH;
	const yTicks = Array.from({ length: 5 }, (_, i) => effMin + (effMax - effMin) * i / 4);
	const slotW = iW / Math.max(buckets.length, 1);
	const candleW = Math.max(3, Math.min(18, slotW / Math.max(visDev.length, 1) - 3));
	const xScale = (i: number) => CM.left + (i + 0.5) * slotW;
	const xStep = Math.max(1, Math.floor(buckets.length / 6));

	return (
		<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", userSelect: "none" }}>
			{w > 0 && h > 0 && (
				<svg width={w} height={h} style={{ display: "block" }}>
					{yTicks.map((v, i) => (
						<g key={i}>
							<line x1={CM.left} y1={yS(v)} x2={CM.left + iW} y2={yS(v)} stroke="var(--color-secondary)" strokeDasharray="3,3" strokeWidth={1} />
							<text x={CM.left - 6} y={yS(v)} textAnchor="end" dominantBaseline="middle" fill="var(--color-foreground-sec)" fontSize={10}>{Math.round(v)}W</text>
						</g>
					))}
					{buckets.map((b, i) => i % xStep !== 0 && i !== buckets.length - 1 ? null : (
						<text key={i} x={xScale(i)} y={CM.top + iH + 16} textAnchor="middle" fill="var(--color-foreground-sec)" fontSize={10}>{b.label}</text>
					))}
					{buckets.map((b, i) => {
						const cx = xScale(i);
						return visDev.map((n, di) => {
							const c = b.candles[n]; if (!c) return null;
							const off = visDev.length > 1 ? (di - (visDev.length - 1) / 2) * (candleW + 3) : 0;
							const x = cx + off;
							const isUp = c.close >= c.open;
							const color = isUp ? "#5dd776" : "#ef4444";
							const bodyTop = Math.min(yS(c.open), yS(c.close));
							const bodyH = Math.max(1, Math.abs(yS(c.close) - yS(c.open)));
							return (
								<g key={`${i}-${n}`}
									onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, bucket: b })}
									onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
									onMouseLeave={() => setTooltip(null)}
								>
									<line x1={x} y1={yS(c.high)} x2={x} y2={yS(c.low)} stroke={color} strokeWidth={1.5} />
									<rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} fillOpacity={0.85} rx={1} />
									<rect x={cx - slotW / 2} y={CM.top} width={slotW} height={iH} fill="transparent" />
								</g>
							);
						});
					})}
					<line x1={CM.left} y1={CM.top + iH} x2={CM.left + iW} y2={CM.top + iH} stroke="var(--color-secondary)" strokeWidth={1} />
				</svg>
			)}
			{tooltip && typeof document !== "undefined" && createPortal(
				<ChartTooltip label={tooltip.bucket.label} mouseX={tooltip.x} mouseY={tooltip.y}>
					{visDev.map(n => {
						const c = tooltip.bucket.candles[n]; if (!c) return null;
						return (
							<div key={n} style={{ marginBottom: 4 }}>
								<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
									<span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.get(n) ?? "#888", flexShrink: 0 }} />
									<span style={{ color: "var(--color-foreground)", fontWeight: 600, textTransform: "capitalize", fontSize: 11 }}>{n}</span>
								</div>
								<div style={{ color: "var(--color-foreground-sec)", fontSize: 10, fontFamily: "monospace", paddingLeft: 13 }}>
									O {c.open.toFixed(1)} H {c.high.toFixed(1)} L {c.low.toFixed(1)} C {c.close.toFixed(1)}W
								</div>
							</div>
						);
					})}
				</ChartTooltip>,
				document.body
			)}
		</div>
	);
}

// ── AnalyticsPanel ────────────────────────────────────────────────────────────

export default function AnalyticsPanel({ chartType, readOnly = false, defaultHours = 24 }: { chartType: ChartType; readOnly?: boolean; defaultHours?: number }) {
	const [hoursInput, setHoursInput] = useState(String(defaultHours));
	const [loading, setLoading] = useState(true);
	const [readings, setReadings] = useState<HistoryEntry[]>([]);
	const [visible, setVisible] = useState<Set<string>>(new Set());
	const [metric, setMetric] = useState<Metric>("watts");
	const [groupBy, setGroupBy] = useState<GroupBy>("auto");
	const [candleInterval, setCandleInterval] = useState<CandleInterval>("auto");
	const [barXAxis, setBarXAxis] = useState<BarXAxis>("device");
	const [barXAxisCustomN, setBarXAxisCustomN] = useState(1);
	const [barXAxisCustomUnit, setBarXAxisCustomUnit] = useState<BarXAxisUnit>("hour");
	const [flyout, setFlyout] = useState<(FlyoutPos & { id: FlyoutId }) | null>(null);

	const hours = Math.max(1, parseInt(hoursInput, 10) || 24);
	const matchedPreset = PRESETS.find(p => p.h === hours);

	const barXMinHours = chartType === "bar" ? getBarXMinHours(barXAxis, barXAxisCustomUnit) : 1;
	const filteredPresets = PRESETS.filter(p => p.h >= barXMinHours);

	// Auto-bump time range when X axis changes to require more data
	useEffect(() => {
		if (chartType !== "bar") return;
		const min = getBarXMinHours(barXAxis, barXAxisCustomUnit);
		const currentH = Math.max(1, parseInt(hoursInput, 10) || 24);
		if (currentH < min) {
			const firstValid = PRESETS.find(p => p.h >= min);
			if (firstValid) setHoursInput(String(firstValid.h));
		}
	}, [barXAxis, barXAxisCustomUnit, chartType]);

	const openFlyout = useCallback((id: FlyoutId, rect: DOMRect, el: HTMLButtonElement) => {
		if (flyout?.id === id) { setFlyout(null); return; }
		const alignRight = rect.left > window.innerWidth * 0.55;
		setFlyout({
			id, anchor: el,
			x: alignRight ? window.innerWidth - rect.right : rect.left,
			y: rect.bottom + 6,
			alignRight,
		});
	}, [flyout?.id]);
	const closeFlyout = useCallback(() => setFlyout(null), []);

	const fetchHistory = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(`/api/power/history?hours=${hours}`);
			if (!res.ok) return;
			setReadings((await res.json()).readings ?? []);
		} finally { setLoading(false); }
	}, [hours]);

	useEffect(() => { fetchHistory(); }, [fetchHistory]);

	const deviceNames = useMemo(
		() => [...new Set(readings.flatMap(r => r.devices.map(d => d.name)))].sort(),
		[readings],
	);

	useEffect(() => {
		setVisible(prev => prev.size > 0 ? new Set([...prev].filter(n => deviceNames.includes(n))) : new Set(deviceNames));
	}, [deviceNames.join(",")]);

	const colors = useMemo(() => {
		const map = new Map<string, string>();
		deviceNames.forEach((n, i) => map.set(n, chartColor(i)));
		return map;
	}, [deviceNames]);

	const toggleDevice = (name: string) => {
		setVisible(prev => {
			const next = new Set(prev);
			if (next.has(name)) { if (next.size > 1) next.delete(name); } else next.add(name);
			return next;
		});
	};

	const displayReadings = useMemo(() => aggregateReadings(readings, groupBy), [readings, groupBy]);

	const visibleDevices = useMemo(() => deviceNames.filter(n => visible.has(n)), [deviceNames, visible]);

	const deviceStats = useMemo(() => {
		const map = new Map<string, { wh: number; avgW: number; cost: number }>();
		for (const name of visibleDevices) {
			const pts = readings
				.map(r => { const d = r.devices.find(x => x.name === name); return d ? { ts: new Date(r.ts).getTime(), w: d.watts } : null; })
				.filter(Boolean).sort((a, b) => a!.ts - b!.ts) as { ts: number; w: number }[];
			let wh = 0;
			for (let i = 1; i < pts.length; i++) {
				wh += (pts[i].w + pts[i - 1].w) / 2 * (pts[i].ts - pts[i - 1].ts) / 3_600_000;
			}
			const avgW = pts.length ? pts.reduce((s, p) => s + p.w, 0) / pts.length : 0;
			map.set(name, { wh, avgW, cost: wh / 1000 * COST_PER_KWH });
		}
		return map;
	}, [readings, visibleDevices]);

	const totalStats = useMemo(() => {
		let wh = 0, cost = 0, avgW = 0;
		for (const s of deviceStats.values()) { wh += s.wh; cost += s.cost; avgW += s.avgW; }
		return { wh, cost, avgW };
	}, [deviceStats]);

	const fmtSummaryVal = (name: string) => {
		const s = deviceStats.get(name);
		if (!s) return "—";
		if (metric === "watts")  return `${s.avgW.toFixed(1)} W`;
		if (metric === "energy") return s.wh >= 1000 ? `${(s.wh / 1000).toFixed(3)} kWh` : `${s.wh.toFixed(1)} Wh`;
		return `$${s.cost.toFixed(4)}`;
	};

	const fmtTotalVal = () => {
		if (metric === "watts")  return `${totalStats.avgW.toFixed(1)} W`;
		if (metric === "energy") return totalStats.wh >= 1000 ? `${(totalStats.wh / 1000).toFixed(3)} kWh` : `${totalStats.wh.toFixed(1)} Wh`;
		return `$${totalStats.cost.toFixed(4)}`;
	};

	const totalSubLabel = metric === "watts" ? "avg power" : metric === "energy" ? `$${totalStats.cost.toFixed(4)}` : `${totalStats.wh >= 1000 ? (totalStats.wh / 1000).toFixed(3) + " kWh" : totalStats.wh.toFixed(1) + " Wh"}`;
	const deviceSubLabel = (name: string) => {
		const s = deviceStats.get(name); if (!s) return "";
		if (metric === "watts")  return `${readings.filter(r => r.devices.some(d => d.name === name)).length} readings`;
		if (metric === "energy") return `$${s.cost.toFixed(4)}`;
		return `${s.wh >= 1000 ? (s.wh / 1000).toFixed(3) + " kWh" : s.wh.toFixed(1) + " Wh"}`;
	};

	// Derived labels for toolbar buttons
	const metricLabel    = METRICS.find(m => m.id === metric)?.label ?? "Power";
	const rangeLabel     = matchedPreset ? matchedPreset.label : `${hours}h`;
	const groupLabel     = GROUP_BY_OPTIONS.find(g => g.id === groupBy)?.label ?? "Auto";
	const intervalLabel  = CANDLE_INTERVALS.find(c => c.id === candleInterval)?.label ?? "Auto";
	const devLabel       = visible.size === deviceNames.length ? "All" : `${visible.size}`;
	const barXAxisLabel  = barXAxis === "custom"
		? `Every ${barXAxisCustomN}${BAR_X_UNIT_SHORT[barXAxisCustomUnit]}`
		: BAR_X_AXIS_OPTIONS.find(o => o.id === barXAxis)?.label ?? "Device";

	const refreshBtn = (
		<button onClick={fetchHistory} disabled={loading} style={{
			display: "flex", alignItems: "center", padding: "5px 8px", borderRadius: 8,
			background: "transparent", border: "1px solid var(--color-secondary)",
			color: "var(--color-foreground-sec)", cursor: "pointer",
		}}>
			<IconRefresh size={13} className={loading ? "animate-spin" : ""} />
		</button>
	);

	// Only render flyouts when open and on client
	const activeFlyout = typeof document !== "undefined" ? flyout : null;

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

			{!readOnly && (chartType === "candle" ? (
				<>
					{/* ── Candlestick toolbar ── */}
					<div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 6, padding: "6px 14px 8px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)" }}>
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<span style={ctrlLabelStyle}>Time Range</span>
							<HelpTooltip text="How far back to load data. Pick a preset or type a custom number of hours.">
								<CtrlBtn icon={<IconClock size={13} />} label={rangeLabel} isOpen={flyout?.id === "range"} onClick={(rect, el) => openFlyout("range", rect, el)} />
							</HelpTooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<span style={ctrlLabelStyle}>Candle Period</span>
							<HelpTooltip text="The time interval each candlestick represents. Auto picks the best size for the chosen range.">
								<CtrlBtn icon={<IconChartBar size={13} />} label={intervalLabel} isOpen={flyout?.id === "interval"} onClick={(rect, el) => openFlyout("interval", rect, el)} />
							</HelpTooltip>
						</div>
						{deviceNames.length > 0 && (
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								<span style={ctrlLabelStyle}>Devices</span>
								<HelpTooltip text="Toggle individual devices on or off to focus the chart on specific plugs.">
									<CtrlBtn icon={<IconEye size={13} />} label={devLabel} isOpen={flyout?.id === "devices"} onClick={(rect, el) => openFlyout("devices", rect, el)} />
								</HelpTooltip>
							</div>
						)}
						<div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
							<span style={ctrlLabelStyle}>Refresh</span>
							<HelpTooltip text="Reload chart data from the server.">
								{refreshBtn}
							</HelpTooltip>
						</div>
					</div>
					{activeFlyout?.id === "range" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Time Range">
							<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
								{filteredPresets.map(({ label, h }) => (
									<button key={h} onClick={() => { setHoursInput(String(h)); closeFlyout(); }} style={{
										padding: "5px 4px", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer",
										border: `1px solid ${matchedPreset?.h === h ? "var(--color-blue)" : "var(--color-secondary)"}`,
										background: matchedPreset?.h === h ? "color-mix(in srgb, var(--color-blue) 18%, transparent)" : "transparent",
										color: matchedPreset?.h === h ? "var(--color-blue)" : "var(--color-foreground-sec)",
										transition: "all 120ms",
									}}>{label}</button>
								))}
							</div>
							<div style={{ height: 1, background: "var(--color-secondary)", margin: "4px 2px 10px" }} />
							<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
								<span style={{ fontSize: 11, color: "var(--color-foreground-sec)", fontWeight: 500 }}>Custom</span>
								<input type="text" inputMode="numeric" pattern="[0-9]*" value={hoursInput}
									onChange={e => setHoursInput(e.target.value.replace(/[^0-9]/g, ""))}
									style={{ flex: 1, padding: "5px 8px", borderRadius: 7, fontSize: 11, background: "color-mix(in srgb, var(--color-secondary) 50%, transparent)", border: `1px solid ${!matchedPreset ? "var(--color-blue)" : "var(--color-secondary)"}`, color: "var(--color-foreground)", outline: "none" }} />
								<span style={{ fontSize: 11, color: "var(--color-foreground-sec)" }}>h</span>
							</div>
						</Flyout>
					)}
					{activeFlyout?.id === "interval" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Candle Period">
							{CANDLE_INTERVALS.map(c => (
								<FlyoutOpt key={c.id}
									label={c.id === "auto" ? `Auto (${CANDLE_INTERVALS.find(x => x.ms === getAutoCandleMs(hours))?.label ?? "auto"})` : c.label}
									selected={candleInterval === c.id}
									onClick={() => { setCandleInterval(c.id); closeFlyout(); }} />
							))}
						</Flyout>
					)}
					{activeFlyout?.id === "devices" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Devices">
							{deviceNames.map(name => (
								<FlyoutOpt key={name} label={name} selected={visible.has(name)} color={colors.get(name)}
									onClick={() => toggleDevice(name)} />
							))}
						</Flyout>
					)}
				</>
			) : (
				<>
					{/* ── Line / bar toolbar ── */}
					<div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 6, padding: "6px 14px 8px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)" }}>
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<span style={ctrlLabelStyle}>Y axis</span>
							<HelpTooltip text="What to measure: Power (live watts), Energy (kWh consumed), or estimated Cost in dollars.">
								<CtrlBtn icon={<IconBolt size={13} />} label={metricLabel} isOpen={flyout?.id === "metric"} onClick={(rect, el) => openFlyout("metric", rect, el)} />
							</HelpTooltip>
						</div>
						{chartType === "bar" && (
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								<span style={ctrlLabelStyle}>X axis</span>
								<HelpTooltip text="What to use as the X axis: one bar per device, or group readings by hour of day or day of week.">
									<CtrlBtn icon={<IconArrowsHorizontal size={13} />} label={barXAxisLabel} isOpen={flyout?.id === "xaxis"} onClick={(rect, el) => openFlyout("xaxis", rect, el)} />
								</HelpTooltip>
							</div>
						)}
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<span style={ctrlLabelStyle}>Time Range</span>
							<HelpTooltip text="How far back to load data. Pick a preset or type a custom number of hours.">
								<CtrlBtn icon={<IconClock size={13} />} label={rangeLabel} isOpen={flyout?.id === "range"} onClick={(rect, el) => openFlyout("range", rect, el)} />
							</HelpTooltip>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<span style={ctrlLabelStyle}>Group By</span>
							<HelpTooltip text="How to bucket data points in time. Auto selects the best interval for the chosen range.">
								<CtrlBtn icon={<IconCalendarStats size={13} />} label={groupLabel} isOpen={flyout?.id === "groupby"} onClick={(rect, el) => openFlyout("groupby", rect, el)} />
							</HelpTooltip>
						</div>
						{deviceNames.length > 0 && (
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								<span style={ctrlLabelStyle}>Devices</span>
								<HelpTooltip text="Toggle individual devices on or off to focus the chart on specific plugs.">
									<CtrlBtn icon={<IconEye size={13} />} label={devLabel} isOpen={flyout?.id === "devices"} onClick={(rect, el) => openFlyout("devices", rect, el)} />
								</HelpTooltip>
							</div>
						)}
						<div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
							<span style={ctrlLabelStyle}>Refresh</span>
							<HelpTooltip text="Reload chart data from the server.">
								{refreshBtn}
							</HelpTooltip>
						</div>
					</div>
					{activeFlyout?.id === "metric" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Y Axis">
							{METRICS.map(m => (
								<FlyoutOpt key={m.id} label={m.label} selected={metric === m.id} onClick={() => { setMetric(m.id); closeFlyout(); }} />
							))}
						</Flyout>
					)}
					{activeFlyout?.id === "xaxis" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="X Axis">
							<FlyoutOpt label="Device" selected={barXAxis === "device"} onClick={() => { setBarXAxis("device"); closeFlyout(); }} />
							<div style={{ height: 1, background: "var(--color-secondary)", margin: "6px 2px 2px" }} />
							<p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-foreground-sec)", margin: "4px 4px 2px" }}>Time</p>
							<p style={{ fontSize: 9, fontWeight: 600, color: "var(--color-foreground-sec)", margin: "4px 10px 2px", opacity: 0.75 }}>Hour</p>
							<FlyoutOpt label="Hour of day" selected={barXAxis === "hour-of-day"} onClick={() => { setBarXAxis("hour-of-day"); closeFlyout(); }} />
							<p style={{ fontSize: 9, fontWeight: 600, color: "var(--color-foreground-sec)", margin: "6px 10px 2px", opacity: 0.75 }}>Day</p>
							<FlyoutOpt label="Day of week" selected={barXAxis === "day-of-week"} onClick={() => { setBarXAxis("day-of-week"); closeFlyout(); }} />
							<FlyoutOpt label="Day of month" selected={barXAxis === "day-of-month"} onClick={() => { setBarXAxis("day-of-month"); closeFlyout(); }} />
							<p style={{ fontSize: 9, fontWeight: 600, color: "var(--color-foreground-sec)", margin: "6px 10px 2px", opacity: 0.75 }}>Month</p>
							<FlyoutOpt label="Month of year" selected={barXAxis === "month-of-year"} onClick={() => { setBarXAxis("month-of-year"); closeFlyout(); }} />
							<p style={{ fontSize: 9, fontWeight: 600, color: "var(--color-foreground-sec)", margin: "6px 10px 2px", opacity: 0.75 }}>Year</p>
							<FlyoutOpt label="Year" selected={barXAxis === "year"} onClick={() => { setBarXAxis("year"); closeFlyout(); }} />
							<div style={{ height: 1, background: "var(--color-secondary)", margin: "6px 2px 4px" }} />
							<p style={{ fontSize: 9, fontWeight: 600, color: "var(--color-foreground-sec)", margin: "2px 10px 4px", opacity: 0.75 }}>Custom</p>
							<button
								onClick={() => setBarXAxis("custom")}
								style={{
									width: "100%", display: "flex", alignItems: "center", gap: 7,
									padding: "7px 10px", borderRadius: 8, border: "none",
									background: barXAxis === "custom" ? "color-mix(in srgb, var(--color-blue) 14%, transparent)" : "transparent",
									color: barXAxis === "custom" ? "var(--color-blue)" : "var(--color-foreground)",
									cursor: "pointer", fontSize: 12, fontWeight: barXAxis === "custom" ? 600 : 400,
									transition: "background 100ms",
								}}
							>
								<span style={{
									width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
									background: barXAxis === "custom" ? "var(--color-blue)" : "var(--color-secondary)",
									boxShadow: barXAxis === "custom" ? "0 0 0 2px color-mix(in srgb, var(--color-blue) 25%, transparent)" : "none",
								}} />
								Every
								<input
									type="text" inputMode="numeric" pattern="[0-9]*" value={barXAxisCustomN}
									onClick={e => { e.stopPropagation(); setBarXAxis("custom"); }}
									onChange={e => { setBarXAxis("custom"); setBarXAxisCustomN(Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1)); }}
									style={{
										width: 38, padding: "2px 4px", borderRadius: 5, fontSize: 11, textAlign: "center",
										background: "color-mix(in srgb, var(--color-secondary) 70%, transparent)",
										border: "1px solid var(--color-secondary)", color: "var(--color-foreground)", outline: "none",
									}}
								/>
								<select
									value={barXAxisCustomUnit}
									onClick={e => { e.stopPropagation(); setBarXAxis("custom"); }}
									onChange={e => { setBarXAxis("custom"); setBarXAxisCustomUnit(e.target.value as BarXAxisUnit); }}
									style={{
										padding: "2px 4px", borderRadius: 5, fontSize: 11,
										background: "color-mix(in srgb, var(--color-secondary) 70%, transparent)",
										border: "1px solid var(--color-secondary)", color: "var(--color-foreground)",
										outline: "none", cursor: "pointer",
									}}
								>
									<option value="minute">min</option>
									<option value="hour">hour</option>
									<option value="day">day</option>
									<option value="week">week</option>
									<option value="month">month</option>
								</select>
							</button>
						</Flyout>
					)}
					{activeFlyout?.id === "range" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Time Range">
							<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
								{filteredPresets.map(({ label, h }) => (
									<button key={h} onClick={() => { setHoursInput(String(h)); closeFlyout(); }} style={{
										padding: "5px 4px", borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer",
										border: `1px solid ${matchedPreset?.h === h ? "var(--color-blue)" : "var(--color-secondary)"}`,
										background: matchedPreset?.h === h ? "color-mix(in srgb, var(--color-blue) 18%, transparent)" : "transparent",
										color: matchedPreset?.h === h ? "var(--color-blue)" : "var(--color-foreground-sec)",
										transition: "all 120ms",
									}}>{label}</button>
								))}
							</div>
							<div style={{ height: 1, background: "var(--color-secondary)", margin: "4px 2px 10px" }} />
							<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
								<span style={{ fontSize: 11, color: "var(--color-foreground-sec)", fontWeight: 500 }}>Custom</span>
								<input type="text" inputMode="numeric" pattern="[0-9]*" value={hoursInput}
									onChange={e => setHoursInput(e.target.value.replace(/[^0-9]/g, ""))}
									style={{ flex: 1, padding: "5px 8px", borderRadius: 7, fontSize: 11, background: "color-mix(in srgb, var(--color-secondary) 50%, transparent)", border: `1px solid ${!matchedPreset ? "var(--color-blue)" : "var(--color-secondary)"}`, color: "var(--color-foreground)", outline: "none" }} />
								<span style={{ fontSize: 11, color: "var(--color-foreground-sec)" }}>h</span>
							</div>
						</Flyout>
					)}
					{activeFlyout?.id === "groupby" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Group By">
							{GROUP_BY_OPTIONS.map(g => (
								<FlyoutOpt key={g.id} label={g.label} selected={groupBy === g.id} onClick={() => { setGroupBy(g.id); closeFlyout(); }} />
							))}
						</Flyout>
					)}
					{activeFlyout?.id === "devices" && (
						<Flyout pos={activeFlyout} onClose={closeFlyout} title="Devices">
							{deviceNames.map(name => (
								<FlyoutOpt key={name} label={name} selected={visible.has(name)} color={colors.get(name)}
									onClick={() => toggleDevice(name)} />
							))}
						</Flyout>
					)}
				</>
			))}

			{/* ── Summary strip (line/bar only) ── */}
			{!readOnly && chartType !== "candle" && (
				<div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: `repeat(${1 + visibleDevices.length}, 1fr)`, gap: 8, padding: "8px 14px" }}>
					<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 10, padding: "8px 14px" }}>
						<p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-foreground-sec)", margin: "0 0 3px" }}>
							Total {metric === "watts" ? "power" : metric === "energy" ? "energy" : "cost"}
						</p>
						<p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>{fmtTotalVal()}</p>
						<p style={{ fontSize: 9, color: "var(--color-foreground-sec)", margin: 0 }}>{totalSubLabel}</p>
					</div>
					{visibleDevices.map(name => {
						const color = colors.get(name) ?? "#888";
						return (
							<div key={name} style={{ border: "1px solid var(--color-secondary)", borderRadius: 10, padding: "8px 14px" }}>
								<p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", color: "var(--color-foreground-sec)", margin: "0 0 3px", textTransform: "capitalize" }}>
									{name} {metric === "watts" ? "avg" : metric === "energy" ? "energy" : "cost"}
								</p>
								<p style={{ fontSize: 14, fontWeight: 700, color, margin: 0 }}>{fmtSummaryVal(name)}</p>
								<p style={{ fontSize: 9, color: "var(--color-foreground-sec)", margin: 0 }}>{deviceSubLabel(name)}</p>
							</div>
						);
					})}
				</div>
			)}

			{/* ── Hint ── */}
			{!readOnly && (
				<div style={{ flexShrink: 0, padding: "0 14px 4px" }}>
					<p style={{ fontSize: 9, color: "var(--color-foreground-sec)", opacity: 0.5, margin: 0 }}>
						{chartType === "candle"
							? "Hover candle for OHLC · price is watts"
							: "Scroll to zoom X · Shift+scroll Y · drag to pan · double-click to reset"}
					</p>
				</div>
			)}

			{/* ── Chart ── */}
			<div style={{ flex: 1, minHeight: 0, padding: "0 8px 12px" }}>
				{loading ? (
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)", gap: 8 }}>
						<IconRefresh size={16} className="animate-spin" /> Loading…
					</div>
				) : readings.length === 0 ? (
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)" }}>
						No readings available.
					</div>
				) : chartType === "line" ? (
					<LineChart readings={displayReadings} deviceNames={deviceNames} colors={colors} visible={visible} hours={hours} metric={metric} groupBy={groupBy} />
				) : chartType === "bar" ? (
					<BarChart readings={readings} deviceNames={deviceNames} colors={colors} visible={visible} metric={metric} xAxis={barXAxis} xAxisCustomN={barXAxisCustomN} xAxisCustomUnit={barXAxisCustomUnit} />
				) : (
					<CandleChart readings={readings} deviceNames={deviceNames} colors={colors} visible={visible} hours={hours} candleInterval={candleInterval} />
				)}
			</div>
		</div>
	);
}
