"use client";

import React, { useState, useEffect } from "react";
import { useSmartButtons, type SmartButton, type ButtonState } from "../../lib/useSmartButtons";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
	const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, pending, onToggle }: { on: boolean; pending: boolean; onToggle: () => void }) {
	return (
		<button
			onClick={onToggle}
			disabled={pending}
			aria-checked={on}
			role="switch"
			style={{
				position: "relative",
				width: 40,
				height: 22,
				borderRadius: 11,
				border: "none",
				background: on
					? "var(--color-blue)"
					: "color-mix(in srgb, var(--color-secondary) 120%, transparent)",
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

// ── SmartButtonCard ───────────────────────────────────────────────────────────

function SmartButtonCard({
	device,
	onToggle,
	onRemove,
}: {
	device: SmartButton;
	onToggle: (id: string, button: number, enabled: boolean) => Promise<void>;
	onRemove: (id: string) => void;
}) {
	const [pending, setPending] = useState<number | null>(null);
	const [removing, setRemoving] = useState(false);

	const handleToggle = async (btn: ButtonState) => {
		if (pending !== null) return;
		setPending(btn.button);
		await onToggle(device.device_id, btn.button, !btn.enabled);
		setPending(null);
	};

	const anyOn = device.buttons.some(b => b.enabled);

	return (
		<div style={{
			border: `1px solid ${anyOn ? "color-mix(in srgb, var(--color-blue) 35%, transparent)" : "var(--color-secondary)"}`,
			borderRadius: 14,
			background: "var(--color-primary)",
			overflow: "hidden",
			transition: "border-color 200ms",
		}}>
			{/* Header */}
			<div style={{
				padding: "14px 16px 12px",
				borderBottom: "1px solid color-mix(in srgb, var(--color-secondary) 60%, transparent)",
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "space-between",
				gap: 8,
			}}>
				<div style={{ minWidth: 0, flex: 1 }}>
					<p style={{ fontSize: "11.5pt", fontWeight: 700, color: "var(--color-foreground)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{device.name}
					</p>
					<p style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)", margin: 0, fontFamily: "monospace", opacity: 0.8 }}>
						{device.ip}
					</p>
				</div>
				<button
					onClick={() => { setRemoving(true); onRemove(device.device_id); }}
					disabled={removing}
					title="Remove device"
					style={{
						flexShrink: 0,
						width: 24,
						height: 24,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 6,
						border: "1px solid transparent",
						background: "transparent",
						color: "var(--color-foreground-sec)",
						fontSize: "11pt",
						cursor: "pointer",
						opacity: 0.5,
						transition: "all 120ms",
					}}
					onMouseEnter={e => { const b = e.currentTarget; b.style.opacity = "1"; b.style.color = "#ef4444"; b.style.borderColor = "color-mix(in srgb, #ef4444 40%, transparent)"; b.style.background = "color-mix(in srgb, #ef4444 10%, transparent)"; }}
					onMouseLeave={e => { const b = e.currentTarget; b.style.opacity = "0.5"; b.style.color = "var(--color-foreground-sec)"; b.style.borderColor = "transparent"; b.style.background = "transparent"; }}
				>
					{removing ? "…" : "✕"}
				</button>
			</div>

			{/* Buttons */}
			<div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
				{device.buttons.length === 0 && (
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>No button data yet.</p>
				)}
				{[...device.buttons].sort((a, b) => a.button - b.button).map(btn => (
					<div key={btn.button} style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
					}}>
						<div>
							<p style={{ fontSize: "9.5pt", fontWeight: 600, color: "var(--color-foreground)", margin: 0 }}>
								Button {btn.button}
							</p>
							<p style={{ fontSize: "8pt", color: btn.enabled ? "var(--color-blue)" : "var(--color-foreground-sec)", margin: 0, marginTop: 1, transition: "color 150ms" }}>
								{btn.enabled ? "On" : "Off"}
							</p>
						</div>
						<Toggle
							on={btn.enabled}
							pending={pending === btn.button}
							onToggle={() => handleToggle(btn)}
						/>
					</div>
				))}
			</div>

			{/* Footer */}
			<div style={{
				padding: "8px 16px",
				borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 40%, transparent)",
				display: "flex",
				justifyContent: "space-between",
			}}>
				<span style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", opacity: 0.6 }}>
					seen {fmtRelative(device.last_seen)}
				</span>
				<span style={{ fontSize: "8pt", color: "var(--color-foreground-sec)", opacity: 0.6 }}>
					{device.device_id}
				</span>
			</div>
		</div>
	);
}

// ── Add device dialog ─────────────────────────────────────────────────────────

function AddDeviceDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
	const [ip, setIp] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleAdd = async () => {
		const trimmed = ip.trim();
		if (!trimmed) return;
		setLoading(true);
		setStatus("Connecting to device...");

		const r = await fetch("/api/smart-buttons/add", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ip: trimmed }),
		});

		if (!r.ok) {
			let msg = "Unknown error";
			try { const d = await r.json(); msg = d.error ?? msg; } catch { msg = await r.text().catch(() => msg); }
			setStatus(msg);
			setLoading(false);
			return;
		}

		setStatus("Registered. Waiting for handshake...");
		await new Promise(res => setTimeout(res, 1500));
		setLoading(false);
		onAdded();
		onClose();
	};

	return (
		<div
			style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
			onClick={e => { if (e.target === e.currentTarget) onClose(); }}
		>
			<div style={{ background: "var(--color-primary)", border: "1px solid var(--color-secondary)", borderRadius: 14, padding: "24px", width: "100%", maxWidth: 380 }}>
				<p style={{ fontSize: "13pt", fontWeight: 700, color: "var(--color-foreground)", margin: "0 0 6px" }}>Add JMIoT Device</p>
				<p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)", margin: "0 0 20px" }}>
					Enter the IP address of the ESP32. Make sure it&apos;s on the same network as this server.
				</p>
				<label style={{ fontSize: "10pt", color: "var(--color-foreground-sec)", display: "block", marginBottom: 6 }}>Device IP address</label>
				<input
					type="text"
					value={ip}
					onChange={e => setIp(e.target.value)}
					onKeyDown={e => e.key === "Enter" && handleAdd()}
					placeholder="192.168.1.42"
					disabled={loading}
					autoFocus
					style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-secondary)", background: "color-mix(in srgb, var(--color-secondary) 30%, transparent)", color: "var(--color-foreground)", fontSize: "10pt", fontFamily: "monospace", outline: "none", marginBottom: 16 }}
				/>
				{status && <p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: "0 0 14px", fontStyle: "italic" }}>{status}</p>}
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button onClick={onClose} disabled={loading} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid var(--color-secondary)", background: "transparent", color: "var(--color-foreground-sec)", fontSize: "10pt", cursor: "pointer" }}>
						Cancel
					</button>
					<button
						onClick={handleAdd}
						disabled={loading || !ip.trim()}
						style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--color-blue) 50%, transparent)", background: "color-mix(in srgb, var(--color-blue) 15%, transparent)", color: "var(--color-blue)", fontSize: "10pt", fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading || !ip.trim() ? 0.5 : 1 }}
					>
						{loading ? "Connecting..." : "Add Device"}
					</button>
				</div>
			</div>
		</div>
	);
}

