"use client";

import React, { useState, useEffect, useMemo } from "react";
import { type Stats } from "../../lib/getStats";
import AnalyticsPanel from "./AnalyticsPanel";
import HelpTooltip from "../HelpTooltip";
import { useStats } from "../../lib/DataProvider";

// ── Types / constants ─────────────────────────────────────────────────────────

const COST_PER_KWH = 0.24;

interface DeviceReading { name: string; watts: number; on: boolean; today_wh: number; month_wh: number; }
interface HistoryEntry  { ts: string; devices: DeviceReading[]; }

const PRESETS = [
	{ label: "1h",  h: 1   },
	{ label: "6h",  h: 6   },
	{ label: "24h", h: 24  },
	{ label: "3d",  h: 72  },
	{ label: "7d",  h: 168 },
	{ label: "30d", h: 720 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(mb: number): string {
	if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
	return `${mb.toFixed(0)} MB`;
}

function fmtUptime(up: Stats["uptime"]): string {
	const parts: string[] = [];
	if (up.days > 0) parts.push(`${up.days}d`);
	if (up.hours > 0 || up.days > 0) parts.push(`${up.hours}h`);
	parts.push(`${up.minutes}m`);
	return parts.join(" ");
}

function fmtNetBytes(bytes: number): string {
	if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB/s`;
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB/s`;
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB/s`;
	return `${bytes.toFixed(0)} B/s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, hot }: { label: string; value: string; sub?: string; hot?: boolean }) {
	return (
		<div style={{
			border: "1px solid var(--color-secondary)",
			borderRadius: 12,
			padding: "16px 20px",
			display: "flex",
			flexDirection: "column",
			gap: 4,
			background: "var(--color-primary)",
		}}>
			<p style={{ fontSize: "11px", color: "var(--color-foreground-sec)", fontWeight: 600, margin: 0 }}>
				{label}
			</p>
			<p style={{ fontSize: "24pt", fontWeight: 700, color: hot ? "var(--color-blue)" : "var(--color-foreground)", lineHeight: 1, margin: 0 }}>
				{value}
			</p>
			{sub && <p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>{sub}</p>}
		</div>
	);
}

function PowerSummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
	return (
		<div style={{
			border: "1px solid var(--color-secondary)",
			borderRadius: 12,
			padding: "14px 18px",
			display: "flex",
			flexDirection: "column",
			gap: 3,
		}}>
			<p style={{ fontSize: "11px", color: "var(--color-foreground-sec)", fontWeight: 600, margin: 0 }}>
				{label}
			</p>
			<p style={{ fontSize: "20pt", fontWeight: 700, color: accent ?? "var(--color-foreground)", lineHeight: 1.1, margin: 0 }}>
				{value}
			</p>
			{sub && <p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>{sub}</p>}
		</div>
	);
}

function BreakdownBar({ label, count, total, color }: { label: string; count: number; total: number; color?: string }) {
	const pct = total > 0 ? Math.round((count / total) * 100) : 0;
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5pt" }}>
				<span style={{ color: "var(--color-foreground)", fontWeight: 500 }}>{label}</span>
				<span style={{ color: "var(--color-foreground-sec)" }}>{count} · {pct}%</span>
			</div>
			<div style={{ height: 4, borderRadius: 2, background: "var(--color-secondary)", overflow: "hidden" }}>
				<div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: color ?? "var(--color-blue)", transition: "width 0.4s ease" }} />
			</div>
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<p style={{ fontSize: "10pt", fontWeight: 600, color: "var(--color-foreground)", margin: "0 0 12px 0" }}>
			{children}
		</p>
	);
}

// ── DashboardPanel ────────────────────────────────────────────────────────────

