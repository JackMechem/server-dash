"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePower } from "../../lib/DataProvider";
import RangePicker, { type RangeUnit, RANGE_UNIT_HOURS } from "@/app/components/RangePicker";

// ── Constants ─────────────────────────────────────────────────────────────────

const COST_PER_KWH = 0.24;
const HOURS_PER_MONTH = 730;

const CHART_PALETTE = [
	"#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa",
	"#f472b6", "#22d3ee", "#a3e635", "#fb923c", "#818cf8",
];
function chartColor(i: number) { return CHART_PALETTE[i % CHART_PALETTE.length]; }

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeviceReading {
	name: string; watts: number; on: boolean;
	today_wh: number; month_wh: number;
}
interface HistoryEntry { ts: string; devices: DeviceReading[]; }

export type SummaryType = "cost" | "power" | "energy";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCost(v: number): string {
	if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
	if (v >= 100) return `$${v.toFixed(0)}`;
	return `$${v.toFixed(2)}`;
}
function fmtPower(v: number): string {
	if (v >= 1000) return `${(v / 1000).toFixed(2)} kW`;
	return `${v.toFixed(1)} W`;
}
function fmtEnergy(v: number): string {
	if (v >= 1) return `${v.toFixed(2)} kWh`;
	return `${(v * 1000).toFixed(0)} Wh`;
}

function fmtAxisTick(v: number, type: SummaryType): string {
	if (v === 0) return "0";
	if (type === "cost") {
		if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
		if (v >= 100) return `$${Math.round(v)}`;
		if (v >= 10) return `$${v.toFixed(1)}`;
		return `$${v.toFixed(2)}`;
	}
	if (type === "power") {
		if (v >= 1000) return `${(v / 1000).toFixed(1)}kW`;
		return `${Math.round(v)}W`;
	}
	// energy (already in kWh)
	if (v >= 100) return `${Math.round(v)}`;
	if (v >= 10) return `${v.toFixed(1)}`;
	if (v >= 1) return `${v.toFixed(2)}`;
	return `${(v * 1000).toFixed(0)}Wh`;
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
	return (
		<div style={{
			background: "var(--color-secondary)",
			borderRadius: 10, padding: "12px 10px",
			flex: 1, minWidth: 0,
		}}>
			<p style={{
				fontSize: 11, fontWeight: 500, margin: "0 0 4px",
				color: "var(--color-foreground-sec)",
			}}>
				{label}
			</p>
			<p style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.2, color: "var(--color-foreground)" }}>
				{value}
			</p>
			{sub && (
				<p style={{ fontSize: 11, margin: "3px 0 0", color: "var(--color-foreground-sec)" }}>
					{sub}
				</p>
			)}
		</div>
	);
}

// ── BarChart ──────────────────────────────────────────────────────────────────

function BarChart({ labels, values, colors, type }: {
	labels: string[]; values: number[]; colors: string[]; type: SummaryType;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(300);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		setWidth(el.getBoundingClientRect().width);
		const obs = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	const H = 168, ML = 46, MR = 6, MT = 24, MB = 40;
	const iW = Math.max(1, width - ML - MR);
	const iH = H - MT - MB;
	const maxVal = Math.max(...values, 0.001);
	const barGap = iW / Math.max(labels.length, 1);
	const barW = Math.max(6, Math.min(44, barGap * 0.55));

	// Nice Y ticks
	const rawStep = maxVal / 4;
	const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 0.0001))));
	const nice = rawStep / mag;
	const step = nice <= 1 ? mag : nice <= 2 ? mag * 2 : nice <= 5 ? mag * 5 : mag * 10;
	const yTicks: number[] = [];
	for (let v = 0; v <= maxVal * 1.15; v += step) {
		yTicks.push(v);
		if (yTicks.length > 6) break;
	}

	return (
		<div ref={containerRef} style={{ width: "100%" }}>
			<svg width={width} height={H} style={{ display: "block", overflow: "visible" }}>
				{yTicks.map((tick) => {
					const y = MT + iH - (tick / maxVal) * iH;
					if (y < MT - 4 || y > MT + iH + 4) return null;
					return (
						<g key={tick}>
							<line x1={ML} x2={ML + iW} y1={y} y2={y}
								stroke="var(--color-secondary)" strokeWidth={1} />
							<text x={ML - 4} y={y + 3.5} textAnchor="end"
								fontSize={10} fill="var(--color-foreground-sec)" fontFamily="inherit">
								{fmtAxisTick(tick, type)}
							</text>
						</g>
					);
				})}

				{labels.map((label, i) => {
					const cx = ML + barGap * i + barGap / 2;
					const barH = values[i] > 0 ? Math.max(2, (values[i] / maxVal) * iH) : 0;
					const by = MT + iH - barH;
					const shortLabel = label.length > 9 ? label.slice(0, 8) + "…" : label;
					return (
						<g key={label}>
							<rect x={cx - barW / 2} y={by} width={barW} height={barH}
								rx={3} fill={colors[i]} fillOpacity={0.85} />
							{barH > 12 && (
								<text x={cx} y={by - 4} textAnchor="middle" fontSize={10}
									fill={colors[i]} fontFamily="inherit" fontWeight={600}>
									{fmtAxisTick(values[i], type)}
								</text>
							)}
							<text x={cx} y={MT + iH + 14} textAnchor="middle" fontSize={10}
								fill="var(--color-foreground-sec)" fontFamily="inherit">
								{shortLabel}
							</text>
						</g>
					);
				})}

				<line x1={ML} x2={ML} y1={MT} y2={MT + iH}
					stroke="var(--color-secondary)" strokeWidth={1} />
			</svg>
		</div>
	);
}

