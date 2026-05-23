"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	IconRefresh, IconChartBar,
	IconChartLine, IconChartCandle, IconLayoutSidebarRight, IconX, IconCalendar,
} from "@tabler/icons-react";
import RangePicker, { type RangeUnit, RANGE_UNIT_HOURS, initRangeFromHours } from "@/app/components/RangePicker";
import IntervalPicker, { INTERVAL_UNITS } from "@/app/components/IntervalPicker";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeviceReading { name: string; watts: number; on: boolean; today_wh: number; month_wh: number; }
interface HistoryEntry { ts: string; devices: DeviceReading[]; }
interface Candle { open: number; close: number; high: number; low: number; }
type ChartType = "line" | "bar" | "candle";
type Metric = "watts" | "energy" | "cost";
type GroupBy = "auto" | "hour" | "day" | "month" | "year" | "custom";
type GroupByUnit = "minute" | "hour" | "day" | "week" | "month" | "year";
type CandleInterval = "auto" | "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
type PanelTab = "time" | "chart";
type BarXAxis = "device" | "hour-of-day" | "day-of-week" | "day-of-month" | "month-of-year" | "year" | "custom";
type BarXAxisUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

// ── Constants ─────────────────────────────────────────────────────────────────

const COST_PER_KWH = 0.24;


const METRICS: { id: Metric; label: string }[] = [
	{ id: "watts",  label: "Power" },
	{ id: "energy", label: "Energy" },
	{ id: "cost",   label: "Cost" },
];

const GROUP_BY_OPTIONS: { id: GroupBy; label: string }[] = [
	{ id: "auto",   label: "Auto" },
	{ id: "hour",   label: "Hour" },
	{ id: "day",    label: "Day" },
	{ id: "month",  label: "Month" },
	{ id: "year",   label: "Year" },
	{ id: "custom", label: "Custom" },
];

