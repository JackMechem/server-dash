"use client";

import { useState, useEffect } from "react";
import { IconLayoutGrid } from "@tabler/icons-react";
import HelpTooltip from "./HelpTooltip";
import { type Stats } from "../lib/getStats";
import { type PowerData } from "../lib/getPower";
import { formatBytes, statColor } from "../lib/utils";
import { useStats, usePower } from "../lib/DataProvider";

export type WidgetId = string;

const STATIC_WIDGET_OPTIONS: { id: WidgetId; label: string }[] = [
	{ id: "empty", label: "Empty" },
	{ id: "cpu", label: "CPU" },
	{ id: "memory", label: "Memory" },
	{ id: "disk", label: "Disk" },
	{ id: "temp", label: "Temp" },
	{ id: "network", label: "Network" },
	{ id: "uptime", label: "Uptime" },
];

const DEFAULT_WIDGETS: WidgetId[] = ["cpu", "memory", "network", "uptime"];
const STORAGE_KEY = "sidenav-widgets";

const card = "flex flex-col gap-2 p-3 bg-secondary/30 border border-secondary rounded-xl";

function MiniStatWidget({ label, value, percent }: { label: string; value: string; percent?: number }) {
	const color = statColor(percent ?? 0);
	return (
		<div className={card}>
			<span className="text-[11px] text-foreground-sec">{label}</span>
			<span className="text-sm font-medium text-foreground leading-none">{value}</span>
			{percent !== undefined && (
				<div className="h-[3px] bg-secondary rounded-full overflow-hidden">
					<div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, background: color }} />
				</div>
			)}
		</div>
	);
}

function MiniPowerWidget({ label, device }: { label: string; device: { on: boolean; current_power_w: number } | null }) {
	return (
		<div className={card}>
			<div className="flex items-center justify-between">
				<span className="text-[11px] text-foreground-sec truncate">{label}</span>
				{device && (
					<span className="w-[6px] h-[6px] rounded-full shrink-0 ml-1" style={{ background: device.on ? "#5dd776" : "rgba(125,140,155,0.3)" }} />
				)}
			</div>
			<span className="text-sm font-medium text-foreground leading-none">
				{device ? `${device.current_power_w.toFixed(1)} W` : "—"}
			</span>
			<span className="text-[11px] text-foreground-sec leading-none">
				{device ? (device.on ? "On" : "Off") : "—"}
			</span>
		</div>
	);
}

function MiniNetworkWidget({ speed }: { speed: { rx: number; tx: number } | null }) {
	return (
		<div className={card}>
			<span className="text-[11px] text-foreground-sec">Network</span>
			{speed ? (
				<>
					<span className="text-[11px] font-medium text-blue leading-none truncate">↓ {formatBytes(speed.rx)}/s</span>
					<span className="text-[11px] font-medium text-blue/70 leading-none truncate">↑ {formatBytes(speed.tx)}/s</span>
				</>
			) : (
				<span className="text-sm font-medium text-foreground-sec">—</span>
			)}
		</div>
	);
}

function MiniUptimeWidget({ uptime }: { uptime: { days: number; hours: number; minutes: number } | null }) {
	return (
		<div className={card}>
			<span className="text-[11px] text-foreground-sec">Uptime</span>
			{uptime ? (
				<>
					<span className="text-sm font-medium text-foreground leading-none">{uptime.days}d {uptime.hours}h</span>
					<span className="text-[11px] text-foreground-sec leading-none">{uptime.minutes}m</span>
				</>
			) : (
				<span className="text-sm font-medium text-foreground">—</span>
			)}
		</div>
	);
}

function WidgetSlot({
	id, stats, power, netSpeed, editing, onChange,
}: {
	id: WidgetId;
	stats: Stats | null;
	power: PowerData | null;
	netSpeed: { rx: number; tx: number } | null;
	editing: boolean;
	onChange: (id: WidgetId) => void;
}) {
	const powerOptions = (power?.devices ?? []).map((d) => ({
		id: `power-${d.name}`,
		label: `${d.name} Power`,
	}));
	const allOptions = [...STATIC_WIDGET_OPTIONS, ...powerOptions];

	if (editing) {
		return (
			<select
				value={id}
				onChange={(e) => onChange(e.target.value)}
				className="text-[11px] bg-secondary border border-secondary rounded-xl px-2 py-2 text-foreground w-full cursor-pointer"
			>
				{allOptions.map((o) => (
					<option key={o.id} value={o.id}>{o.label}</option>
				))}
			</select>
		);
	}

	if (id === "empty") return <div className="rounded-xl border border-secondary/40 border-dashed" />;
	if (id === "cpu") return <MiniStatWidget label="CPU" value={stats ? `${stats.cpu.percent.toFixed(1)}%` : "—"} percent={stats?.cpu.percent} />;
	if (id === "memory") return <MiniStatWidget label="Memory" value={stats ? `${stats.memory.percent}%` : "—"} percent={stats?.memory.percent} />;
	if (id === "disk") return <MiniStatWidget label="Disk" value={stats ? `${stats.disk.percent}%` : "—"} percent={stats?.disk.percent} />;
	if (id === "temp") return <MiniStatWidget label="Temp" value={stats?.temperature != null ? `${stats.temperature}°C` : "—"} />;
	if (id === "network") return <MiniNetworkWidget speed={netSpeed} />;
	if (id === "uptime") return <MiniUptimeWidget uptime={stats?.uptime ?? null} />;

	if (id.startsWith("power-")) {
		const deviceName = id.slice("power-".length);
		const device = power?.devices.find((d) => d.name === deviceName) ?? null;
		return <MiniPowerWidget label={deviceName} device={device} />;
	}

	return null;
}

export function SideNavWidgets() {
	const [widgets, setWidgets] = useState<WidgetId[]>(DEFAULT_WIDGETS);
	const [editing, setEditing] = useState(false);
	const [mounted, setMounted] = useState(false);

	const { stats, netSpeed } = useStats();
	const { power } = usePower();

	useEffect(() => {
		setMounted(true);
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) setWidgets(JSON.parse(saved));
		} catch {}
	}, []);

	function updateWidget(index: number, id: WidgetId) {
		setWidgets((prev) => {
			const next = [...prev];
			next[index] = id;
			try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
			return next;
		});
	}

	if (!mounted) return null;

	return (
		<div className="px-[8px] mb-[4px] shrink-0">
			<div className="flex items-center justify-between mb-2 px-[2px]">
				<span className="text-xs text-foreground-sec font-medium">Widgets</span>
				<HelpTooltip text="Customize which stats appear in the sidebar widgets. Click each slot to swap it for a different metric.">
					<button
						onClick={() => setEditing((e) => !e)}
						title={editing ? "Done" : "Customize widgets"}
						className={`p-1 rounded-md transition-colors cursor-pointer ${editing ? "text-blue bg-blue/10" : "text-foreground-sec hover:text-foreground hover:bg-secondary/50"}`}
					>
						<IconLayoutGrid size={13} />
					</button>
				</HelpTooltip>
			</div>
			<div className="grid grid-cols-2 gap-2">
				{widgets.map((id, i) => (
					<WidgetSlot
						key={i}
						id={id}
						stats={stats}
						power={power}
						netSpeed={netSpeed}
						editing={editing}
						onChange={(newId) => updateWidget(i, newId)}
					/>
				))}
			</div>
		</div>
	);
}
