"use client";

import { useState, useEffect } from "react";

const SERVICES = [
	"syncthing",
	"dashboard",
	"caddy",
	"sshd",
	"cloudflare-dyndns.timer",
	"cloudflare-dyndns",
	"docker",
	"sysapi",
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
		const res = await fetch(`/api/services/${service}/${action}`, {
			method: "POST",
		});
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
		if (!res.ok) {
			showToast("Failed to fetch logs", false);
			return;
		}
		const data = await res.json();
		console.log(`Logs for ${service}:`, data.stdout);
		showToast(`Logs fetched for ${service} — check console`, true);
	}

	async function handleReboot() {
		if (!confirm("Reboot the server? This will disconnect all sessions."))
			return;
		const res = await fetch("/api/system/reboot", { method: "POST" });
		showToast(res.ok ? "Rebooting..." : "Reboot failed", res.ok);
	}

	async function handleShutdown() {
		if (!confirm("Shut down the server? You will need physical access to turn it back on."))
			return;
		const res = await fetch("/api/system/shutdown", { method: "POST" });
		showToast(res.ok ? "Shutting down..." : "Shutdown failed", res.ok);
	}

	const isLoading = (service: string, action: string) =>
		loading[`${service}-${action}`] !== undefined;

	const isActive = (svc: string) => statuses[svc] === "active";
	const isInactive = (svc: string) =>
		statuses[svc] === "inactive" ||
		statuses[svc] === "failed" ||
		statuses[svc] === "dead";

	function statusDot(svc: string) {
		const s = statuses[svc];
		const color =
			s === "active"
				? "bg-green-400"
				: s === "failed"
					? "bg-red-400"
					: "bg-gray-300";
		return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
	}

	function btnClass(svc: string, action: string): string {
		const active = isActive(svc);
		const inactive = isInactive(svc);
		const busy = isLoading(svc, action);
		const base =
			"rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap border transition-colors";

		if (busy) return `${base} border-gray-200 text-gray-300 cursor-not-allowed`;
		if (action === "start" && inactive)
			return `${base} bg-green-50 border-green-200 text-green-700 cursor-pointer`;
		if (action === "stop" && active)
			return `${base} bg-red-50 border-red-200 text-red-500 cursor-pointer`;
		if (action === "restart" && active)
			return `${base} bg-blue-50 border-blue-200 text-blue-500 cursor-pointer`;
		return `${base} border-gray-200 text-gray-300 cursor-default`;
	}

	return (
		<>
			{/* Backdrop */}
			<div onClick={onClose} className="fixed inset-0 bg-black/15 z-40" />

			{/* Panel */}
			<div className="fixed top-0 right-0 bottom-0 md:w-[480px] w-full bg-white border-l border-gray-100 z-50 overflow-y-auto p-8">
				{/* Header */}
				<div className="flex items-start justify-between mb-8">
					<div>
						<p className="text-[13px] text-blue-500 mb-1.5">Control panel</p>
						<h2 className="text-[22px] font-normal text-gray-900 tracking-tight m-0">
							Manage services
						</h2>
					</div>
					<button
						onClick={onClose}
						className="border border-gray-200 rounded-lg px-3.5 py-1.5 text-[13px] text-gray-400 cursor-pointer hover:bg-gray-50 transition-colors"
					>
						Close
					</button>
				</div>

				{/* Services */}
				<div className="border-t border-gray-100 pt-6 mb-6">
					<p className="text-[13px] text-gray-300 mb-3">Services</p>
					<div className="flex flex-col gap-2">
						{SERVICES.map((svc) => (
							<div
								key={svc}
								className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex md:flex-row flex-col items-center justify-between gap-3"
							>
								<div className="flex items-center gap-2.5 flex-1 min-w-0">
									{statusDot(svc)}
									<p className="text-[14px] text-gray-900 m-0 truncate">
										{svc}
									</p>
								</div>
								<div className="flex gap-1.5 shrink-0">
									{["start", "stop", "restart"].map((action) => (
										<button
											key={action}
											onClick={() =>
												!isLoading(svc, action) && handleService(action, svc)
											}
											disabled={isLoading(svc, action)}
											className={btnClass(svc, action)}
										>
											{isLoading(svc, action)
												? "..."
												: action.charAt(0).toUpperCase() + action.slice(1)}
										</button>
									))}
									<button
										onClick={() => handleLogs(svc)}
										className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap border border-blue-100 text-blue-400 cursor-pointer hover:bg-blue-50 transition-colors"
									>
										Logs
									</button>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* System */}
				<div className="border-t border-gray-100 pt-6">
					<p className="text-[13px] text-gray-300 mb-3">System</p>
					<div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 flex items-center justify-between">
						<div>
							<p className="text-[14px] text-gray-900 m-0 mb-0.5">
								Reboot server
							</p>
							<p className="text-[12px] text-gray-400 m-0">
								Immediately restarts the machine
							</p>
						</div>
						<button
							onClick={handleReboot}
							className="border border-red-200 rounded-lg px-3.5 py-1.5 text-[13px] text-red-400 cursor-pointer hover:bg-red-50 transition-colors whitespace-nowrap"
						>
							Reboot
						</button>
					</div>
				</div>
				<div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 flex items-center justify-between mt-2">
					<div>
						<p className="text-[14px] text-gray-900 m-0 mb-0.5">
							Shut down server
						</p>
						<p className="text-[12px] text-gray-400 m-0">
							Powers off the machine
						</p>
					</div>
					<button
						onClick={handleShutdown}
						className="border border-red-200 rounded-lg px-3.5 py-1.5 text-[13px] text-red-400 cursor-pointer hover:bg-red-50 transition-colors whitespace-nowrap"
					>
						Shut down
					</button>
				</div>

				{/* Toast */}
				{toast && (
					<div
						className={`mt-6 px-4 py-3 rounded-lg text-[13px] border ${
							toast.ok
								? "bg-green-50 text-green-700 border-green-200"
								: "bg-red-50 text-red-500 border-red-200"
						}`}
					>
						{toast.message}
					</div>
				)}
			</div>
		</>
	);
}
