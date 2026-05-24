"use client";

import { useStats } from "../../lib/DataProvider";
import ServicesCard from "../ServicesCard";

export default function ServicesPanel({ isAuthed }: { isAuthed: boolean }) {
	const { stats } = useStats();

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
