"use client";

import { useState, useEffect } from "react";
import HelpTooltip from "./HelpTooltip";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusDot } from "@/components/ui/status-dot";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";

const SERVICES = [
	"syncthing",
	"server-dash",
	"caddy",
	"sshd",
	"cloudflare-dyndns.timer",
	"cloudflare-dyndns",
	"docker",
	"server-dash-api",
];

type Toast = { message: string; ok: boolean } | null;
type ServiceStatuses = Record<string, string>;

export default function ControlPanel({ onClose }: { onClose: () => void }) {
	const [loading, setLoading] = useState<Record<string, string>>({});
	const [toast, setToast] = useState<Toast>(null);
	const [statuses, setStatuses] = useState<ServiceStatuses>({});

	useEffect(() => {
		async function fetchStatuses() {
			try {
				const res = await fetch("/api/stats");
				if (!res.ok) return;
				const data = await res.json();
				setStatuses(data.services ?? {});
			} catch {}
		}
		fetchStatuses();
	}, []);

	function showToast(message: string, ok: boolean) {
		setToast({ message, ok });
		setTimeout(() => setToast(null), 3000);
	}

	async function handleService(action: string, service: string) {
		setLoading((l) => ({ ...l, [`${service}-${action}`]: action }));
		const res = await fetch(`/api/services/${service}/${action}`, { method: "POST" });
		showToast(
			res.ok ? `${service} ${action}ed` : `Failed to ${action} ${service}`,
			res.ok,
		);
		if (res.ok) {
			setTimeout(async () => {
				const r = await fetch("/api/stats");
				if (r.ok) {
					const data = await r.json();
					setStatuses(data.services ?? {});
				}
			}, 1500);
		}
		setLoading((l) => {
			const n = { ...l };
			delete n[`${service}-${action}`];
			return n;
		});
	}

	async function handleLogs(service: string) {
		const res = await fetch(`/api/services/${service}/logs`);
		if (!res.ok) { showToast("Failed to fetch logs", false); return; }
		const data = await res.json();
		console.log(`Logs for ${service}:`, data.stdout);
		showToast(`Logs fetched for ${service} — check console`, true);
	}

	async function handleReboot() {
		if (!confirm("Reboot the server? This will disconnect all sessions.")) return;
		const res = await fetch("/api/system/reboot", { method: "POST" });
		showToast(res.ok ? "Rebooting..." : "Reboot failed", res.ok);
	}

	async function handleShutdown() {
		if (!confirm("Shut down the server? You will need physical access to turn it back on.")) return;
		const res = await fetch("/api/system/shutdown", { method: "POST" });
		showToast(res.ok ? "Shutting down..." : "Shutdown failed", res.ok);
	}

	const isLoading = (service: string, action: string) =>
		loading[`${service}-${action}`] !== undefined;

	const isActive   = (svc: string) => statuses[svc] === "active";
	const isInactive = (svc: string) =>
		statuses[svc] === "inactive" || statuses[svc] === "failed" || statuses[svc] === "dead";

	const dotStatus = (svc: string): "online" | "offline" | "warning" => {
		const s = statuses[svc];
		if (s === "active") return "online";
		if (s === "failed") return "warning";
		return "offline";
	};

	return (
		<>
			{/* Backdrop */}
			<div onClick={onClose} className="fixed inset-0 bg-black/40 z-40" />

			{/* Panel */}
			<div className="fixed top-0 right-0 bottom-0 md:w-[480px] w-full bg-background border-l border-border z-50 overflow-y-auto p-8">
				{/* Header */}
				<div className="flex items-start justify-between mb-8">
					<div>
						<p className="text-[11px] font-semibold text-primary mb-2">Control panel</p>
						<h2 className="text-[22px] font-normal text-foreground tracking-tight">
							Manage services
						</h2>
					</div>
					<HelpTooltip text="Close this control panel.">
						<Button variant="outline" size="sm" onClick={onClose}>Close</Button>
					</HelpTooltip>
				</div>

				{/* Services */}
				<div className="mb-6">
					<SectionLabel divider className="mb-3">Services</SectionLabel>
					<div className="flex flex-col gap-2">
						{SERVICES.map((svc) => (
							<div
								key={svc}
								className="bg-muted/30 border border-border rounded-xl px-4 py-3 flex md:flex-row flex-col items-center justify-between gap-3"
							>
								<div className="flex items-center gap-2.5 flex-1 min-w-0">
									<StatusDot status={dotStatus(svc)} size="md" />
									<p className="text-sm text-foreground truncate">{svc}</p>
								</div>
								<div className="flex gap-1.5 shrink-0">
									<HelpTooltip text={`Start the ${svc} service.`}>
										<Button
											size="xs"
											variant="success"
											onClick={() => !isLoading(svc, "start") && handleService("start", svc)}
											disabled={isLoading(svc, "start") || !isInactive(svc)}
										>
											{isLoading(svc, "start") ? <Spinner size="xs" /> : null}
											Start
										</Button>
									</HelpTooltip>
									<HelpTooltip text={`Stop the ${svc} service.`}>
										<Button
											size="xs"
											variant="destructive"
											onClick={() => !isLoading(svc, "stop") && handleService("stop", svc)}
											disabled={isLoading(svc, "stop") || !isActive(svc)}
										>
											{isLoading(svc, "stop") ? <Spinner size="xs" /> : null}
											Stop
										</Button>
									</HelpTooltip>
									<HelpTooltip text={`Restart the ${svc} service.`}>
										<Button
											size="xs"
											variant="outline"
											onClick={() => !isLoading(svc, "restart") && handleService("restart", svc)}
											disabled={isLoading(svc, "restart") || !isActive(svc)}
										>
											{isLoading(svc, "restart") ? <Spinner size="xs" /> : null}
											Restart
										</Button>
									</HelpTooltip>
									<HelpTooltip text={`Fetch and display recent logs for the ${svc} service.`}>
										<Button
											size="xs"
											variant="secondary"
											onClick={() => handleLogs(svc)}
										>
											Logs
										</Button>
									</HelpTooltip>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* System */}
				<div>
					<SectionLabel divider className="mb-3">System</SectionLabel>
					<div className="flex flex-col gap-2">
						<div className="bg-muted/30 border border-border rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
							<div>
								<p className="text-sm text-foreground mb-0.5">Reboot server</p>
								<p className="text-xs text-muted-foreground">Immediately restarts the machine</p>
							</div>
							<HelpTooltip text="Immediately restart the server. All services will briefly go offline.">
								<Button variant="destructive" size="sm" onClick={handleReboot}>Reboot</Button>
							</HelpTooltip>
						</div>
						<div className="bg-muted/30 border border-border rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
							<div>
								<p className="text-sm text-foreground mb-0.5">Shut down server</p>
								<p className="text-xs text-muted-foreground">Powers off the machine</p>
							</div>
							<HelpTooltip text="Power off the server completely. You will need physical access to turn it back on.">
								<Button variant="destructive" size="sm" onClick={handleShutdown}>Shut down</Button>
							</HelpTooltip>
						</div>
					</div>
				</div>

				{/* Toast */}
				{toast && (
					<Alert variant={toast.ok ? "success" : "destructive"} className="mt-6">
						<AlertDescription>{toast.message}</AlertDescription>
					</Alert>
				)}
			</div>
		</>
	);
}
