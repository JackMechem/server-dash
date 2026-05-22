"use client";

import { type TapoDevice } from "../lib/getPower";
import HelpTooltip from "./HelpTooltip";

interface PowerCardProps {
	device: TapoDevice | null;
	label: string;
	delay?: number;
	toggling?: boolean;
	onToggle?: (on: boolean) => void;
}

function powerColor(watts: number): string {
	if (watts > 400) return "#ef4444";
	if (watts > 200) return "#f59e0b";
	return "#428ce2";
}

export default function PowerCard({ device, label, delay = 0, toggling = false, onToggle }: PowerCardProps) {
	const pct = device ? Math.min(100, (device.current_power_w / 500) * 100) : 0;
	const runtimeHours = device ? Math.floor(device.today_runtime_min / 60) : 0;
	const runtimeMins = device ? device.today_runtime_min % 60 : 0;

	return (
		<div
			className="bg-primary border border-secondary rounded-2xl p-5 flex flex-col hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
			style={{ animationDelay: `${delay}ms` }}
		>
			<div className="flex items-center justify-between mb-3">
				<span className="text-xs font-medium text-foreground-sec">
					{label}
				</span>
				{device ? (
					<div className="flex items-center gap-2">
						<span
							className={`flex items-center gap-1.5 text-[0.7rem] font-medium ${
								device.on ? "text-green" : "text-foreground-sec"
							}`}
						>
							<span
								className={`w-1.5 h-1.5 rounded-full ${
									device.on ? "bg-green" : "bg-foreground-sec/40"
								}`}
							/>
							{device.on ? "On" : "Off"}
						</span>
						{onToggle && (
							<HelpTooltip text="Remotely turn this smart plug on or off.">
								<button
									onClick={() => onToggle(!device.on)}
									disabled={toggling}
									className={`text-[0.7rem] font-medium px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
										device.on
											? "border-red-500/20 text-red-400 hover:bg-red-500/10"
											: "border-green/20 text-green hover:bg-green/10"
									}`}
								>
									{toggling ? "···" : device.on ? "Turn off" : "Turn on"}
								</button>
							</HelpTooltip>
						)}
					</div>
				) : null}
			</div>

			{device ? (
				<>
					<div className="flex items-baseline gap-1.5 mt-0.5">
						<span className="text-3xl font-medium tracking-tight text-foreground leading-none">
							{device.current_power_w.toFixed(1)}
						</span>
						<span className="text-base text-foreground-sec font-medium">W</span>
					</div>
					<span className="text-[0.7rem] text-foreground-sec mt-1 truncate">
						{device.model} · {device.ip}
					</span>

					<div className="h-[3px] bg-secondary rounded-full mt-4 overflow-hidden">
						<div
							className="h-full rounded-full transition-all duration-700"
							style={{
								width: `${pct}%`,
								background: powerColor(device.current_power_w),
							}}
						/>
					</div>

					<div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-secondary">
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium text-foreground">
								{(device.today_energy_wh / 1000).toFixed(3)}
								<span className="text-foreground-sec text-xs ml-0.5">kWh</span>
							</span>
							<span className="text-[0.7rem] text-foreground-sec">
								Today
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium text-foreground">
								{(device.month_energy_wh / 1000).toFixed(2)}
								<span className="text-foreground-sec text-xs ml-0.5">kWh</span>
							</span>
							<span className="text-[0.7rem] text-foreground-sec">
								Month
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-sm font-medium text-foreground">
								{runtimeHours}h {runtimeMins}m
							</span>
							<span className="text-[0.7rem] text-foreground-sec">
								Runtime
							</span>
						</div>
					</div>
				</>
			) : (
				<div className="skeleton h-24 mt-2" />
			)}
		</div>
	);
}
