"use client";

import { useState } from "react";
import { type PowerData } from "../lib/getPower";
import PowerCard from "./PowerCard";

interface PowerGridProps {
	power: PowerData | null;
	onRefresh: () => void;
	showControls?: boolean;
}

export default function PowerGrid({ power, onRefresh, showControls = true }: PowerGridProps) {
	const [toggling, setToggling] = useState<string | null>(null);

	const handleToggle = async (deviceName: string, on: boolean) => {
		setToggling(deviceName);
		try {
			const action = on ? "on" : "off";
			const res = await fetch(`/api/power/${deviceName}/${action}`, { method: "POST" });
			if (!res.ok) console.error(`Toggle ${deviceName} failed:`, res.status);
			else onRefresh();
		} finally {
			setToggling(null);
		}
	};

	const devices = power?.devices ?? [];

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-11">
			{devices.length > 0 ? (
				devices.map((device, i) => (
					<PowerCard
						key={device.ip}
						device={device}
						label={device.name}
						delay={i * 60}
						toggling={toggling === device.name}
						onToggle={showControls ? (on) => handleToggle(device.name, on) : undefined}
					/>
				))
			) : (
				<>
					<PowerCard device={null} label="" delay={0} />
					<PowerCard device={null} label="" delay={60} />
				</>
			)}
		</div>
	);
}
