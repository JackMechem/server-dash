"use client";

import { useState, useEffect, useRef } from "react";
import { getStats, type Stats, type NetworkInterface } from "../../lib/getStats";
import StatsGrid from "../StatsGrid";

export default function OverviewPanel() {
	const [stats, setStats] = useState<Stats | null>(null);

	useEffect(() => {
		const go = async () => {
			try { setStats(await getStats()); } catch {}
		};
		go();
		const id = setInterval(go, 4000);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="p-4 pb-2">
			<StatsGrid stats={stats} />
		</div>
	);
}