const GROUP_BY_UNIT_MS: Record<GroupByUnit, number> = {
	minute: 60_000, hour: 3_600_000, day: 86_400_000,
	week: 604_800_000, month: 30 * 86_400_000, year: 365 * 86_400_000,
};
const GROUP_BY_UNIT_SHORT: Record<GroupByUnit, string> = {
	minute: "min", hour: "hr", day: "d", week: "wk", month: "mo", year: "yr",
};

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
	week: 604_800_000, month: 30 * 86_400_000, year: 365 * 86_400_000,
};
const BAR_X_UNIT_SHORT: Record<BarXAxisUnit, string> = {
	minute: "min", hour: "hr", day: "d", week: "wk", month: "mo", year: "yr",
};
const BAR_X_DOM_LABELS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const BAR_X_MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CHART_PALETTE = [
	"#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa",
	"#f472b6", "#22d3ee", "#a3e635", "#fb923c", "#818cf8",
];
function chartColor(i: number) { return CHART_PALETTE[i % CHART_PALETTE.length]; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAutoBarInterval(hours: number): { n: number; unit: BarXAxisUnit } {
	if (hours <= 2)    return { n: 5,  unit: "minute" };
	if (hours <= 6)    return { n: 15, unit: "minute" };
	if (hours <= 24)   return { n: 1,  unit: "hour"   };
	if (hours <= 168)  return { n: 6,  unit: "hour"   };
	if (hours <= 720)  return { n: 1,  unit: "day"    };
	if (hours <= 8760) return { n: 1,  unit: "week"   };
	return                    { n: 1,  unit: "month"  };
}

function getBarXMinHours(xAxis: BarXAxis, customUnit: BarXAxisUnit): number {
	if (xAxis === "device") return 1;
	if (customUnit === "minute" || customUnit === "hour") return 1;
	if (customUnit === "day") return 24;
	if (customUnit === "week") return 168;
	if (customUnit === "month") return 720;
	return 8760; // year
}

function getBucketKey(d: Date, groupBy: GroupBy, customMs?: number): number {
	if (groupBy === "custom" && customMs) return Math.floor(d.getTime() / customMs) * customMs;
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
	if (spanH <= 72) return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
	return d.toLocaleDateString([], { month: "short", day: "numeric" });
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

function catmullRomPath(pts: [number, number][], yFloor: number, tension = 1 / 6): string {
	if (pts.length === 0) return "";
	const cy = (y: number) => Math.min(y, yFloor);
	const atFloor = (y: number) => y >= yFloor - 0.5;
	if (tension <= 0) {
		// Linear — skip bezier entirely
		let d = `M ${pts[0][0].toFixed(1)} ${cy(pts[0][1]).toFixed(1)}`;
		for (let i = 1; i < pts.length; i++)
			d += ` L ${pts[i][0].toFixed(1)} ${cy(pts[i][1]).toFixed(1)}`;
		return d;
	}
	let d = `M ${pts[0][0].toFixed(1)} ${cy(pts[0][1]).toFixed(1)}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p1 = pts[i], p2 = pts[i + 1];
		if (atFloor(p1[1]) && atFloor(p2[1])) { d += ` L ${p2[0].toFixed(1)} ${yFloor.toFixed(1)}`; continue; }
		const p0 = pts[Math.max(0, i - 1)];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const cp1x = Math.max(p1[0], Math.min(p2[0], p1[0] + (p2[0] - p0[0]) * tension));
		const cp1y = cy(p1[1] + (p2[1] - p0[1]) * tension);
		const cp2x = Math.max(p1[0], Math.min(p2[0], p2[0] - (p3[0] - p1[0]) * tension));
		const cp2y = cy(p2[1] - (p3[1] - p1[1]) * tension);
		d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2[0].toFixed(1)} ${cy(p2[1]).toFixed(1)}`;
	}
	return d;
}

function ReactLogo({ size }: { size: number }) {
	const r = size / 2;
	return (
		<svg width={size} height={size} viewBox="-11 -10 22 20" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="0" cy="0" r="1.9" fill="currentColor" />
			<ellipse cx="0" cy="0" rx="10" ry="3.6" stroke="currentColor" strokeWidth="1.1" />
			<ellipse cx="0" cy="0" rx="10" ry="3.6" stroke="currentColor" strokeWidth="1.1" transform="rotate(60)" />
			<ellipse cx="0" cy="0" rx="10" ry="3.6" stroke="currentColor" strokeWidth="1.1" transform="rotate(120)" />
		</svg>
	);
	void r;
}

function aggregateReadings(readings: HistoryEntry[], groupBy: GroupBy, customMs?: number): HistoryEntry[] {
	if (groupBy === "auto") return readings;
	const buckets = new Map<number, Map<string, { watts: number[]; on: boolean }>>();
	for (const r of readings) {
		const key = getBucketKey(new Date(r.ts), groupBy, customMs);
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

function padLineToRange(
	readings: HistoryEntry[],
	startMs: number, endMs: number,
	groupBy: GroupBy, customMs: number,
	deviceNames: string[]
): HistoryEntry[] {
	if (deviceNames.length === 0 || endMs <= startMs) return readings;

	let stepMs: number;
	if (groupBy === "custom") {
		stepMs = Math.max(1_000, customMs);
	} else if (groupBy === "hour") {
		stepMs = 3_600_000;
	} else if (groupBy === "day") {
		stepMs = 86_400_000;
	} else if (groupBy === "month") {
		stepMs = 30 * 86_400_000;
	} else if (groupBy === "year") {
		stepMs = 365 * 86_400_000;
	} else {
		if (readings.length >= 2) {
			const deltas: number[] = [];
			for (let i = 1; i < readings.length; i++)
				deltas.push(new Date(readings[i].ts).getTime() - new Date(readings[i - 1].ts).getTime());
			deltas.sort((a, b) => a - b);
			stepMs = deltas[Math.floor(deltas.length / 2)];
		} else {
			const spanH = (endMs - startMs) / 3_600_000;
			stepMs = spanH <= 6 ? 300_000 : spanH <= 24 ? 1_800_000 : spanH <= 72 ? 3_600_000 : 86_400_000;
		}
	}

	// Cap at 2000 points to avoid perf issues
	const spanMs = endMs - startMs;
	if (spanMs / stepMs > 2000) stepMs = Math.ceil(spanMs / 2000);

	// Build lookup from existing data
	const dataMap = new Map<number, Map<string, number>>();
	for (const r of readings) {
		const snapped = Math.round(new Date(r.ts).getTime() / stepMs) * stepMs;
		const devMap = new Map<string, number>();
		for (const d of r.devices) devMap.set(d.name, d.watts);
		dataMap.set(snapped, devMap);
	}

	const firstT = Math.ceil(startMs / stepMs) * stepMs;
	const result: HistoryEntry[] = [];
	for (let t = firstT; t <= endMs + stepMs * 0.01; t += stepMs) {
		const devMap = dataMap.get(t);
		result.push({
			ts: new Date(t).toISOString(),
			devices: deviceNames.map(name => ({
				name, watts: devMap?.get(name) ?? 0,
				on: false, today_wh: 0, month_wh: 0,
			})),
		});
	}
	return result.length > 0 ? result : readings;
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

// ── Panel option row ─────────────────────────────────────────────────────────

function CheckboxIndicator({ selected, size }: { selected: boolean; size: number }) {
	return (
		<span style={{
			width: size, height: size, borderRadius: 3, flexShrink: 0,
			border: `1.5px solid ${selected ? "var(--color-blue)" : "color-mix(in srgb, var(--color-foreground-sec) 55%, transparent)"}`,
			background: selected ? "var(--color-blue)" : "transparent",
			display: "flex", alignItems: "center", justifyContent: "center",
			transition: "background 120ms, border-color 120ms",
		}}>
			{selected && (
				<svg width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} viewBox="0 0 10 10" fill="none">
					<polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)}
		</span>
	);
}

function PanelOpt({ label, selected, color, onClick, mobile }: {
	label: string; selected: boolean; color?: string; onClick: () => void; mobile?: boolean;
}) {
	const cb = mobile ? 17 : 13;
	return (
		<button
			onClick={onClick}
			onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--color-secondary) 55%, transparent)"; }}
			onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
			style={{
				width: "100%", display: "flex", alignItems: "center", gap: mobile ? 10 : 8,
				padding: mobile ? "11px 12px" : "6px 12px",
				borderRadius: 6, border: "none",
				background: "transparent",
				cursor: "pointer", textAlign: "left",
				transition: "background 80ms",
			}}
		>
			<CheckboxIndicator selected={selected} size={cb} />
			{color && (
				<span style={{
					width: mobile ? 8 : 6, height: mobile ? 8 : 6,
					borderRadius: "50%", flexShrink: 0,
					background: color,
				}} />
			)}
			<span style={{
				fontSize: mobile ? 14 : 13,
				color: "var(--color-foreground)",
				fontWeight: 400,
			}}>{label}</span>
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

// ── Moving average ────────────────────────────────────────────────────────────

function bucketByCount(readings: HistoryEntry[], n: number): HistoryEntry[] {
	if (n <= 1) return readings;
	const out: HistoryEntry[] = [];
	for (let i = 0; i < readings.length; i += n) {
		const chunk = readings.slice(i, Math.min(i + n, readings.length));
		const ts = chunk[Math.floor((chunk.length - 1) / 2)].ts;
		const devMap = new Map<string, { sum: number; count: number; ref: DeviceReading }>();
		for (const r of chunk) {
			for (const d of r.devices) {
				if (!devMap.has(d.name)) devMap.set(d.name, { sum: 0, count: 0, ref: d });
				const e = devMap.get(d.name)!;
				e.sum += d.watts; e.count++;
			}
		}
		out.push({ ts, devices: [...devMap.values()].map(({ sum, count, ref }) => ({ ...ref, watts: sum / count })) });
	}
	return out;
}

// ── Line Chart ────────────────────────────────────────────────────────────────

const LM = { top: 8, right: 16, bottom: 64, left: 56 };

function LineChart({ readings, deviceNames, colors, visible, hours, metric, groupBy, liveMode = false, tension = 1 / 6 }: {
	readings: HistoryEntry[]; deviceNames: string[]; colors: Map<string, string>;
	visible: Set<string>; hours: number; metric: Metric; groupBy: GroupBy; liveMode?: boolean; tension?: number;
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
	const touchRef = useRef<{
		fingers: 1 | 2;
		x0: number;
		pan0: number;
		sx0: number;
		dist0?: number;
	} | null>(null);

	useEffect(() => {
		const el = containerRef.current; if (!el) return;
		const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
		ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
		return () => ro.disconnect();
	}, []);

	useEffect(() => { if (!liveMode) setZoom({ sx: 1, px: 0, sy: 1 }); }, [hours, groupBy, liveMode]);

	// In live mode, auto-scroll to the right edge (latest data) when new points arrive
	useEffect(() => {
		if (!liveMode) return;
		const { sx } = zoomRef.current;
		if (sx <= 1) return; // already showing all data
		setZoom(prev => ({ ...prev, px: innerWRef.current * (1 - prev.sx) }));
	}, [readings.length, liveMode]);

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

	const onTouchStart = (e: React.TouchEvent<SVGRectElement>) => {
		if (e.touches.length === 1) {
			touchRef.current = {
				fingers: 1,
				x0: e.touches[0].clientX,
				pan0: zoomRef.current.px,
				sx0: zoomRef.current.sx,
			};
		} else if (e.touches.length >= 2) {
			const t0 = e.touches[0], t1 = e.touches[1];
			const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
			const midClientX = (t0.clientX + t1.clientX) / 2;
			const rect = (e.currentTarget as Element).getBoundingClientRect();
			touchRef.current = {
				fingers: 2,
				x0: midClientX - rect.left,
				pan0: zoomRef.current.px,
				sx0: zoomRef.current.sx,
				dist0: dist,
			};
		}
	};

	const onTouchMove = (e: React.TouchEvent<SVGRectElement>) => {
		if (!touchRef.current) return;
		const iW = innerWRef.current;
		if (e.touches.length >= 2 && touchRef.current.dist0 !== undefined) {
			const t0 = e.touches[0], t1 = e.touches[1];
			const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
			const scale = newDist / touchRef.current.dist0;
			const nsx = Math.max(1, touchRef.current.sx0 * scale);
			const mx = touchRef.current.x0;
			const npx = Math.min(0, Math.max(iW * (1 - nsx), mx - (mx - touchRef.current.pan0) * (nsx / touchRef.current.sx0)));
			setZoom(p => ({ ...p, sx: nsx, px: npx }));
		} else if (e.touches.length === 1 && touchRef.current.fingers === 1) {
			const dx = e.touches[0].clientX - touchRef.current.x0;
			const { sx } = zoomRef.current;
			const npx = Math.min(0, Math.max(iW * (1 - sx), touchRef.current.pan0 + dx));
			setZoom(p => ({ ...p, px: npx }));
		}
	};

	const onTouchEnd = () => { touchRef.current = null; };

	const timestamps = useMemo(() => readings.map(r => r.ts), [readings]);
	const seriesData = useMemo(() => buildSeriesData(readings, deviceNames, metric), [readings, deviceNames, metric]);

	const { w, h } = size;

	if (timestamps.length === 0) {
		const nowMs = Date.now();
		const startMs = nowMs - hours * 3_600_000;
		const N = 7;
		const ghostTs = Array.from({ length: N }, (_, i) =>
			new Date(startMs + (i / (N - 1)) * hours * 3_600_000).toISOString()
		);
		const iW2 = Math.max(0, w - LM.left - LM.right);
		const iH2 = Math.max(0, h - LM.top - LM.bottom);
		const gx = (i: number) => (i / (N - 1)) * iW2;
		return (
			<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
				{w > 0 && h > 0 && (
					<svg width={w} height={h} style={{ display: "block" }}>
						<g transform={`translate(${LM.left},${LM.top})`}>
							<line x1={0} x2={iW2} y1={iH2} y2={iH2} stroke="var(--color-secondary)" strokeDasharray="3,3" strokeWidth={1} />
							<text x={-6} y={iH2} textAnchor="end" dominantBaseline="middle" fill="var(--color-foreground-sec)" fontSize={10}>0</text>
							{ghostTs.map((ts, i) => (
								<text key={i} textAnchor="end" transform={`translate(${gx(i).toFixed(1)},${iH2 + 8}) rotate(-45)`} fill="var(--color-foreground-sec)" fontSize={10}>
									{fmtTs(ts, groupBy, hours)}
								</text>
							))}
						</g>
					</svg>
				)}
				<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-foreground-sec)", fontSize: 12, pointerEvents: "none" }}>
					No data
				</div>
			</div>
		);
	}
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
		<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", touchAction: "none" }}>
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
						{/* Peak reference lines — rendered behind everything, full-width faint gray */}
						<g clipPath={`url(#${uid}clip)`} opacity={1}>
							{visEntries.map(([n, v]) => {
								const maxVal = Math.max(...v);
								if (maxVal <= 0) return null;
								const lastNonZeroVal = v[([...v.keys()].reverse().find(i => v[i] > 0) ?? -1)] ?? 0;
								const peakY = yS(maxVal);
								const lastY = yS(lastNonZeroVal);
								// Skip if peak is the same as current value (already shown) or off-chart
								if (Math.abs(peakY - lastY) < 10) return null;
								if (peakY < 0 || peakY > iH) return null;
								return (
									<line key={`pk-${n}`} x1={0} y1={peakY} x2={iW} y2={peakY}
										stroke="var(--color-foreground-sec)" strokeWidth={1}
										strokeDasharray="2,6" opacity={0.22} />
								);
							})}
						</g>
						<g clipPath={`url(#${uid}clip)`}>
							{visEntries.map(([n, v]) => {
								const c = colors.get(n) ?? "#888";
								const pts: [number, number][] = v.map((val, i) => [xS(i), yS(val)]);
								const linePath = catmullRomPath(pts, iH, tension);
								if (!linePath || pts.length < 2) return null;
								const fillPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${iH.toFixed(1)} L ${pts[0][0].toFixed(1)} ${iH.toFixed(1)} Z`;
								return (
									<g key={n}>
										<path d={fillPath} fill={`url(#${uid}g${n.replace(/\W/g, '_')})`} />
										<path d={linePath} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
									</g>
								);
							})}
							{/* Current-value horizontal lines + last-point dots */}
							{visEntries.map(([n, v]) => {
								const lastIdx = [...v.keys()].reverse().find(i => v[i] > 0);
								if (lastIdx === undefined) return null;
								const y = yS(v[lastIdx]);
								const c = colors.get(n) ?? "#888";
								const lx = Math.min(xS(lastIdx), iW);
								return (
									<g key={`cvl-${n}`}>
										<line x1={0} y1={y} x2={lx} y2={y} stroke={c} strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
										{lx >= 0 && lx <= iW && (
											<circle cx={lx} cy={y} r={3} fill={c} stroke="var(--color-primary)" strokeWidth={1.5} />
										)}
									</g>
								);
							})}
							{hoverIdx !== null && !dragging && visEntries.map(([n, v]) => (
								<circle key={`d${n}`} cx={xS(hoverIdx)} cy={yS(v[hoverIdx] ?? 0)} r={4} fill={colors.get(n) ?? "#888"} stroke="var(--color-primary)" strokeWidth={2} />
							))}
						</g>
						{/* Peak badges in left margin */}
						{visEntries.map(([n, v]) => {
							const maxVal = Math.max(...v);
							if (maxVal <= 0) return null;
							const lastNonZeroVal = v[([...v.keys()].reverse().find(i => v[i] > 0) ?? -1)] ?? 0;
							const peakY = yS(maxVal);
							const lastY = yS(lastNonZeroVal);
							if (Math.abs(peakY - lastY) < 10) return null;
							if (peakY < -8 || peakY > iH + 8) return null;
							const label = fmtMetricTick(maxVal, metric);
							const bh = 13, bw = LM.left - 4;
							const gc = "var(--color-foreground-sec)";
							return (
								<g key={`pkb-${n}`}>
									<rect x={-LM.left + 2} y={peakY - bh / 2} width={bw} height={bh} rx={3}
										fill={gc} fillOpacity={0.08} stroke={gc} strokeOpacity={0.2} strokeWidth={0.75} />
									<text x={-5} y={peakY} textAnchor="end" dominantBaseline="middle"
										fill={gc} fontSize={9} fontWeight={500} opacity={0.5}>{label}</text>
								</g>
							);
						})}
						{/* Current-value badges in left margin */}
						{visEntries.map(([n, v]) => {
							const lastIdx = [...v.keys()].reverse().find(i => v[i] > 0);
							if (lastIdx === undefined) return null;
							const val = v[lastIdx];
							const y = yS(val);
							if (y < -8 || y > iH + 8) return null;
							const c = colors.get(n) ?? "#888";
							const label = fmtMetricTick(val, metric);
							const bh = 14, bw = LM.left - 4;
							return (
								<g key={`cvb-${n}`}>
									<rect x={-LM.left + 2} y={y - bh / 2} width={bw} height={bh} rx={3} fill={c} fillOpacity={0.15} stroke={c} strokeOpacity={0.4} strokeWidth={0.75} />
									<text x={-5} y={y} textAnchor="end" dominantBaseline="middle" fill={c} fontSize={9} fontWeight={700}>{label}</text>
								</g>
							);
						})}
						{hoverPos && !dragging && (
							<>
								<line x1={hoverPos.x} x2={hoverPos.x} y1={0} y2={iH} stroke="var(--color-foreground-sec)" strokeWidth={1} strokeDasharray="4,2" opacity={0.5} />
								<line x1={0} x2={iW} y1={hoverPos.y} y2={hoverPos.y} stroke="var(--color-foreground-sec)" strokeWidth={1} strokeDasharray="4,2" opacity={0.5} />
							</>
						)}
						<rect x={0} y={0} width={iW} height={iH} fill="transparent"
							onMouseDown={onMD} onMouseMove={onMM} onMouseLeave={onML}
							onDoubleClick={() => setZoom({ sx: 1, px: 0, sy: 1 })}
							onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />
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
				}));
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
	const noData = visDev.length === 0;
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
				<>
				{groups.length === 0 && (
					<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-foreground-sec)", fontSize: 12, pointerEvents: "none", zIndex: 1 }}>
						No data
					</div>
				)}
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
				</>
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

	const { w, h } = size;
	const iW = Math.max(0, w - CM.left - CM.right);
	const iH = Math.max(0, h - CM.top - CM.bottom);

	if (buckets.length === 0) {
		const nowMs = Date.now();
		const startMs = nowMs - hours * 3_600_000;
		const entryMs = (() => { const e = CANDLE_INTERVALS.find(c => c.id === candleInterval); return e && e.ms > 0 ? e.ms : getAutoCandleMs(hours); })();
		const N = 7;
		const ghostLabels = Array.from({ length: N }, (_, i) =>
			fmtCandleLabel(startMs + (i / (N - 1)) * hours * 3_600_000, entryMs, hours)
		);
		const gx = (i: number) => CM.left + (i / (N - 1)) * iW;
		return (
			<div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", userSelect: "none" }}>
				{w > 0 && h > 0 && (
					<svg width={w} height={h} style={{ display: "block" }}>
						<line x1={CM.left} y1={CM.top + iH} x2={CM.left + iW} y2={CM.top + iH} stroke="var(--color-secondary)" strokeWidth={1} />
						{ghostLabels.map((label, i) => (
							<text key={i} x={gx(i).toFixed(1)} y={CM.top + iH + 16} textAnchor="middle" fill="var(--color-foreground-sec)" fontSize={10}>{label}</text>
						))}
					</svg>
				)}
				<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-foreground-sec)", fontSize: 12, pointerEvents: "none" }}>
					No data
				</div>
			</div>
		);
	}

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