export default function DashboardPanel({ isAuthed }: { isAuthed: boolean }) {
	const { stats, netSpeed } = useStats();

	const [hours, setHours] = useState(24);
	const [readings, setReadings] = useState<HistoryEntry[]>([]);
	const [powerLoading, setPowerLoading] = useState(true);

	// Power history fetch
	useEffect(() => {
		let cancelled = false;
		setPowerLoading(true);
		fetch(`/api/power/history?hours=${hours}`)
			.then(r => r.ok ? r.json() : { readings: [] })
			.then(d => { if (!cancelled) { setReadings(d.readings ?? []); setPowerLoading(false); } })
			.catch(() => { if (!cancelled) setPowerLoading(false); });
		return () => { cancelled = true; };
	}, [hours]);

	// Power summary stats
	const powerStats = useMemo(() => {
		if (readings.length === 0) return null;
		const deviceNames = [...new Set(readings.flatMap(r => r.devices.map(d => d.name)))];
		let totalWh = 0;
		let totalAvgW = 0;
		for (const name of deviceNames) {
			const pts = readings
				.map(r => { const d = r.devices.find(x => x.name === name); return d ? { ts: new Date(r.ts).getTime(), w: d.watts } : null; })
				.filter(Boolean).sort((a, b) => a!.ts - b!.ts) as { ts: number; w: number }[];
			let wh = 0;
			for (let i = 1; i < pts.length; i++) {
				wh += (pts[i].w + pts[i - 1].w) / 2 * (pts[i].ts - pts[i - 1].ts) / 3_600_000;
			}
			totalWh += wh;
			totalAvgW += pts.length ? pts.reduce((s, p) => s + p.w, 0) / pts.length : 0;
		}
		const cost = totalWh / 1000 * COST_PER_KWH;
		const latest = readings[readings.length - 1];
		const activeDevices = latest ? latest.devices.filter(d => d.on).length : 0;
		const totalDevices  = latest ? latest.devices.length : 0;
		return { totalWh, totalAvgW, cost, activeDevices, totalDevices };
	}, [readings]);

	const s = stats;

	const svcEntries = isAuthed && s ? Object.entries(s.services) : [];
	const svcRunning = svcEntries.filter(([, v]) => v === "running" || v === "active").length;
	const svcStopped = svcEntries.filter(([, v]) => v === "inactive" || v === "stopped" || v === "dead").length;
	const svcFailed  = svcEntries.filter(([, v]) => v === "failed").length;
	const svcTotal   = svcEntries.length;

	return (
		<div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>

			{/* System stat cards */}
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
				<StatCard label="CPU"    value={s ? `${s.cpu.percent.toFixed(1)}%` : "—"}          sub={s?.cpu.model.replace(/\(R\)/g, "").replace(/\(TM\)/g, "").trim().split(" ").slice(0, 4).join(" ")} hot={s != null && s.cpu.percent > 80} />
				<StatCard label="Memory" value={s ? `${s.memory.percent.toFixed(0)}%` : "—"}       sub={s ? `${fmtBytes(s.memory.used)} / ${fmtBytes(s.memory.total)}` : ""}                               hot={s != null && s.memory.percent > 85} />
				<StatCard label="Disk"   value={s ? `${s.disk.percent}%` : "—"}                    sub={s ? `${(s.disk.used / 1024).toFixed(1)} GB / ${(s.disk.total / 1024).toFixed(0)} GB` : ""}         hot={s != null && s.disk.percent > 90} />
				<StatCard label="Temp"   value={s?.temperature != null ? `${s.temperature}°` : "—"} sub={s?.temperature != null ? (s.temperature > 80 ? "Running hot" : s.temperature > 60 ? "Warm" : "Cool") : ""} hot={s?.temperature != null && s.temperature > 75} />
			</div>

			{/* Power analytics section */}
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

				{/* Header row: title + time range pills */}
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
					<p style={{ fontSize: "10pt", fontWeight: 600, color: "var(--color-foreground)", margin: 0 }}>
						Power Analytics
					</p>
					<div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
						<span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-foreground-sec)" }}>Time Range</span>
						<div style={{ display: "flex", gap: 4 }}>
						{PRESETS.map(p => (
							<HelpTooltip key={p.h} text={`Show power analytics for the last ${p.label}.`}>
								<button onClick={() => setHours(p.h)} style={{
									padding: "4px 10px", borderRadius: 7, fontSize: "10pt", fontWeight: 500, cursor: "pointer",
									border: `1px solid ${hours === p.h ? "var(--color-blue)" : "var(--color-secondary)"}`,
									background: hours === p.h ? "color-mix(in srgb, var(--color-blue) 14%, transparent)" : "transparent",
									color: hours === p.h ? "var(--color-blue)" : "var(--color-foreground-sec)",
									transition: "all 120ms",
								}}>
									{p.label}
								</button>
							</HelpTooltip>
						))}
					</div>
					</div>
				</div>

				{/* Summary cards */}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
					<PowerSummaryCard
						label="Avg Power"
						value={powerStats ? `${powerStats.totalAvgW.toFixed(1)} W` : "—"}
						sub="combined average"
						accent="var(--color-blue)"
					/>
					<PowerSummaryCard
						label="Total Energy"
						value={powerStats ? (powerStats.totalWh >= 1000 ? `${(powerStats.totalWh / 1000).toFixed(2)} kWh` : `${powerStats.totalWh.toFixed(1)} Wh`) : "—"}
						sub={`over ${PRESETS.find(p => p.h === hours)?.label ?? `${hours}h`}`}
					/>
					<PowerSummaryCard
						label="Est. Cost"
						value={powerStats ? `$${powerStats.cost.toFixed(3)}` : "—"}
						sub={`@ $${COST_PER_KWH}/kWh`}
						accent="#5dd776"
					/>
					<PowerSummaryCard
						label="Active Devices"
						value={powerStats ? `${powerStats.activeDevices}` : "—"}
						sub={powerStats ? `of ${powerStats.totalDevices} total` : ""}
					/>
				</div>

				{/* Mini charts */}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
					{([
						{ type: "line" as const, label: "Line" },
						{ type: "bar" as const, label: "Bar" },
						{ type: "candle" as const, label: "Candlestick" },
					]).map(({ type, label }) => (
						<div key={type} style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, overflow: "hidden", height: 220 }}>
							<div style={{ padding: "10px 14px 6px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)" }}>
								<p style={{ fontSize: "9pt", fontWeight: 600, color: "var(--color-foreground-sec)", margin: 0 }}>
									{label}
								</p>
							</div>
							<div style={{ height: "calc(100% - 37px)" }}>
								<AnalyticsPanel mode="past" readOnly defaultHours={hours} />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Authenticated: services + system info */}
			{isAuthed && (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
					{svcTotal > 0 && (
						<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, padding: "16px 20px" }}>
							<SectionTitle>Services ({svcTotal})</SectionTitle>
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								<BreakdownBar label="Running" count={svcRunning} total={svcTotal} color="#5dd776" />
								<BreakdownBar label="Stopped" count={svcStopped} total={svcTotal} color="var(--color-foreground-sec)" />
								{svcFailed > 0 && <BreakdownBar label="Failed" count={svcFailed} total={svcTotal} color="#ef4444" />}
							</div>
						</div>
					)}
					{s?.loadAvg && (
						<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, padding: "16px 20px" }}>
							<SectionTitle>Load Average</SectionTitle>
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								{([["1 min", s.loadAvg["1m"]], ["5 min", s.loadAvg["5m"]], ["15 min", s.loadAvg["15m"]]] as [string, number][]).map(([label, val]) => (
									<div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
										<span style={{ fontSize: "9.5pt", color: "var(--color-foreground)", fontWeight: 500 }}>{label}</span>
										<span style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)" }}>{val.toFixed(2)}</span>
									</div>
								))}
							</div>
						</div>
					)}
					{s?.uptime && (
						<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, padding: "16px 20px" }}>
							<SectionTitle>Uptime</SectionTitle>
							<p style={{ fontSize: "22pt", fontWeight: 700, color: "var(--color-foreground)", lineHeight: 1, margin: "0 0 8px 0" }}>
								{fmtUptime(s.uptime)}
							</p>
							<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>
								{s.uptime.days > 0
									? `${s.uptime.days} days, ${s.uptime.hours} hours, ${s.uptime.minutes} min`
									: `${s.uptime.hours} hours, ${s.uptime.minutes} min`}
							</p>
						</div>
					)}
					{netSpeed && (
						<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, padding: "16px 20px" }}>
							<SectionTitle>Network</SectionTitle>
							<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<span style={{ fontSize: "9.5pt", color: "var(--color-foreground)", fontWeight: 500 }}>↓ Download</span>
									<span style={{ fontSize: "9.5pt", color: "#5dd776", fontWeight: 600 }}>{fmtNetBytes(netSpeed.rx)}</span>
								</div>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
									<span style={{ fontSize: "9.5pt", color: "var(--color-foreground)", fontWeight: 500 }}>↑ Upload</span>
									<span style={{ fontSize: "9.5pt", color: "var(--color-blue)", fontWeight: 600 }}>{fmtNetBytes(netSpeed.tx)}</span>
								</div>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Service status table (authenticated only) */}
			{isAuthed && svcEntries.length > 0 && (
				<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, overflow: "hidden" }}>
					<div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-secondary)" }}>
						<SectionTitle>Service Status</SectionTitle>
					</div>
					<table style={{ width: "100%", borderCollapse: "collapse" }}>
						<thead>
							<tr style={{ background: "color-mix(in srgb, var(--color-secondary) 30%, transparent)" }}>
								<th style={{ padding: "8px 20px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "var(--color-foreground-sec)" }}>Service</th>
								<th style={{ padding: "8px 20px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "var(--color-foreground-sec)" }}>Status</th>
							</tr>
						</thead>
						<tbody>
							{svcEntries.map(([name, status], i) => {
								const isRunning = status === "running" || status === "active";
								const isFailed  = status === "failed";
								const color = isFailed ? "#ef4444" : isRunning ? "#5dd776" : "var(--color-foreground-sec)";
								return (
									<tr key={name} style={{ background: i % 2 !== 0 ? "color-mix(in srgb, var(--color-secondary) 20%, transparent)" : "transparent" }}>
										<td style={{ padding: "8px 20px", fontSize: "10pt", fontWeight: 500, color: "var(--color-foreground)" }}>{name}</td>
										<td style={{ padding: "8px 20px", textAlign: "right" }}>
											<span style={{ fontSize: "9pt", fontWeight: 600, color, textTransform: "capitalize" }}>{status}</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
