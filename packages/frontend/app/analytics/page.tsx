"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
	ResponsiveContainer, LineChart, Line, BarChart, Bar,
	XAxis, YAxis, Tooltip, CartesianGrid, Legend, Brush, ReferenceArea,
} from "recharts";
import { IconRefresh } from "@tabler/icons-react";
import SideNav from "../components/SideNav";
import HelpTooltip from "../components/HelpTooltip";

// ── Types ────────────────────────────────────────────────────────────────────

interface DeviceReading { name: string; watts: number; on: boolean; today_wh: number; month_wh: number; }
interface HistoryEntry { ts: string; devices: DeviceReading[]; }
interface Candle { open: number; close: number; high: number; low: number; }
interface CandleBucket { ts: number; label: string; [device: string]: Candle | number | string; }
type ChartType = "line" | "bar" | "candle";

const COST_PER_KWH = 0.24; // LADWP Northridge CA 2025
const DEVICE_COLORS: Record<string, string> = { server: "#428ce2", desktop: "#a78bfa" };
const CHART_MARGIN = { top: 4, right: 16, bottom: 4, left: 0 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(ts: string, spanH: number): string {
	const d = new Date(ts);
	if (spanH <= 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDt(iso: string) {
	// "2025-01-15T14:30" → "Jan 15, 2:30 PM"
	try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
	catch { return iso; }
}

function bucketCandles(readings: HistoryEntry[], spanH: number): CandleBucket[] {
	const bucketMs = (spanH <= 6 ? 30 : spanH <= 24 ? 60 : spanH <= 168 ? 360 : 1440) * 60_000;
	const map = new Map<number, Map<string, number[]>>();
	for (const r of readings) {
		const key = Math.floor(new Date(r.ts).getTime() / bucketMs) * bucketMs;
		if (!map.has(key)) map.set(key, new Map());
		for (const d of r.devices) {
			if (!map.get(key)!.has(d.name)) map.get(key)!.set(d.name, []);
			map.get(key)!.get(d.name)!.push(d.watts);
		}
	}
	return Array.from(map.entries()).sort(([a], [b]) => a - b).map(([ts, devices]) => {
		const label = fmtTs(new Date(ts).toISOString(), spanH);
		const pt: CandleBucket = { ts, label };
		for (const [name, watts] of devices) {
			const s = [...watts].sort((a, b) => a - b);
			pt[name] = { open: watts[0], close: watts[watts.length - 1], high: s[s.length - 1], low: s[0] };
		}
		return pt;
	});
}

function computeSummary(readings: HistoryEntry[], deviceName: string) {
	const pts = readings.map(r => {
		const d = r.devices.find(x => x.name === deviceName);
		return d ? { ts: new Date(r.ts).getTime(), watts: d.watts, on: d.on } : null;
	}).filter(Boolean).sort((a, b) => a!.ts - b!.ts) as { ts: number; watts: number; on: boolean }[];
	if (!pts.length) return null;
	const avgW = pts.reduce((s, p) => s + p.watts, 0) / pts.length;
	const peakW = Math.max(...pts.map(p => p.watts));
	const uptimePct = pts.filter(p => p.on).length / pts.length * 100;
	let kWh = pts.length >= 2
		? pts.slice(1).reduce((s, p, i) => s + (p.watts + pts[i].watts) / 2 * (p.ts - pts[i].ts) / 3_600_000_000, 0)
		: pts[0].watts / 1000 * (5 / 60);
	return { avgW, peakW, kWh, cost: kWh * COST_PER_KWH, uptimePct };
}

function autoYDomain(data: Record<string, number | string>[], names: string[]): [number, number] | null {
	const vals = data.flatMap(pt => names.map(n => pt[n]).filter(v => typeof v === "number")) as number[];
	if (!vals.length) return null;
	const mn = Math.min(...vals), mx = Math.max(...vals);
	const pad = Math.max((mx - mn) * 0.08, 5);
	return [Math.max(0, mn - pad), mx + pad];
}

// ── Candle chart ─────────────────────────────────────────────────────────────

function CandleChart({ data, activeDevices, yDomain, onYDomainChange, onBrush }: {
	data: CandleBucket[];
	activeDevices: string[];
	yDomain: [number, number] | null;
	onYDomainChange: (d: [number, number]) => void;
	onBrush: (start: number, end: number) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(600);
	const [tooltip, setTooltip] = useState<{ x: number; y: number; bucket: CandleBucket } | null>(null);
	const [selecting, setSelecting] = useState<{ startPx: number; endPx: number } | null>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(e => setWidth(e[0].contentRect.width));
		ro.observe(el);
		setWidth(el.getBoundingClientRect().width);
		return () => ro.disconnect();
	}, []);

	const H = 300, margin = { top: 10, right: 20, bottom: 28, left: 54 };
	const innerW = width - margin.left - margin.right;
	const innerH = H - margin.top - margin.bottom;

	// Y domain
	let yMin = Infinity, yMax = -Infinity;
	for (const pt of data) for (const n of activeDevices) {
		const c = pt[n] as Candle | undefined;
		if (c && typeof c === "object") { yMin = Math.min(yMin, c.low); yMax = Math.max(yMax, c.high); }
	}
	if (yMin === Infinity) { yMin = 0; yMax = 500; }
	const pad = Math.max((yMax - yMin) * 0.08, 5);
	const [effMin, effMax] = yDomain ?? [Math.max(0, yMin - pad), yMax + pad];
	const yScale = (v: number) => margin.top + innerH - ((v - effMin) / (effMax - effMin)) * innerH;
	const yFromPx = (py: number) => effMin + (1 - (py - margin.top) / innerH) * (effMax - effMin);

	const slotW = innerW / Math.max(data.length, 1);
	const candleW = Math.max(3, Math.min(18, slotW / activeDevices.length - 3));
	const xScale = (i: number) => margin.left + (i + 0.5) * slotW;
	const xToIdx = (px: number) => Math.max(0, Math.min(data.length - 1, Math.floor((px - margin.left) / slotW)));

	const yTicks = Array.from({ length: 5 }, (_, i) => effMin + (effMax - effMin) * i / 4);
	const xStep = Math.max(1, Math.floor(data.length / 6));

	// Scroll = Y zoom
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
			const py = e.clientY - el.getBoundingClientRect().top;
			const center = yFromPx(py);
			const half = (effMax - effMin) / 2 * factor;
			onYDomainChange([Math.max(0, center - half), center + half]);
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
	}, [effMin, effMax]);

	// Mouse drag = X brush selection
	const svgRef = useRef<SVGSVGElement>(null);

	const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
		const rect = svgRef.current!.getBoundingClientRect();
		setSelecting({ startPx: e.clientX - rect.left, endPx: e.clientX - rect.left });
	};
	const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
		if (!selecting) return;
		const rect = svgRef.current!.getBoundingClientRect();
		setSelecting(s => s ? { ...s, endPx: e.clientX - rect.left } : null);
		setTooltip(null);
	};
	const onMouseUp = () => {
		if (!selecting) return;
		const s = xToIdx(selecting.startPx), e = xToIdx(selecting.endPx);
		if (Math.abs(s - e) > 0) onBrush(Math.min(s, e), Math.max(s, e));
		setSelecting(null);
	};

	const selX1 = selecting ? Math.min(selecting.startPx, selecting.endPx) : 0;
	const selX2 = selecting ? Math.max(selecting.startPx, selecting.endPx) : 0;

	return (
		<div ref={containerRef} className="relative w-full select-none" style={{ height: H }}>
			<svg ref={svgRef} width={width} height={H}
				onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
				onDoubleClick={() => { onYDomainChange(null as any); onBrush(0, data.length - 1); }}
			>
				{/* Grid */}
				{yTicks.map((v, i) => (
					<g key={i}>
						<line x1={margin.left} y1={yScale(v)} x2={margin.left + innerW} y2={yScale(v)} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 3" />
						<text x={margin.left - 6} y={yScale(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor" fillOpacity={0.4}>{Math.round(v)}W</text>
					</g>
				))}
				{data.map((pt, i) => i % xStep !== 0 && i !== data.length - 1 ? null : (
					<text key={i} x={xScale(i)} y={margin.top + innerH + 18} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.4}>{pt.label}</text>
				))}

				{/* Candles */}
				{data.map((pt, i) => {
					const cx = xScale(i);
					return activeDevices.map((name, di) => {
						const c = pt[name] as Candle | undefined;
						if (!c || typeof c !== "object") return null;
						const off = activeDevices.length > 1 ? (di - (activeDevices.length - 1) / 2) * (candleW + 3) : 0;
						const x = cx + off;
						const isUp = c.close >= c.open;
						const color = isUp ? "#5dd776" : "#ef4444";
						const bodyTop = Math.min(yScale(c.open), yScale(c.close));
						const bodyH = Math.max(1, Math.abs(yScale(c.close) - yScale(c.open)));
						return (
							<g key={name}
								onMouseEnter={e => {
									const r = containerRef.current?.getBoundingClientRect();
									if (r) setTooltip({ x: e.clientX - r.left, y: e.clientY - r.top, bucket: pt });
								}}
								onMouseLeave={() => setTooltip(null)}
							>
								<line x1={x} y1={yScale(c.high)} x2={x} y2={yScale(c.low)} stroke={color} strokeWidth={1.5} />
								<rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} fillOpacity={0.85} />
								<rect x={cx - slotW / 2} y={margin.top} width={slotW} height={innerH} fill="transparent" />
							</g>
						);
					});
				})}

				{/* Drag selection overlay */}
				{selecting && selX2 - selX1 > 2 && (
					<rect x={selX1} y={margin.top} width={selX2 - selX1} height={innerH}
						fill="#428ce2" fillOpacity={0.15} stroke="#428ce2" strokeOpacity={0.5} strokeWidth={1} />
				)}
			</svg>

			{/* Hover tooltip */}
			{tooltip && !selecting && (
				<div className="pointer-events-none absolute z-10 bg-primary border border-secondary rounded-xl px-3 py-2 text-xs shadow-lg"
					style={{ left: Math.min(tooltip.x + 12, width - 160), top: Math.max(0, tooltip.y - 10) }}>
					<p className="text-foreground-sec mb-1.5">{tooltip.bucket.label}</p>
					{activeDevices.map(name => {
						const c = tooltip.bucket[name] as Candle | undefined;
						if (!c || typeof c !== "object") return null;
						return (
							<div key={name} className="flex flex-col gap-0.5 mb-1" style={{ color: DEVICE_COLORS[name] }}>
								<span className="font-medium capitalize">{name}</span>
								<span className="text-foreground-sec font-mono text-[10px]">
									O {c.open.toFixed(1)}  H {c.high.toFixed(1)}<br />
									L {c.low.toFixed(1)}  C {c.close.toFixed(1)} W
								</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ── Shared tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
	if (!active || !payload?.length) return null;
	return (
		<div className="bg-primary border border-secondary rounded-xl px-3 py-2 text-xs shadow-lg">
			<p className="text-foreground-sec mb-1">{label}</p>
			{payload.map((p: any) => (
				<p key={p.name} style={{ color: p.color }} className="font-medium">
					{String(p.name).charAt(0).toUpperCase() + String(p.name).slice(1)}: {Number(p.value).toFixed(1)} W
				</p>
			))}
		</div>
	);
};

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
	return (
		<div className="bg-primary border border-secondary rounded-2xl p-5 flex flex-col gap-1">
			<span className="text-xs font-medium text-foreground-sec">{label}</span>
			<span className="text-2xl font-medium tracking-tight text-foreground leading-none mt-1" style={color ? { color } : undefined}>{value}</span>
			{sub && <span className="text-[0.7rem] text-foreground-sec mt-0.5">{sub}</span>}
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PRESETS = [{ label: "6h", h: 6 }, { label: "24h", h: 24 }, { label: "7d", h: 168 }, { label: "30d", h: 720 }];

export default function AnalyticsPage() {
	// Time range
	const [presetH, setPresetH] = useState(24);
	const [showCustom, setShowCustom] = useState(false);
	const [customFrom, setCustomFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 16); });
	const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 16));
	const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);

	// Data
	const [readings, setReadings] = useState<HistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);

	// Chart
	const [chartType, setChartType] = useState<ChartType>("line");
	const [activeDevices, setActiveDevices] = useState<Set<string>>(new Set());

	// Zoom
	const [yDomain, setYDomain] = useState<[number, number] | null>(null);
	const [brushIdx, setBrushIdx] = useState<[number, number] | null>(null); // [start, end] indices into flatData
	const [candleBrushIdx, setCandleBrushIdx] = useState<[number, number] | null>(null);
	const lineBarRef = useRef<HTMLDivElement>(null);
	const yDomainRef = useRef<[number, number] | null>(null);
	const visibleRef = useRef<Record<string, number | string>[]>([]);
	const activeListRef = useRef<string[]>([]);
	yDomainRef.current = yDomain;

	const effectiveSpanH = appliedRange
		? (new Date(appliedRange.to).getTime() - new Date(appliedRange.from).getTime()) / 3_600_000
		: presetH;

	const fetchHistory = useCallback(async () => {
		setLoading(true);
		try {
			let hoursToFetch = presetH;
			if (appliedRange) {
				hoursToFetch = Math.ceil((Date.now() - new Date(appliedRange.from).getTime()) / 3_600_000) + 1;
			}
			const res = await fetch(`/api/power/history?hours=${Math.min(hoursToFetch, 24 * 60)}`);
			if (!res.ok) return;
			let r: HistoryEntry[] = (await res.json()).readings ?? [];
			if (appliedRange) {
				const from = new Date(appliedRange.from).getTime();
				const to = new Date(appliedRange.to).getTime();
				r = r.filter(e => { const t = new Date(e.ts).getTime(); return t >= from && t <= to; });
			}
			setReadings(r);
			setBrushIdx(null);
			setCandleBrushIdx(null);
			setYDomain(null);
		} finally {
			setLoading(false);
		}
	}, [presetH, appliedRange]);

	useEffect(() => { fetchHistory(); }, [fetchHistory]);

	const deviceNames = Array.from(new Set(readings.flatMap(r => r.devices.map(d => d.name)))).sort();
	useEffect(() => {
		setActiveDevices(prev => prev.size > 0 ? prev : new Set(deviceNames));
	}, [deviceNames.join(",")]);

	const activeList = deviceNames.filter(n => activeDevices.has(n));
	activeListRef.current = activeList;

	// Flat data for line/bar
	const flatData = readings.map(r => {
		const pt: Record<string, number | string> = { ts: fmtTs(r.ts, effectiveSpanH) };
		for (const d of r.devices) if (activeDevices.has(d.name)) pt[d.name] = Number(d.watts.toFixed(1));
		return pt;
	});
	const visibleFlat = brushIdx ? flatData.slice(brushIdx[0], brushIdx[1] + 1) : flatData;
	visibleRef.current = visibleFlat;

	// Candle data
	const candleData = bucketCandles(readings, effectiveSpanH);
	const visibleCandle = candleBrushIdx ? candleData.slice(candleBrushIdx[0], candleBrushIdx[1] + 1) : candleData;

	// Y domain: scroll-zoomed > auto from visible data > recharts auto
	const effectiveYDomain = yDomain ?? autoYDomain(chartType === "candle" ? [] : visibleFlat, activeList);

	// Scroll Y zoom for line/bar
	useEffect(() => {
		const el = lineBarRef.current;
		if (!el) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			const [curMin, curMax] = yDomainRef.current ?? autoYDomain(visibleRef.current, activeListRef.current) ?? [0, 500];
			const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
			const rect = el.getBoundingClientRect();
			const pct = 1 - (e.clientY - rect.top) / rect.height;
			const center = curMin + pct * (curMax - curMin);
			const half = (curMax - curMin) / 2 * factor;
			setYDomain([Math.max(0, center - half), center + half]);
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
	}, []);

	const isZoomed = !!(yDomain || brushIdx || candleBrushIdx);
	const resetZoom = () => { setYDomain(null); setBrushIdx(null); setCandleBrushIdx(null); };

	const toggleDevice = (name: string) => {
		setActiveDevices(prev => {
			const next = new Set(prev);
			if (next.has(name)) { if (next.size > 1) next.delete(name); } else next.add(name);
			return next;
		});
	};

	const summaries = deviceNames.map(name => ({ name, summary: computeSummary(readings, name) }));
	const totalKWh = summaries.reduce((s, { summary }) => s + (summary?.kWh ?? 0), 0);

	const axisProps = { tick: { fontSize: 11, fill: "currentColor", fillOpacity: 0.4 } as any, tickLine: false, axisLine: false };

	// Double-click resets all zoom
	const onChartDblClick = () => resetZoom();

	return (
		<div className="w-full h-full bg-primary text-foreground overflow-hidden flex flex-row">
			<SideNav online={false} devConsoleOpen={false} onToggleDevConsole={() => {}} />

			<div className="flex-1 overflow-y-auto pt-[52px] lg:pt-0 lg:m-[10px_10px_10px_0px] lg:rounded-2xl lg:border lg:border-blue/20 min-w-0">
				<div className="max-w-5xl mx-auto px-3 pb-20 pt-8">

					{/* Header */}
					<div className="flex flex-wrap items-start justify-between gap-4 mb-8">
						<div>
							<h1 className="text-2xl font-semibold tracking-tight text-foreground">Power Analytics</h1>
							<p className="text-sm text-foreground-sec mt-1">
								{readings.length} readings · LADWP ${COST_PER_KWH}/kWh
								{appliedRange && <span> · {fmtDt(appliedRange.from)} – {fmtDt(appliedRange.to)}</span>}
							</p>
						</div>

						{/* Range picker */}
						<div className="flex flex-col gap-1.5 items-end">
							<span className="text-[10px] font-medium text-foreground-sec">Time Range</span>
							<div className="flex gap-1 bg-secondary/50 rounded-xl p-1">
								{PRESETS.map(({ label, h }) => (
									<HelpTooltip key={h} text={`Show data for the last ${label}.`}>
										<button onClick={() => { setPresetH(h); setAppliedRange(null); setShowCustom(false); }}
											className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer " +
												(!appliedRange && presetH === h ? "bg-blue text-white" : "text-foreground-sec hover:text-foreground")}>
											{label}
										</button>
									</HelpTooltip>
								))}
								<HelpTooltip text="Enter a custom date and time range to query exactly the data you want.">
									<button onClick={() => setShowCustom(s => !s)}
										className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer " +
											(showCustom || appliedRange ? "bg-blue text-white" : "text-foreground-sec hover:text-foreground")}>
										Custom
									</button>
								</HelpTooltip>
							</div>

							{/* Custom date range picker */}
							{showCustom && (
								<div className="flex flex-wrap items-center gap-2 bg-secondary/40 border border-secondary rounded-xl p-2.5 text-xs">
									<div className="flex items-center gap-1.5">
										<span className="text-foreground-sec">From</span>
										<input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
											className="bg-secondary/60 border border-secondary rounded-lg px-2 py-1 text-foreground text-xs outline-none focus:border-blue/60" />
									</div>
									<div className="flex items-center gap-1.5">
										<span className="text-foreground-sec">To</span>
										<input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
											className="bg-secondary/60 border border-secondary rounded-lg px-2 py-1 text-foreground text-xs outline-none focus:border-blue/60" />
									</div>
									<HelpTooltip text="Apply the selected custom date range to the chart.">
										<button
											onClick={() => { if (customFrom && customTo) { setAppliedRange({ from: customFrom, to: customTo }); setShowCustom(false); } }}
											className="px-3 py-1 bg-blue/10 border border-blue/30 text-blue rounded-lg font-medium hover:bg-blue/20 transition-colors cursor-pointer">
											Apply
										</button>
									</HelpTooltip>
								</div>
							)}
						</div>
					</div>

					{/* Summary cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-8">
						<SummaryCard label="Total energy" value={`${totalKWh.toFixed(3)} kWh`} sub={`≈ $${(totalKWh * COST_PER_KWH).toFixed(3)}`} />
						{summaries.map(({ name, summary }) => (
							<SummaryCard key={name} label={`${name[0].toUpperCase() + name.slice(1)} avg`}
								value={summary ? `${summary.avgW.toFixed(1)} W` : "—"}
								sub={summary ? `Peak ${summary.peakW.toFixed(1)} W` : undefined}
								color={DEVICE_COLORS[name]} />
						))}
						{summaries.map(({ name, summary }) => (
							<SummaryCard key={`${name}-u`} label={`${name[0].toUpperCase() + name.slice(1)} uptime`}
								value={summary ? `${summary.uptimePct.toFixed(0)}%` : "—"}
								sub={summary ? `${summary.kWh.toFixed(3)} kWh` : undefined} />
						))}
					</div>

					{/* Chart card */}
					<div className="bg-primary border border-secondary rounded-2xl p-5 mb-8">
						{/* Controls row */}
						<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4">
							<div className="flex flex-col gap-1.5">
								<h2 className="text-sm font-medium text-foreground">Power over time</h2>
								{deviceNames.length > 0 && (
									<div className="flex flex-col gap-1">
										<span className="text-[10px] font-medium text-foreground-sec">Devices</span>
										<div className="flex items-center gap-1.5 flex-wrap">
											{deviceNames.map(name => {
												const active = activeDevices.has(name);
												const color = DEVICE_COLORS[name] ?? "#888";
												return (
													<HelpTooltip key={name} text={`Toggle ${name} on or off in the chart.`}>
														<button onClick={() => toggleDevice(name)}
															className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border"
															style={{ borderColor: active ? color + "55" : "transparent", background: active ? color + "18" : "transparent", color: active ? color : "var(--color-foreground-sec)" }}>
															<span className="w-2 h-2 rounded-full" style={{ background: active ? color : "var(--color-secondary)" }} />
															<span className="capitalize">{name}</span>
														</button>
													</HelpTooltip>
												);
											})}
										</div>
									</div>
								)}
							</div>
							<div className="flex items-end gap-3">
								{isZoomed && (
									<HelpTooltip text="Reset the chart zoom back to the full selected time range.">
										<button onClick={resetZoom}
											className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground-sec hover:text-foreground border border-secondary hover:border-secondary/80 transition-colors cursor-pointer">
											<IconRefresh size={11} />
											Reset zoom
										</button>
									</HelpTooltip>
								)}
								<div className="flex flex-col gap-1">
									<span className="text-[10px] font-medium text-foreground-sec">Chart Type</span>
									<div className="flex gap-0.5 bg-secondary/50 rounded-lg p-0.5">
										{(["line", "bar", "candle"] as ChartType[]).map(type => (
											<HelpTooltip key={type} text={type === "line" ? "Line chart: shows power over time as a smooth curve." : type === "bar" ? "Bar chart: shows aggregated energy per time bucket." : "Candlestick chart: shows min/max/open/close power per period."}>
												<button onClick={() => { setChartType(type); resetZoom(); }}
													className={"px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize " +
														(chartType === type ? "bg-primary text-foreground shadow-sm" : "text-foreground-sec hover:text-foreground")}>
													{type}
												</button>
											</HelpTooltip>
										))}
									</div>
								</div>
							</div>
						</div>

						<p className="text-[11px] text-foreground-sec/50 mb-3">
							{chartType === "candle" ? "Drag to zoom X · scroll to zoom Y · double-click to reset" : "Drag brush below chart to zoom X · scroll to zoom Y · double-click to reset"}
						</p>

						{/* Chart body */}
						{loading ? (
							<div className="skeleton h-[300px]" />
						) : readings.length === 0 ? (
							<div className="flex items-center justify-center h-[300px] text-foreground-sec text-sm">
								No data yet — readings are recorded every 5 minutes.
							</div>
						) : chartType === "candle" ? (
							<CandleChart
								data={visibleCandle}
								activeDevices={activeList}
								yDomain={yDomain}
								onYDomainChange={d => setYDomain(d)}
								onBrush={(s, e) => {
									const base = candleBrushIdx ? candleBrushIdx[0] : 0;
									setCandleBrushIdx([base + s, base + e]);
								}}
							/>
						) : (
							<div ref={lineBarRef} onDoubleClick={onChartDblClick}>
								<ResponsiveContainer width="100%" height={300}>
									{chartType === "bar" ? (
										<BarChart data={flatData} margin={CHART_MARGIN}>
											<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
											<XAxis dataKey="ts" {...axisProps} interval="preserveStartEnd" />
											<YAxis {...axisProps} domain={effectiveYDomain ?? ["auto", "auto"]} tickFormatter={v => `${v}W`} width={50} />
											<Tooltip content={<CustomTooltip />} />
											<Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={v => String(v)[0].toUpperCase() + String(v).slice(1)} />
											{activeList.map(name => <Bar key={name} dataKey={name} fill={DEVICE_COLORS[name] ?? "#888"} fillOpacity={0.8} radius={[2, 2, 0, 0]} maxBarSize={16} />)}
											<Brush dataKey="ts" height={22} stroke="var(--color-secondary)" fill="var(--color-primary)" travellerWidth={6}
												onChange={({ startIndex, endIndex }) => {
													setBrushIdx([startIndex as number, endIndex as number]);
													setYDomain(null);
												}} />
										</BarChart>
									) : (
										<LineChart data={flatData} margin={CHART_MARGIN}>
											<CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
											<XAxis dataKey="ts" {...axisProps} interval="preserveStartEnd" />
											<YAxis {...axisProps} domain={effectiveYDomain ?? ["auto", "auto"]} tickFormatter={v => `${v}W`} width={50} />
											<Tooltip content={<CustomTooltip />} />
											<Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={v => String(v)[0].toUpperCase() + String(v).slice(1)} />
											{activeList.map(name => (
												<Line key={name} type="monotone" dataKey={name} stroke={DEVICE_COLORS[name] ?? "#888"} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
											))}
											<Brush dataKey="ts" height={22} stroke="var(--color-secondary)" fill="var(--color-primary)" travellerWidth={6}
												onChange={({ startIndex, endIndex }) => {
													setBrushIdx([startIndex as number, endIndex as number]);
													setYDomain(null);
												}} />
										</LineChart>
									)}
								</ResponsiveContainer>
							</div>
						)}
					</div>

					{/* Device breakdown */}
					{summaries.length > 0 && (
						<>
							<h2 className="text-lg font-medium tracking-tight text-foreground mb-5">Device breakdown</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
								{summaries.map(({ name, summary }) => {
									if (!summary) return null;
									const color = DEVICE_COLORS[name] ?? "#888";
									return (
										<div key={name} className="bg-primary border border-secondary rounded-2xl p-5">
											<div className="flex items-center gap-2 mb-4">
												<span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
												<h3 className="text-sm font-medium text-foreground capitalize">{name}</h3>
											</div>
											<div className="grid grid-cols-3 gap-4">
												{[
													{ label: "Average", value: `${summary.avgW.toFixed(1)} W` },
													{ label: "Peak", value: `${summary.peakW.toFixed(1)} W` },
													{ label: "Uptime", value: `${summary.uptimePct.toFixed(1)}%` },
													{ label: "Energy", value: `${summary.kWh.toFixed(3)} kWh` },
													{ label: "Est. cost", value: `$${summary.cost.toFixed(3)}` },
													{ label: "Readings", value: String(readings.filter(r => r.devices.some(d => d.name === name)).length) },
												].map(({ label, value }) => (
													<div key={label} className="flex flex-col gap-0.5">
														<span className="text-xs text-foreground-sec">{label}</span>
														<span className="text-sm font-medium text-foreground">{value}</span>
													</div>
												))}
											</div>
										</div>
									);
								})}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
