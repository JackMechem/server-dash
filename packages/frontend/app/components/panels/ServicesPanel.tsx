"use client";

import { useState, useEffect } from "react";
import { getStats, type Stats } from "../../lib/getStats";
import ServicesCard from "../ServicesCard";

export default function ServicesPanel({ isAuthed }: { isAuthed: boolean }) {
	const [stats, setStats] = useState<Stats | null>(null);

	useEffect(() => {
		if (!isAuthed) return;
		const go = async () => {
			try { setStats(await getStats()); } catch {}
		};
		go();
		const id = setInterval(go, 4000);
		return () => clearInterval(id);
	}, [isAuthed]);

	if (!isAuthed) {
		return (
			<div className="p-4 text-sm text-foreground-sec">
				Authentication required to view services.
			</div>
		);
	}

	return (
		<div className="p-4">
			<ServicesCard services={stats?.services ?? null} />
		</div>
	);
}
