"use client";

import React, { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ButtonState {
	button: number;
	enabled: boolean;
	uptime_s: number;
}

interface SmartButton {
	device_id: string;
	ip: string;
	name: string;
	buttons: ButtonState[];
	registered_at: string;
	last_seen: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
	const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
	if (diff < 60)  return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
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

	const handleRemove = () => {
		setRemoving(true);
		onRemove(device.device_id);
	};

	return (
		<div style={{
			border: "1px solid var(--color-secondary)",
			borderRadius: 12,
			background: "var(--color-primary)",
			overflow: "hidden",
		}}>
			{/* Header */}
			<div style={{
				padding: "12px 16px",
				borderBottom: "1px solid var(--color-secondary)",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 8,
			}}>
				<div style={{ minWidth: 0 }}>
					<p style={{ fontSize: "11pt", fontWeight: 600, color: "var(--color-foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{device.name}
					</p>
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0, fontFamily: "monospace" }}>
						{device.ip}
					</p>
				</div>
				<button
					onClick={handleRemove}
					disabled={removing}
					title="Remove device"
					style={{
						flexShrink: 0,
						padding: "4px 8px",
						borderRadius: 6,
						border: "1px solid transparent",
						background: "transparent",
						color: "var(--color-foreground-sec)",
						fontSize: "10pt",
						cursor: "pointer",
						transition: "all 120ms",
					}}
					onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
					onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-foreground-sec)"; }}
				>
					{removing ? "…" : "✕"}
				</button>
			</div>

			{/* Buttons */}
			<div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
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
						<span style={{ fontSize: "10pt", color: "var(--color-foreground)", fontWeight: 500 }}>
							Button {btn.button}
						</span>
						<button
							onClick={() => handleToggle(btn)}
							disabled={pending !== null}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 12px",
								borderRadius: 7,
								border: `1px solid ${btn.enabled ? "color-mix(in srgb, var(--color-blue) 40%, transparent)" : "var(--color-secondary)"}`,
								background: btn.enabled
									? "color-mix(in srgb, var(--color-blue) 12%, transparent)"
									: "color-mix(in srgb, var(--color-secondary) 40%, transparent)",
								color: btn.enabled ? "var(--color-blue)" : "var(--color-foreground-sec)",
								fontWeight: 600,
								fontSize: "9.5pt",
								cursor: pending !== null ? "default" : "pointer",
								opacity: pending === btn.button ? 0.6 : 1,
								transition: "all 120ms",
							}}
						>
							<span style={{
								width: 7, height: 7,
								borderRadius: "50%",
								background: btn.enabled ? "var(--color-blue)" : "var(--color-foreground-sec)",
								flexShrink: 0,
								transition: "background 120ms",
							}} />
							{pending === btn.button ? "…" : btn.enabled ? "ON" : "OFF"}
						</button>
					</div>
				))}
			</div>

			{/* Footer */}
			<div style={{
				padding: "8px 16px",
				borderTop: "1px solid color-mix(in srgb, var(--color-secondary) 50%, transparent)",
				display: "flex",
				justifyContent: "space-between",
			}}>
				<span style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)" }}>
					seen {fmtRelative(device.last_seen)}
				</span>
				<span style={{ fontSize: "8.5pt", color: "var(--color-foreground-sec)" }}>
					added {fmtRelative(device.registered_at)}
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
		const data = await r.json();

		if (!r.ok) {
			setStatus(data.error ?? "Unknown error");
			setLoading(false);
			return;
		}

		setStatus("Registered. Waiting for handshake...");
		// Give the ESP32 a moment to fire the callback POST back to dellserv
		await new Promise(res => setTimeout(res, 1500));
		setLoading(false);
		onAdded();
		onClose();
	};

	return (
		<div style={{
			position: "fixed", inset: 0, zIndex: 1000,
			background: "rgba(0,0,0,0.6)",
			display: "flex", alignItems: "center", justifyContent: "center",
			padding: 16,
		}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
			<div style={{
				background: "var(--color-primary)",
				border: "1px solid var(--color-secondary)",
				borderRadius: 14,
				padding: "24px",
				width: "100%",
				maxWidth: 380,
			}}>
				<p style={{ fontSize: "13pt", fontWeight: 700, color: "var(--color-foreground)", margin: "0 0 6px" }}>
					Add Smart Button
				</p>
				<p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)", margin: "0 0 20px" }}>
					Enter the IP address of the ESP32 device. Make sure it's connected to the same network as this server.
				</p>
				<label style={{ fontSize: "10pt", color: "var(--color-foreground-sec)", display: "block", marginBottom: 6 }}>
					Device IP address
				</label>
				<input
					type="text"
					value={ip}
					onChange={e => setIp(e.target.value)}
					onKeyDown={e => e.key === "Enter" && handleAdd()}
					placeholder="192.168.1.42"
					disabled={loading}
					autoFocus
					style={{
						width: "100%",
						padding: "8px 12px",
						borderRadius: 8,
						border: "1px solid var(--color-secondary)",
						background: "color-mix(in srgb, var(--color-secondary) 30%, transparent)",
						color: "var(--color-foreground)",
						fontSize: "10pt",
						fontFamily: "monospace",
						outline: "none",
						marginBottom: 16,
					}}
				/>
				{status && (
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: "0 0 14px", fontStyle: "italic" }}>
						{status}
					</p>
				)}
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button
						onClick={onClose}
						disabled={loading}
						style={{
							padding: "7px 16px", borderRadius: 8,
							border: "1px solid var(--color-secondary)",
							background: "transparent", color: "var(--color-foreground-sec)",
							fontSize: "10pt", cursor: "pointer",
						}}
					>
						Cancel
					</button>
					<button
						onClick={handleAdd}
						disabled={loading || !ip.trim()}
						style={{
							padding: "7px 16px", borderRadius: 8,
							border: "1px solid color-mix(in srgb, var(--color-blue) 50%, transparent)",
							background: "color-mix(in srgb, var(--color-blue) 15%, transparent)",
							color: "var(--color-blue)",
							fontSize: "10pt", fontWeight: 600, cursor: loading ? "default" : "pointer",
							opacity: loading || !ip.trim() ? 0.5 : 1,
						}}
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
	const [devices, setDevices] = useState<SmartButton[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showAdd, setShowAdd] = useState(false);

	const load = useCallback(async () => {
		try {
			const r = await fetch("/api/smart-buttons");
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			setDevices(await r.json());
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

	const handleToggle = async (id: string, button: number, enabled: boolean) => {
		await fetch(`/api/smart-buttons/${id}/set`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ button, enabled }),
		});
		await load();
	};

	const handleRemove = async (id: string) => {
		await fetch(`/api/smart-buttons/${id}`, { method: "DELETE" });
		await load();
	};

	return (
		<div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
			{/* Header */}
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
				<div>
					<p style={{ fontSize: "12pt", fontWeight: 700, color: "var(--color-foreground)", margin: 0 }}>
						Smart Buttons
					</p>
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: "2px 0 0" }}>
						{devices.length} device{devices.length !== 1 ? "s" : ""} registered
					</p>
				</div>
				<button
					onClick={() => setShowAdd(true)}
					style={{
						padding: "7px 14px",
						borderRadius: 8,
						border: "1px solid color-mix(in srgb, var(--color-blue) 50%, transparent)",
						background: "color-mix(in srgb, var(--color-blue) 12%, transparent)",
						color: "var(--color-blue)",
						fontSize: "10pt",
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					+ Add Device
				</button>
			</div>

			{/* Content */}
			{loading && (
				<p style={{ fontSize: "9.5pt", color: "var(--color-foreground-sec)" }}>Loading...</p>
			)}
			{error && (
				<p style={{ fontSize: "9.5pt", color: "#ef4444" }}>{error}</p>
			)}
			{!loading && !error && devices.length === 0 && (
				<div style={{
					border: "1px dashed var(--color-secondary)",
					borderRadius: 12,
					padding: "32px 24px",
					textAlign: "center",
				}}>
					<p style={{ fontSize: "10pt", color: "var(--color-foreground-sec)", margin: "0 0 6px" }}>
						No smart buttons registered yet.
					</p>
					<p style={{ fontSize: "9pt", color: "var(--color-foreground-sec)", margin: 0 }}>
						Connect your ESP32 to WiFi, then click &ldquo;Add Device&rdquo; and enter its IP address.
					</p>
				</div>
			)}
			{!loading && !error && devices.length > 0 && (
				<div style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
					gap: 12,
				}}>
					{devices.map(d => (
						<SmartButtonCard
							key={d.device_id}
							device={d}
							onToggle={handleToggle}
							onRemove={handleRemove}
						/>
					))}
				</div>
			)}

			{showAdd && (
				<AddDeviceDialog onClose={() => setShowAdd(false)} onAdded={load} />
			)}
		</div>
	);
}
