"use client";

import { useStats } from "../../lib/DataProvider";
import UptimeCard from "../UptimeCard";

export default function UptimePanel() {
	const { stats } = useStats();
	return (
		<div className="p-4">
			<UptimeCard uptime={stats?.uptime ?? null} />
		</div>
	);
}