// ── Date range picker ─────────────────────────────────────────────────────────

function toLocalDateTimeInput(isoOrLocal: string): string {
	if (!isoOrLocal) return "";
	const d = new Date(isoOrLocal);
	if (isNaN(d.getTime())) return isoOrLocal;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateRange(start: string, end: string): string {
	const fmt = (s: string) => {
		const d = new Date(s);
		if (isNaN(d.getTime())) return s;
		return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
			" " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	};
	return `${fmt(start)} – ${fmt(end)}`;
}

function DateRangePickerPortal({
	anchorRef, start, end, onApply, onClose, mouseX, mouseY, isMobile,
}: {
	anchorRef: React.RefObject<HTMLButtonElement | null>;
	start: string; end: string;
	onApply: (start: string, end: string) => void;
	onClose: () => void;
	mouseX: number; mouseY: number;
	isMobile: boolean;
}) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ top: mouseY + 8, left: mouseX });
	const [localStart, setLocalStart] = useState(toLocalDateTimeInput(start));
	const [localEnd, setLocalEnd] = useState(toLocalDateTimeInput(end));

	useEffect(() => {
		if (!menuRef.current) return;
		const r = menuRef.current.getBoundingClientRect();
		const pad = 8;
		let { left, top } = pos;
		if (r.right  > window.innerWidth  - pad) left = window.innerWidth  - r.width  - pad;
		if (r.left   < pad)                       left = pad;
		if (r.bottom > window.innerHeight - pad)  top  = window.innerHeight - r.height - pad;
		if (left !== pos.left || top !== pos.top)  setPos({ top, left });
	}, [pos]);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node) &&
				!anchorRef.current?.contains(e.target as Node)) onClose();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [onClose]);

	const valid = localStart && localEnd && localStart < localEnd;

	const inputStyle: React.CSSProperties = {
		padding: isMobile ? "12px 14px" : "7px 9px", borderRadius: 8,
		fontSize: isMobile ? 16 : 12, width: "100%",
		background: "color-mix(in srgb, var(--color-secondary) 55%, transparent)",
		border: "1px solid var(--color-secondary)",
		color: "var(--color-foreground)",
		outline: "none", colorScheme: "dark",
	};

	return createPortal(
		<div
			ref={menuRef}
			style={{
				position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
				background: "var(--color-primary)",
				border: "1px solid color-mix(in srgb, var(--color-secondary) 100%, transparent)",
				borderRadius: 14, padding: isMobile ? "18px 20px 20px" : "14px 16px 16px",
				boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
				minWidth: isMobile ? 340 : 290,
			}}
		>
			<p style={{ fontSize: isMobile ? 15 : 13, fontWeight: 700, color: "var(--color-foreground)", margin: isMobile ? "0 0 16px" : "0 0 12px" }}>
				Custom Range
			</p>
			<div style={{ display: "flex", gap: isMobile ? 14 : 10, marginBottom: isMobile ? 18 : 14 }}>
				<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: isMobile ? 7 : 5 }}>
					<span style={{ fontSize: isMobile ? 13 : 11, fontWeight: 600, color: "var(--color-foreground-sec)" }}>Start</span>
					<input type="datetime-local" value={localStart} onChange={e => setLocalStart(e.target.value)} style={inputStyle} />
				</div>
				<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: isMobile ? 7 : 5 }}>
					<span style={{ fontSize: isMobile ? 13 : 11, fontWeight: 600, color: "var(--color-foreground-sec)" }}>End</span>
					<input type="datetime-local" value={localEnd} onChange={e => setLocalEnd(e.target.value)} style={inputStyle} />
				</div>
			</div>
			<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
				<button onClick={onClose} style={{
					padding: isMobile ? "11px 20px" : "6px 14px", borderRadius: 8,
					fontSize: isMobile ? 15 : 12, fontWeight: 500, cursor: "pointer",
					border: "1px solid var(--color-secondary)",
					background: "transparent", color: "var(--color-foreground-sec)",
				}}>Cancel</button>
				<button
					disabled={!valid}
					onClick={() => valid && onApply(new Date(localStart).toISOString(), new Date(localEnd).toISOString())}
					style={{
						padding: isMobile ? "11px 20px" : "6px 14px", borderRadius: 8,
						fontSize: isMobile ? 15 : 12, fontWeight: 600, cursor: valid ? "pointer" : "default",
						border: "none", background: "var(--color-blue)", color: "var(--color-primary)",
						opacity: valid ? 1 : 0.4, transition: "opacity 100ms",
					}}
				>Apply</button>
			</div>
		</div>,
		document.body,
	);
}

