"use client";

import { useState, useEffect } from "react";
import { getStats, type Stats } from "../../lib/getStats";
import UptimeCard from "../UptimeCard";

export default function UptimePanel() {
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
		<div className="p-4">
			<UptimeCard uptime={stats?.uptime ?? null} />
		</div>
	);
}
