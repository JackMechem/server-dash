"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { TapoDevice } from "../../lib/getPower";
import { useSmartButtons } from "../../lib/useSmartButtons";

function Toggle({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
	return (
		<button onClick={onToggle} disabled={pending} role="switch" aria-checked={on} style={{ position: "relative", width: 36, height: 20, borderRadius: 10, border: "none", background: on ? "var(--color-blue)" : "color-mix(in srgb, var(--color-secondary) 120%, transparent)", cursor: pending ? "default" : "pointer", opacity: pending ? 0.5 : 1, transition: "background 150ms", flexShrink: 0, padding: 0 }}>
			<span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
		</button>
	);
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
	return (
		<div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
			<p style={{ fontSize: "10pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>{title}</p>
			<p style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)", margin: 0 }}>{sub}</p>
		</div>
	);
}

export default function DevicesOverviewPanel() {
	const [tapo, setTapo] = useState<TapoDevice[]>([]);
	const { devices: iot } = useSmartButtons();
	const [tapoPending, setTapoPending] = useState<string | null>(null);
	const [iotPending, setIotPending] = useState<string | null>(null); // "deviceId:button"

	const load = useCallback(async () => {
		const r = await fetch("/api/power").then(res => res.json()).catch(() => null);
		if (r) setTapo(r.devices ?? []);
	}, []);

	useEffect(() => {
		load();
		const id = setInterval(load, 5000);
		return () => clearInterval(id);
	}, [load]);

	const handleTapoToggle = async (name: string, on: boolean) => {
		setTapoPending(name);
		await fetch(`/api/power/${encodeURIComponent(name)}/${on ? "on" : "off"}`, { method: "POST" });
		await load();
		setTapoPending(null);
	};

	const handleIotToggle = async (deviceId: string, button: number, enabled: boolean) => {
		setIotPending(`${deviceId}:${button}`);
		await fetch(`/api/smart-buttons/${deviceId}/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ button, enabled }) });
		setIotPending(null);
	};

	const tapoOn = tapo.filter(d => d.on).length;
	const iotTotal = iot.reduce((n, d) => n + d.buttons.length, 0);
	const iotOn = iot.reduce((n, d) => n + d.buttons.filter(b => b.enabled).length, 0);

	return (
		<div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
			{/* Summary row */}
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
				{[
					{ label: "Tapo Devices", value: `${tapoOn} / ${tapo.length}`, sub: "on" },
					{ label: "JMIoT Devices", value: `${iot.length}`, sub: "registered" },
					{ label: "JMIoT Buttons", value: `${iotOn} / ${iotTotal}`, sub: "on" },
					{ label: "Total Power", value: tapo.reduce((s, d) => s + d.current_power_w, 0).toFixed(1) + " W", sub: "combined" },
				].map(c => (
					<div key={c.label} style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, padding: "12px 16px" }}>
						<p style={{ fontSize: "8.5pt", fontWeight: 600, color: "var(--color-foreground-sec)", margin: "0 0 4px" }}>{c.label}</p>
						<p style={{ fontSize: "18pt", fontWeight: 700, color: "var(--color-foreground)", lineHeight: 1, margin: "0 0 2px" }}>{c.value}</p>
						<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: 0 }}>{c.sub}</p>
					</div>
				))}
			</div>

			{/* Tapo section */}
			{tapo.length > 0 && (
				<div>
					<SectionHeader title="Tapo" sub={`${tapoOn} of ${tapo.length} on`} />
					<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, overflow: "hidden" }}>
						{tapo.map((d, i) => (
							<div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < tapo.length - 1 ? "1px solid color-mix(in srgb, var(--color-secondary) 50%, transparent)" : "none", gap: 12 }}>
								<div style={{ minWidth: 0, flex: 1 }}>
									<p style={{ fontSize: "10pt", fontWeight: 600, color: "var(--color-foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.alias || d.name}</p>
									<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: 0 }}>{d.model} · {d.current_power_w.toFixed(1)} W</p>
								</div>
								<Toggle on={d.on} pending={tapoPending === d.name} onToggle={() => handleTapoToggle(d.name, !d.on)} />
							</div>
						))}
					</div>
				</div>
			)}

			{/* JMIoT section */}
			{iot.length > 0 && (
				<div>
					<SectionHeader title="JMIoT" sub={`${iotOn} of ${iotTotal} buttons on`} />
					<div style={{ border: "1px solid var(--color-secondary)", borderRadius: 12, overflow: "hidden" }}>
						{iot.map((dev, di) => (
							<div key={dev.device_id}>
								{[...dev.buttons].sort((a, b) => a.button - b.button).map((btn, bi) => {
									const isLast = di === iot.length - 1 && bi === dev.buttons.length - 1;
									return (
										<div key={btn.button} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid color-mix(in srgb, var(--color-secondary) 50%, transparent)", gap: 12 }}>
											<div style={{ minWidth: 0, flex: 1 }}>
												<p style={{ fontSize: "10pt", fontWeight: 600, color: "var(--color-foreground)", margin: 0 }}>{dev.name} — Button {btn.button}</p>
												<p style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", margin: 0 }}>{dev.ip}</p>
											</div>
											<Toggle
												on={btn.enabled}
												pending={iotPending === `${dev.device_id}:${btn.button}`}
												onToggle={() => handleIotToggle(dev.device_id, btn.button, !btn.enabled)}
											/>
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>
			)}

			{tapo.length === 0 && iot.length === 0 && (
				<p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)" }}>No devices found.</p>
			)}
		</div>
	);
}
