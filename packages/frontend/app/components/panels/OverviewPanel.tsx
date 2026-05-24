"use client";

import { useStats } from "../../lib/DataProvider";
import StatsGrid from "../StatsGrid";

export default function OverviewPanel() {
	const { stats } = useStats();
	return (
		<div className="p-4 pb-2">
			<StatsGrid stats={stats} />
		</div>
	);
}
