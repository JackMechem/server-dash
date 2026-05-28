"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { TapoDevice } from "../../lib/getPower";

function Toggle({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
	return (
		<button
			onClick={onToggle}
			disabled={pending}
			role="switch"
			aria-checked={on}
			style={{
				position: "relative",
				width: 40,
				height: 22,
				borderRadius: 11,
				border: "none",
				background: on ? "var(--color-blue)" : "color-mix(in srgb, var(--color-secondary) 120%, transparent)",
				cursor: pending ? "default" : "pointer",
				opacity: pending ? 0.5 : 1,
				transition: "background 150ms",
				flexShrink: 0,
				padding: 0,
			}}
		>
			<span style={{
				position: "absolute",
				top: 3,
				left: on ? 21 : 3,
				width: 16,
				height: 16,
				borderRadius: "50%",
				background: "#fff",
				transition: "left 150ms",
				boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
			}} />
		</button>
	);
}

function TapoCard({ device, onToggle }: { device: TapoDevice; onToggle: (name: string, on: boolean) => Promise<void> }) {
	const [pending, setPending] = useState(false);

	const handleToggle = async () => {
		if (pending) return;
		setPending(true);
		await onToggle(device.name, !device.on);
		setPending(false);
	};

	return (
		<div style={{
			border: `1px solid ${device.on ? "color-mix(in srgb, var(--color-blue) 35%, transparent)" : "var(--color-secondary)"}`,
			borderRadius: 14,
			background: "var(--color-primary)",
			overflow: "hidden",
			transition: "border-color 200ms",
		}}>
			<div style={{ padding: "14px 16px 12px", borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
				<div style={{ minWidth: 0, flex: 1 }}>
					<p style={{ fontSize: "11.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{device.alias || device.name}
					</p>
					<p style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)", margin: 0, opacity: 0.7 }}>
						{device.model} · {device.ip}
					</p>
				</div>
				<Toggle on={device.on} pending={pending} onToggle={handleToggle} />
			</div>

			<div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
				<div>
					<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: "0 0 2px", fontWeight: 600 }}>Power</p>
					<p style={{ fontSize: "10.5pt", fontWeight: 700, color: device.on ? "var(--color-blue)" : "var(--color-foreground-sec)", margin: 0 }}>
						{device.current_power_w.toFixed(1)} W
					</p>
				</div>
				<div>
					<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: "0 0 2px", fontWeight: 600 }}>Today</p>
					<p style={{ fontSize: "10.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>
						{device.today_energy_wh >= 1000
							? `${(device.today_energy_wh / 1000).toFixed(2)} kWh`
							: `${device.today_energy_wh} Wh`}
					</p>
				</div>
				<div>
					<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: "0 0 2px", fontWeight: 600 }}>Runtime today</p>
					<p style={{ fontSize: "10.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>
						{device.today_runtime_min >= 60
							? `${Math.floor(device.today_runtime_min / 60)}h ${device.today_runtime_min % 60}m`
							: `${device.today_runtime_min}m`}
					</p>
				</div>
				<div>
					<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: "0 0 2px", fontWeight: 600 }}>This month</p>
					<p style={{ fontSize: "10.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>
						{device.month_energy_wh >= 1000
							? `${(device.month_energy_wh / 1000).toFixed(2)} kWh`
							: `${device.month_energy_wh} Wh`}
					</p>
				</div>
			</div>
		</div>
	);
}

export default function TapoPanel() {
	const [devices, setDevices] = useState<TapoDevice[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const r = await fetch("/api/power");
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			const data = await r.json();
			setDevices(data.devices ?? []);
			setError(null);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Failed to load");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
		const id = setInterval(load, 5000);
		return () => clearInterval(id);
	}, [load]);

	const handleToggle = async (name: string, on: boolean) => {
		await fetch(`/api/power/${encodeURIComponent(name)}/${on ? "on" : "off"}`, { method: "POST" });
		await load();
	};

	const onCount = devices.filter(d => d.on).length;

	return (
		<div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
			<div>
				<p style={{ fontSize: "12pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>Tapo Devices</p>
				<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: "2px 0 0" }}>
					{onCount} of {devices.length} on
				</p>
			</div>

			{loading && <p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)" }}>Loading...</p>}
			{error && <p style={{ fontSize: "9.5pt", color: "#ef4444" }}>{error}</p>}
			{!loading && !error && devices.length === 0 && (
				<div style={{ border: "1px dashed var(--color-secondary)", borderRadius: 12, padding: "32px 24px", textAlign: "center" }}>
					<p style={{ fontSize: "10pt", color: "var(--color-foreground-sec)", margin: 0 }}>No Tapo devices found.</p>
				</div>
			)}
			{devices.length > 0 && (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
					{devices.map(d => (
						<TapoCard key={d.name} device={d} onToggle={handleToggle} />
					))}
				</div>
			)}
		</div>
	);
}