// ── AnalyticsPanel ────────────────────────────────────────────────────────────

export default function AnalyticsPanel({ mode = "past", readOnly = false, defaultHours = 24 }: { mode?: "past" | "live"; readOnly?: boolean; defaultHours?: number }) {
	const [rangeCount, setRangeCount] = useState(() => initRangeFromHours(defaultHours).count);
	const [rangeUnit, setRangeUnit] = useState<RangeUnit>(() => initRangeFromHours(defaultHours).unit);
	const [loading, setLoading] = useState(true);
	const hasLoadedOnce = useRef(false);
	const [readings, setReadings] = useState<HistoryEntry[]>([]);
	const [visible, setVisible] = useState<Set<string>>(new Set());
	const [metric, setMetric] = useState<Metric>("watts");
	const [groupBy, setGroupBy] = useState<GroupBy>("auto");
	const [candleInterval, setCandleInterval] = useState<CandleInterval>("auto");
	const [barXAxis, setBarXAxis] = useState<BarXAxis>("custom");
	const [barXAxisCustomN, setBarXAxisCustomN] = useState(5);
	const [barXAxisCustomUnit, setBarXAxisCustomUnit] = useState<BarXAxisUnit>("minute");
	const [barXAxisAuto, setBarXAxisAuto] = useState(true);
	const [barDeviceAxis, setBarDeviceAxis] = useState(true);
	const [lineCustomN, setLineCustomN] = useState(15);
	const [lineCustomUnit, setLineCustomUnit] = useState<GroupByUnit>("minute");
	const [localChartType, setLocalChartType] = useState<ChartType>("line");
	const [panelOpen, setPanelOpen] = useState(false);
	const [panelWidth, setPanelWidth] = useState(280);
	const [panelTab, setPanelTab] = useState<PanelTab>("time");
	const [isMobile, setIsMobile] = useState(false);
	const [liveIntervalSec, setLiveIntervalSec] = useState(0);
	const [liveAvgBucket, setLiveAvgBucket] = useState(1);
	const [rangeMode, setRangeMode] = useState<"hours" | "custom">("hours");
	const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 24 * 3600 * 1000).toISOString());
	const [customEnd, setCustomEnd] = useState(() => new Date().toISOString());
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [datePickerPos, setDatePickerPos] = useState({ x: 0, y: 0 });
	const datePickerAnchorRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < 640);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		if (mode === "live") {
			setRangeMode("hours");
			setReadings([]);
		}
	}, [mode]);

	const hours = Math.max(1, rangeCount * RANGE_UNIT_HOURS[rangeUnit]);
	const effectiveHours = rangeMode === "custom"
		? Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 3_600_000))
		: hours;

	const effectiveBarXAxis: BarXAxis = barDeviceAxis ? "device" : "custom";
	const autoBarInterval = getAutoBarInterval(effectiveHours);
	const effectiveBarN    = barXAxisAuto ? autoBarInterval.n    : barXAxisCustomN;
	const effectiveBarUnit = barXAxisAuto ? autoBarInterval.unit : barXAxisCustomUnit;
	const barXMinHours = localChartType === "bar" ? getBarXMinHours(effectiveBarXAxis, effectiveBarUnit) : 1;

	// Panel resize
	const isDraggingPanel = useRef(false);
	const dragStartX = useRef(0);
	const dragStartW = useRef(0);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!isDraggingPanel.current) return;
			const delta = dragStartX.current - e.clientX;
			setPanelWidth(Math.min(560, Math.max(260, dragStartW.current + delta)));
		};
		const onUp = () => { isDraggingPanel.current = false; };
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
	}, []);

	// Auto-bump time range when X axis changes to require more data
	useEffect(() => {
		if (localChartType !== "bar") return;
		const min = getBarXMinHours(effectiveBarXAxis, barXAxisCustomUnit);
		const currentH = rangeCount * RANGE_UNIT_HOURS[rangeUnit];
		if (currentH < min) {
			const { count, unit } = initRangeFromHours(min);
			setRangeCount(count); setRangeUnit(unit);
		}
	}, [effectiveBarXAxis, barXAxisCustomUnit, localChartType]);

	const fetchHistory = useCallback(async (silent = false) => {
		const showOverlay = !silent && !hasLoadedOnce.current;
		if (showOverlay) setLoading(true);
		try {
			if (mode === "live") {
				// Poll current device state; each call creates one new data point
				const res = await fetch("/api/power");
				if (!res.ok) return;
				const data = await res.json();
				const entry: HistoryEntry = {
					ts: data.timestamp ?? new Date().toISOString(),
					devices: (data.devices ?? []).map((d: { name: string; current_power_w: number; on: boolean; today_energy_wh?: number; month_energy_wh?: number }) => ({
						name: d.name,
						watts: d.current_power_w,
						on: d.on,
						today_wh: d.today_energy_wh ?? 0,
						month_wh: d.month_energy_wh ?? 0,
					})),
				};
				if (entry.devices.length > 0) {
					setReadings(prev => [...prev, entry]);
				}
				return;
			}
			const url = rangeMode === "custom"
				? `/api/power/history?start=${encodeURIComponent(customStart)}&end=${encodeURIComponent(customEnd)}`
				: `/api/power/history?hours=${hours}`;
			const res = await fetch(url);
			if (!res.ok) return;
			setReadings((await res.json()).readings ?? []);
		} finally { hasLoadedOnce.current = true; if (showOverlay) setLoading(false); }
	}, [hours, rangeMode, customStart, customEnd, mode]);

	useEffect(() => { fetchHistory(); }, [fetchHistory]);

	useEffect(() => {
		if (mode !== "live") return;
		if (liveIntervalSec === 0) {
			// Continuous: fire next fetch immediately after previous completes
			let active = true;
			const loop = () => { if (active) fetchHistory(true).finally(() => { if (active) setTimeout(loop, 0); }); };
			loop();
			return () => { active = false; };
		}
		const ms = Math.max(1000, liveIntervalSec * 1000);
		const id = setInterval(() => fetchHistory(true), ms);
		return () => clearInterval(id);
	}, [mode, liveIntervalSec, fetchHistory]);

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

	const lineCustomMs = lineCustomN * GROUP_BY_UNIT_MS[lineCustomUnit];
	const effectiveGroupBy: GroupBy = mode === "live" ? "auto" : groupBy;
	const effectiveLineCustomMs: number = lineCustomMs;
	const displayReadings = useMemo(
		() => aggregateReadings(readings, effectiveGroupBy, effectiveGroupBy === "custom" ? effectiveLineCustomMs : undefined),
		[readings, effectiveGroupBy, effectiveLineCustomMs],
	);

	// Clear live data when the polling interval changes (x-axis resolution changed)
	useEffect(() => {
		if (mode !== "live") return;
		setReadings([]);
	}, [liveIntervalSec]);

	const paddedDisplayReadings = useMemo(() => {
		// In live mode: show raw collected points only, no zero-padding
		if (mode === "live") return displayReadings;
		const endMs = rangeMode === "custom" ? new Date(customEnd).getTime() : Date.now();
		const startMs = rangeMode === "custom" ? new Date(customStart).getTime() : endMs - hours * 3_600_000;
		return padLineToRange(displayReadings, startMs, endMs, effectiveGroupBy, effectiveLineCustomMs, deviceNames);
	}, [mode, displayReadings, hours, rangeMode, customStart, customEnd, effectiveGroupBy, effectiveLineCustomMs, deviceNames]);

	const smoothedReadings = useMemo(
		() => mode === "live" ? bucketByCount(paddedDisplayReadings, liveAvgBucket) : paddedDisplayReadings,
		[mode, paddedDisplayReadings, liveAvgBucket],
	);

	const iconBtn = (active = false): React.CSSProperties => ({
		display: "flex", alignItems: "center", justifyContent: "center",
		width: isMobile ? 44 : 28, height: isMobile ? 44 : 28, borderRadius: isMobile ? 10 : 7, border: "none",
		background: active ? "color-mix(in srgb, var(--color-blue) 18%, transparent)" : "transparent",
		color: active ? "var(--color-blue)" : "var(--color-foreground-sec)",
		cursor: "pointer", transition: "background 100ms, color 100ms", flexShrink: 0,
	});

	const sectionTitle = (text: string) => (
		<p style={{
			fontSize: isMobile ? 13 : 12, fontWeight: 600,
			color: "var(--color-foreground)",
			margin: isMobile ? "18px 12px 6px" : "14px 12px 5px",
		}}>{text}</p>
	);


	const timeTab = (
		<div>
			{mode === "past" && sectionTitle("Range")}
			{mode === "past" && (
				<div style={{ marginBottom: isMobile ? 12 : 8 }}>
					<RangePicker
						count={rangeCount} unit={rangeUnit}
						onCountChange={v => { setRangeCount(v); setRangeMode("hours"); }}
						onUnitChange={u => { setRangeUnit(u); setRangeMode("hours"); }}
						mobile={isMobile}
					/>
				</div>
			)}
			{mode === "past" && (<>
				<button
					ref={datePickerAnchorRef}
					onClick={(e) => { setDatePickerPos({ x: e.clientX, y: e.clientY }); setDatePickerOpen(o => !o); }}
					style={{
						width: "100%", display: "flex", alignItems: "center", gap: 7,
						padding: isMobile ? "10px 10px" : "5px 8px", marginBottom: 10,
						borderRadius: 8, cursor: "pointer",
						border: `1px solid ${rangeMode === "custom" ? "var(--color-blue)" : "var(--color-secondary)"}`,
						background: rangeMode === "custom" ? "color-mix(in srgb, var(--color-blue) 12%, transparent)" : "color-mix(in srgb, var(--color-secondary) 50%, transparent)",
						color: rangeMode === "custom" ? "var(--color-blue)" : "var(--color-foreground-sec)",
						fontSize: isMobile ? 14 : 13, fontWeight: rangeMode === "custom" ? 600 : 400,
						transition: "all 100ms",
					}}
				>
					<IconCalendar size={isMobile ? 16 : 12} style={{ flexShrink: 0 }} />
					<span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{rangeMode === "custom" ? formatDateRange(customStart, customEnd) : "Custom range…"}
					</span>
				</button>
				{datePickerOpen && (
					<DateRangePickerPortal
						anchorRef={datePickerAnchorRef}
						mouseX={datePickerPos.x}
						mouseY={datePickerPos.y}
						isMobile={isMobile}
						start={customStart}
						end={customEnd}
						onApply={(s, e) => {
							setCustomStart(s);
							setCustomEnd(e);
							setRangeMode("custom");
							setDatePickerOpen(false);
						}}
						onClose={() => setDatePickerOpen(false)}
					/>
				)}
			</>)}

			{mode === "live" && (<>
				{sectionTitle("Polling Interval")}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: isMobile ? 6 : 4, marginBottom: isMobile ? 8 : 6 }}>
					{[
						{ label: null, sec: 0 }, { label: "1s", sec: 1 }, { label: "3s", sec: 3 }, { label: "5s", sec: 5 },
						{ label: "10s", sec: 10 }, { label: "30s", sec: 30 }, { label: "1m", sec: 60 }, { label: "5m", sec: 300 },
					].map(({ label, sec }) => (
						<button key={sec} onClick={() => setLiveIntervalSec(sec)} style={{
							padding: isMobile ? "11px 4px" : "5px 4px", borderRadius: 6,
							fontSize: isMobile ? 14 : 11, fontWeight: liveIntervalSec === sec ? 600 : 400,
							cursor: "pointer", border: "none", display: "flex", alignItems: "center", justifyContent: "center",
							background: liveIntervalSec === sec ? "var(--color-blue)" : "color-mix(in srgb, var(--color-secondary) 60%, transparent)",
							color: liveIntervalSec === sec ? "var(--color-primary)" : "var(--color-foreground-sec)",
							transition: "all 120ms",
						}}>{label === null ? "min." : label}</button>
					))}
				</div>
				{liveIntervalSec !== 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 8 }}>
					<span style={{ fontSize: isMobile ? 13 : 11, color: "var(--color-foreground-sec)", fontWeight: 500 }}>Custom</span>
					<input
						type="text" inputMode="numeric" pattern="[0-9]*"
						value={liveIntervalSec === 0 ? "" : liveIntervalSec}
						placeholder=""
						onChange={e => {
							const v = parseInt(e.target.value.replace(/\D/g, ""));
							setLiveIntervalSec(isNaN(v) ? 0 : Math.max(1, v));
						}}
						style={{
							flex: 1, padding: isMobile ? "10px 12px" : "5px 8px", borderRadius: 7,
							fontSize: isMobile ? 14 : 11,
							background: "color-mix(in srgb, var(--color-secondary) 50%, transparent)",
							border: `1px solid ${![0,1,3,5,10,30,60,300].includes(liveIntervalSec) ? "var(--color-blue)" : "var(--color-secondary)"}`,
							color: "var(--color-foreground)", outline: "none",
						}}
					/>
					<span style={{ fontSize: isMobile ? 13 : 11, color: "var(--color-foreground-sec)" }}>s</span>
				</div>}
				{localChartType === "line" && (<>
					<div style={{ height: 1, background: "var(--color-secondary)", margin: "4px 0 8px" }} />
					{sectionTitle("Smoothing")}
					<div style={{ padding: isMobile ? "0 10px 10px" : "0 8px 8px" }}>
						<div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 6 }}>
							<button
								onClick={() => setLiveAvgBucket(v => Math.max(1, v - 1))}
								style={{
									width: isMobile ? 32 : 22, height: isMobile ? 32 : 22, flexShrink: 0,
									borderRadius: 6, border: "1px solid var(--color-secondary)",
									background: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
									color: "var(--color-foreground-sec)", cursor: "pointer",
									fontSize: isMobile ? 16 : 13, lineHeight: 1,
									display: "flex", alignItems: "center", justifyContent: "center",
								}}
							>−</button>
							<input
								type="range" min={1} max={30} step={1}
								value={liveAvgBucket}
								onChange={e => setLiveAvgBucket(parseInt(e.target.value))}
								style={{ flex: 1, accentColor: "var(--color-blue)", cursor: "pointer" }}
							/>
							<button
								onClick={() => setLiveAvgBucket(v => Math.min(30, v + 1))}
								style={{
									width: isMobile ? 32 : 22, height: isMobile ? 32 : 22, flexShrink: 0,
									borderRadius: 6, border: "1px solid var(--color-secondary)",
									background: "color-mix(in srgb, var(--color-secondary) 35%, transparent)",
									color: "var(--color-foreground-sec)", cursor: "pointer",
									fontSize: isMobile ? 16 : 13, lineHeight: 1,
									display: "flex", alignItems: "center", justifyContent: "center",
								}}
							>+</button>
						</div>
						<div style={{ textAlign: "center", fontSize: isMobile ? 12 : 10, color: "var(--color-foreground-sec)", marginTop: isMobile ? 4 : 3 }}>
							{liveAvgBucket === 1 ? "Off" : `${liveAvgBucket}×`}
						</div>
					</div>
				</>)}
			</>)}
		</div>
	);

	const chartTab = (
		<div>
			{localChartType !== "candle" && (<>
				{sectionTitle("Metric")}
				{METRICS.map(m => (
					<PanelOpt key={m.id} label={m.label} selected={metric === m.id} onClick={() => setMetric(m.id)} mobile={isMobile} />
				))}
			</>)}

			{localChartType === "line" && mode === "past" && (<>
				<div style={{ height: 1, background: "var(--color-secondary)", margin: "10px 2px 0" }} />
				{sectionTitle("Grouping")}
				<PanelOpt label="Auto" selected={groupBy === "auto"} onClick={() => setGroupBy("auto")} mobile={isMobile} />
				<div style={{ padding: isMobile ? "4px 10px 6px" : "3px 8px 4px" }}>
					<IntervalPicker
						n={lineCustomN} unit={lineCustomUnit}
						onNChange={v => { setLineCustomN(v); setGroupBy("custom"); }}
						onUnitChange={u => { setLineCustomUnit(u as GroupByUnit); setGroupBy("custom"); }}
						units={INTERVAL_UNITS}
						mobile={isMobile}
					/>
				</div>
			</>)}

			{localChartType === "candle" && (<>
				{sectionTitle("Candle Period")}
				{CANDLE_INTERVALS.map(c => (
					<PanelOpt key={c.id}
						label={c.id === "auto" ? `Auto (${CANDLE_INTERVALS.find(x => x.ms === getAutoCandleMs(effectiveHours))?.label ?? "auto"})` : c.label}
						selected={candleInterval === c.id}
						onClick={() => setCandleInterval(c.id)} mobile={isMobile} />
				))}
			</>)}

			{localChartType === "bar" && (<>
				<div style={{ height: 1, background: "var(--color-secondary)", margin: "10px 2px 0" }} />
				{sectionTitle("X Axis")}
				{/* Devices toggle */}
				<button
					onClick={() => setBarDeviceAxis(v => !v)}
					style={{
						width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
						padding: isMobile ? "8px 12px" : "5px 10px", borderRadius: 8, border: "none",
						background: "transparent", cursor: "pointer", marginBottom: 4,
					}}
				>
					<span style={{ fontSize: isMobile ? 13 : 11, color: "var(--color-foreground)", fontWeight: 500 }}>Devices</span>
					<span style={{
						width: isMobile ? 36 : 28, height: isMobile ? 20 : 16, borderRadius: 999, flexShrink: 0,
						background: barDeviceAxis ? "var(--color-blue)" : "color-mix(in srgb, var(--color-foreground-sec) 55%, transparent)",
						display: "flex", alignItems: "center", padding: "0 2px", transition: "background 150ms",
					}}>
						<span style={{
							width: isMobile ? 16 : 12, height: isMobile ? 16 : 12, borderRadius: "50%",
							background: "var(--color-primary)",
							transform: barDeviceAxis ? `translateX(${isMobile ? 16 : 12}px)` : "translateX(0)",
							transition: "transform 150ms", flexShrink: 0,
						}} />
					</span>
				</button>
				{/* Interval picker — only when not in device mode */}
				{!barDeviceAxis && (<>
					<p style={{ fontSize: isMobile ? 11 : 10, fontWeight: 600, color: "var(--color-foreground-sec)", margin: isMobile ? "10px 12px 6px" : "8px 12px 5px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Interval</p>
					{/* Auto toggle */}
					<button
						onClick={() => setBarXAxisAuto(v => !v)}
						style={{
							width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
							padding: isMobile ? "7px 12px" : "4px 10px", borderRadius: 8, border: "none",
							background: "transparent", cursor: "pointer", marginBottom: 4,
						}}
					>
						<span style={{ fontSize: isMobile ? 13 : 11, color: "var(--color-foreground)", fontWeight: 500 }}>Auto</span>
						<span style={{
							width: isMobile ? 36 : 28, height: isMobile ? 20 : 16, borderRadius: 999, flexShrink: 0,
							background: barXAxisAuto ? "var(--color-blue)" : "color-mix(in srgb, var(--color-foreground-sec) 55%, transparent)",
							display: "flex", alignItems: "center", padding: "0 2px", transition: "background 150ms",
						}}>
							<span style={{
								width: isMobile ? 16 : 12, height: isMobile ? 16 : 12, borderRadius: "50%",
								background: "var(--color-primary)",
								transform: barXAxisAuto ? `translateX(${isMobile ? 16 : 12}px)` : "translateX(0)",
								transition: "transform 150ms", flexShrink: 0,
							}} />
						</span>
					</button>
					{!barXAxisAuto && (
						<div style={{ padding: isMobile ? "0 12px 10px" : "0 8px 8px" }}>
							<IntervalPicker
								n={barXAxisCustomN} unit={barXAxisCustomUnit}
								onNChange={setBarXAxisCustomN}
								onUnitChange={u => setBarXAxisCustomUnit(u as BarXAxisUnit)}
								units={INTERVAL_UNITS}
								mobile={isMobile}
							/>
						</div>
					)}
				</>)}
			</>)}

			<div style={{ height: 1, background: "var(--color-secondary)", margin: "10px 2px 0" }} />
			{sectionTitle("Devices")}
			{deviceNames.length === 0
				? <p style={{ fontSize: isMobile ? 13 : 11, color: "var(--color-foreground-sec)", margin: "6px 8px", opacity: 0.6, fontStyle: "italic" }}>No devices</p>
				: deviceNames.map(name => (
					<PanelOpt key={name} label={name} selected={visible.has(name)} color={colors.get(name)} onClick={() => toggleDevice(name)} mobile={isMobile} />
				))
			}
		</div>
	);

	return (
		<div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

			{/* ── Top bar ── */}
			{!readOnly && (
				<div style={{
					flexShrink: 0, display: "flex", alignItems: "center", gap: 2,
					padding: isMobile ? "8px 12px" : "4px 8px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)",
				}}>
					<button style={iconBtn(localChartType === "line")} onClick={() => setLocalChartType("line")} title="Line chart">
						<IconChartLine size={15} />
					</button>
					<button style={iconBtn(localChartType === "bar")} onClick={() => setLocalChartType("bar")} title="Bar chart">
						<IconChartBar size={15} />
					</button>
					<button style={iconBtn(localChartType === "candle")} onClick={() => setLocalChartType("candle")} title="Candlestick chart">
						<IconChartCandle size={15} />
					</button>
					{mode === "live" && (
						<span style={{
							width: 6, height: 6, borderRadius: "50%",
							background: loading ? "var(--color-foreground-sec)" : "var(--color-green)",
							boxShadow: loading ? "none" : "0 0 0 2px color-mix(in srgb, var(--color-green) 25%, transparent)",
							animation: loading ? "none" : "pulse-dot 1.5s ease-in-out infinite",
							flexShrink: 0,
						}} />
					)}
					<div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
						<button style={iconBtn()} onClick={() => fetchHistory()} disabled={loading} title="Refresh">
							<IconRefresh size={15} className={loading ? "animate-spin" : ""} />
						</button>
						<button style={iconBtn(panelOpen)} onClick={() => setPanelOpen(o => !o)} title="Options panel">
							<IconLayoutSidebarRight size={15} />
						</button>
					</div>
				</div>
			)}

			{/* ── Body ── */}
			<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
				{/* Chart area */}
				<div style={{ flex: 1, minWidth: 0, padding: "0 8px 12px" }}>
					{loading ? (
						<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-foreground-sec)", gap: 8 }}>
							<IconRefresh size={16} className="animate-spin" /> Loading…
						</div>
					) : localChartType === "line" ? (
						<LineChart readings={smoothedReadings} deviceNames={deviceNames} colors={colors} visible={visible} hours={effectiveHours} metric={metric} groupBy={effectiveGroupBy} liveMode={mode === "live"} tension={mode === "live" && liveAvgBucket === 1 ? 0 : 1 / 6} />
					) : localChartType === "bar" ? (
						<BarChart readings={readings} deviceNames={deviceNames} colors={colors} visible={visible} metric={metric} xAxis={effectiveBarXAxis} xAxisCustomN={effectiveBarN} xAxisCustomUnit={effectiveBarUnit} />
					) : (
						<CandleChart readings={readings} deviceNames={deviceNames} colors={colors} visible={visible} hours={effectiveHours} candleInterval={candleInterval} />
					)}
				</div>

				{/* Side panel */}
				{!readOnly && panelOpen && (
					<div style={{
						width: isMobile ? 300 : panelWidth, flexShrink: 0,
						borderLeft: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)",
						display: "flex", flexDirection: "row",
					}}>
						{/* Resize handle — desktop only */}
						{!isMobile && (
							<div
								onMouseDown={e => {
									e.preventDefault();
									isDraggingPanel.current = true;
									dragStartX.current = e.clientX;
									dragStartW.current = panelWidth;
								}}
								style={{ width: 5, flexShrink: 0, cursor: "col-resize" }}
								onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "color-mix(in srgb, var(--color-blue) 30%, transparent)"; }}
								onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
							/>
						)}
						{/* Panel body */}
						<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
							{/* Tab bar */}
							<div style={{
								display: "flex", alignItems: "stretch", flexShrink: 0,
								borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 80%, transparent)",
							}}>
								{(["time", "chart"] as PanelTab[]).map(tab => (
									<button key={tab} onClick={() => setPanelTab(tab)} style={{
										flex: 1,
										padding: isMobile ? "13px 8px" : "9px 8px",
										border: "none",
										borderBottom: `2px solid ${panelTab === tab ? "var(--color-blue)" : "transparent"}`,
										marginBottom: -1,
										background: "transparent",
										fontSize: isMobile ? 13 : 11,
										fontWeight: panelTab === tab ? 600 : 400,
										color: panelTab === tab ? "var(--color-foreground)" : "var(--color-foreground-sec)",
										cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.01em",
										transition: "color 120ms, border-color 120ms",
									}}>{tab}</button>
								))}
								<button onClick={() => setPanelOpen(false)} style={{
									flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
									width: isMobile ? 44 : 34, border: "none",
									background: "transparent",
									color: "var(--color-foreground-sec)", cursor: "pointer", opacity: 0.6,
								}}>
									<IconX size={isMobile ? 15 : 12} />
								</button>
							</div>
							{/* Tab content */}
							<div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "6px 10px 20px" : "4px 8px 16px" }}>
								{panelTab === "time" ? timeTab : chartTab}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