// ── SummaryPanel ──────────────────────────────────────────────────────────────

export default function SummaryPanel({ type }: { type: SummaryType }) {
	const { power } = usePower();
	const [rangeCount, setRangeCount] = useState(1);
	const [rangeUnit, setRangeUnit] = useState<RangeUnit>("days");
	const [reload, setReload] = useState(0);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const hours = Math.max(1, rangeCount * RANGE_UNIT_HOURS[rangeUnit]);

	// Current snapshot comes from shared context — no extra fetch needed.
	const current: DeviceReading[] = (power?.devices ?? []).map(d => ({
		name: d.name, watts: d.current_power_w, on: d.on,
		today_wh: d.today_energy_wh ?? 0,
		month_wh: d.month_energy_wh ?? 0,
	}));

	useEffect(() => {
		setLoading(true);
		setError(null);
		fetch(`/api/power/history?hours=${hours}`)
			.then(r => { if (!r.ok) throw new Error("history"); return r.json(); })
			.then(hist => { setHistory(hist.readings ?? []); })
			.catch(e => setError(e.message))
			.finally(() => setLoading(false));
	}, [hours, reload]);

	// Stable device list: current order first, then history-only extras
	const deviceNames = useMemo(() => {
		const seen = new Set(current.map(d => d.name));
		const extra: string[] = [];
		for (const entry of history) {
			for (const d of entry.devices) {
				if (!seen.has(d.name)) { seen.add(d.name); extra.push(d.name); }
			}
		}
		return [...current.map(d => d.name), ...extra];
	}, [current, history]);

	const { avgWMap, peakWMap } = useMemo(() => {
		const samples = new Map<string, number[]>();
		const peaks = new Map<string, number>();
		for (const entry of history) {
			for (const d of entry.devices) {
				if (!samples.has(d.name)) samples.set(d.name, []);
				samples.get(d.name)!.push(d.watts);
				peaks.set(d.name, Math.max(peaks.get(d.name) ?? 0, d.watts));
			}
		}
		return {
			avgWMap: new Map([...samples.entries()].map(([n, v]) => [n, v.reduce((a, b) => a + b, 0) / v.length])),
			peakWMap: peaks,
		};
	}, [history]);

	const deviceStats = useMemo(() => deviceNames.map((name, i) => {
		const cur = current.find(d => d.name === name);
		const avgW = avgWMap.get(name) ?? cur?.watts ?? 0;
		const peakW = peakWMap.get(name) ?? cur?.watts ?? 0;
		const currentW = cur?.watts ?? 0;
		const todayWh = cur?.today_wh ?? 0;
		const monthWh = cur?.month_wh ?? 0;
		const estMonthlyWh = avgW * HOURS_PER_MONTH;
		return {
			name, color: chartColor(i),
			avgW, peakW, currentW,
			todayWh, monthWh, estMonthlyWh,
			estMonthlyCost: (estMonthlyWh / 1000) * COST_PER_KWH,
			actualMonthCost: (monthWh / 1000) * COST_PER_KWH,
			todayCost: (todayWh / 1000) * COST_PER_KWH,
		};
	}), [deviceNames, current, avgWMap, peakWMap]);

	const totals = useMemo(() => {
		const totalAvgW = deviceStats.reduce((a, d) => a + d.avgW, 0);
		const totalCurrentW = current.reduce((a, d) => a + d.watts, 0);
		const peakTotals = history.map(e => e.devices.reduce((a, d) => a + d.watts, 0));
		const totalPeakW = peakTotals.length > 0 ? Math.max(...peakTotals) : 0;
		const totalMonthWh = current.reduce((a, d) => a + d.month_wh, 0);
		const totalTodayWh = current.reduce((a, d) => a + d.today_wh, 0);
		const totalEstMonthlyWh = totalAvgW * HOURS_PER_MONTH;
		return {
			totalAvgW, totalCurrentW, totalPeakW,
			totalMonthWh, totalTodayWh, totalEstMonthlyWh,
			estMonthlyCost: (totalEstMonthlyWh / 1000) * COST_PER_KWH,
			actualMonthCost: (totalMonthWh / 1000) * COST_PER_KWH,
			todayCost: (totalTodayWh / 1000) * COST_PER_KWH,
		};
	}, [deviceStats, current, history]);

	const singular: Record<RangeUnit, string> = { hours: "hour", days: "day", months: "month", years: "year" };
	const rangeHint = `${rangeCount} ${rangeCount === 1 ? singular[rangeUnit] : rangeUnit}`;

	const statCards = useMemo(() => {
		if (type === "cost") return [
			{ label: "Est. Monthly", value: fmtCost(totals.estMonthlyCost), sub: `Avg over last ${rangeHint}` },
			{ label: "This Month", value: fmtCost(totals.actualMonthCost), sub: "Device meter total" },
			{ label: "Today", value: fmtCost(totals.todayCost), sub: "Device meter total" },
		];
		if (type === "power") return [
			{ label: "Current", value: fmtPower(totals.totalCurrentW), sub: "Live reading" },
			{ label: "Average", value: fmtPower(totals.totalAvgW), sub: `Over last ${rangeHint}` },
			{ label: "Peak", value: fmtPower(totals.totalPeakW), sub: `Over last ${rangeHint}` },
		];
		return [
			{ label: "Est. Monthly", value: fmtEnergy(totals.totalEstMonthlyWh / 1000), sub: `Avg over last ${rangeHint}` },
			{ label: "This Month", value: fmtEnergy(totals.totalMonthWh / 1000), sub: "Device meter total" },
			{ label: "Today", value: fmtEnergy(totals.totalTodayWh / 1000), sub: "Device meter total" },
		];
	}, [type, totals, rangeHint]);

	const barData = useMemo(() => ({
		labels: deviceStats.map(d => d.name),
		colors: deviceStats.map(d => d.color),
		values: type === "cost"
			? deviceStats.map(d => d.estMonthlyCost)
			: type === "power"
			? deviceStats.map(d => d.avgW)
			: deviceStats.map(d => d.estMonthlyWh / 1000),
	}), [type, deviceStats]);

	const barTitle = type === "cost" ? "Est. Monthly Cost by Device"
		: type === "power" ? "Average Power by Device"
		: "Est. Monthly Energy by Device";


	if (loading) return (
		<div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
			{[72, 180, 120].map((h, i) => (
				<div key={i} style={{
					height: h, borderRadius: 10,
					background: "var(--color-secondary)",
					opacity: 0.6,
					animation: `pulse 1.5s ease-in-out ${i * 0.15}s infinite`,
				}} />
			))}
		</div>
	);

	if (error) return (
		<div style={{ padding: 16, color: "var(--color-foreground-sec)", fontSize: 14 }}>
			Failed to load data.{" "}
			<button
				onClick={() => setReload(c => c + 1)}
				style={{ color: "var(--color-blue)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
			>
				Retry
			</button>
		</div>
	);

	const SEC: React.CSSProperties = {
		fontSize: 13, fontWeight: 600, margin: "0 0 8px",
		color: "var(--color-foreground-sec)",
	};
	const DIVIDER: React.CSSProperties = {
		height: 1, background: "var(--color-secondary)", margin: "16px 0",
	};

	return (
		<div style={{ padding: "14px 16px 28px" }}>
			{/* Range picker */}
			<p style={SEC}>Range</p>
			<div style={{ marginBottom: 18 }}>
				<RangePicker
					count={rangeCount} unit={rangeUnit}
					onCountChange={setRangeCount}
					onUnitChange={setRangeUnit}
				/>
			</div>

			{/* Stat cards */}
			<p style={SEC}>Overview</p>
			<div style={{ display: "flex", gap: 8 }}>
				{statCards.map(card => <StatCard key={card.label} {...card} />)}
			</div>

			<div style={DIVIDER} />

			{/* Bar chart */}
			{deviceStats.length > 0 && (
				<>
					<p style={SEC}>{barTitle}</p>
					<BarChart {...barData} type={type} />
					<div style={DIVIDER} />
				</>
			)}

			{/* Per-device rows */}
			<p style={SEC}>By Device</p>
			{deviceStats.length === 0 ? (
				<p style={{ color: "var(--color-foreground-sec)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
					No device data available
				</p>
			) : deviceStats.map(d => {
				let primary: string, secondary: string;
				if (type === "cost") {
					primary = fmtCost(d.estMonthlyCost) + "/mo est.";
					secondary = fmtCost(d.actualMonthCost) + " this month";
				} else if (type === "power") {
					primary = fmtPower(d.avgW) + " avg";
					secondary = fmtPower(d.currentW) + " now";
				} else {
					primary = fmtEnergy(d.estMonthlyWh / 1000) + "/mo est.";
					secondary = fmtEnergy(d.monthWh / 1000) + " this month";
				}
				return (
					<div key={d.name} style={{
						display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
						borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)",
					}}>
						<div style={{
							width: 9, height: 9, borderRadius: "50%",
							background: d.color, flexShrink: 0,
						}} />
						<div style={{
							flex: 1, fontSize: 14, color: "var(--color-foreground)",
							overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
						}}>
							{d.name}
						</div>
						<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
							<span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-foreground)" }}>
								{primary}
							</span>
							<span style={{ fontSize: 12, color: "var(--color-foreground-sec)" }}>
								{secondary}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