// ── SmartButtonsPanel ─────────────────────────────────────────────────────────

export default function SmartButtonsPanel() {
	const { devices, reload } = useSmartButtons();
	const [loading, setLoading] = useState(true);
	const [showAdd, setShowAdd] = useState(false);

	useEffect(() => { if (devices.length >= 0) setLoading(false); }, [devices]);

	const handleToggle = async (id: string, button: number, enabled: boolean) => {
		await fetch(`/api/smart-buttons/${id}/set`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ button, enabled }),
		});
	};

	const handleRemove = async (id: string) => {
		await fetch(`/api/smart-buttons/${id}`, { method: "DELETE" });
	};

	return (
		<div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<div>
					<p style={{ fontSize: "12pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>JMIoT Devices</p>
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: "2px 0 0" }}>
						{devices.length} device{devices.length !== 1 ? "s" : ""} registered
					</p>
				</div>
				<button
					onClick={() => setShowAdd(true)}
					style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--color-blue) 50%, transparent)", background: "color-mix(in srgb, var(--color-blue) 12%, transparent)", color: "var(--color-blue)", fontSize: "10pt", fontWeight: 600, cursor: "pointer" }}
				>
					+ Add Device
				</button>
			</div>

			{loading && <p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)" }}>Loading...</p>}
			{!loading && devices.length === 0 && (
				<div style={{ border: "1px dashed var(--color-secondary)", borderRadius: 12, padding: "32px 24px", textAlign: "center" }}>
					<p style={{ fontSize: "10pt", color: "var(--color-foreground-sec)", margin: "0 0 6px" }}>No JMIoT devices registered yet.</p>
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>Connect your ESP32 to WiFi, then click &ldquo;Add Device&rdquo;.</p>
				</div>
			)}
			{!loading && devices.length > 0 && (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
					{devices.map(d => (
						<SmartButtonCard key={d.device_id} device={d} onToggle={handleToggle} onRemove={handleRemove} />
					))}
				</div>
			)}

			{showAdd && <AddDeviceDialog onClose={() => setShowAdd(false)} onAdded={reload} />}
		</div>
	);
}
