"use client";

import { useState, useEffect, useCallback } from "react";
import { getPower, type PowerData } from "../../lib/getPower";
import PowerGrid from "../PowerGrid";

export default function PowerPanel({ isAuthed }: { isAuthed: boolean }) {
	const [power, setPower] = useState<PowerData | null>(null);

	const fetchPower = useCallback(async () => {
		try { setPower(await getPower()); } catch {}
	}, []);

	useEffect(() => {
		fetchPower();
		const id = setInterval(fetchPower, 3000);
		return () => clearInterval(id);
	}, [fetchPower]);

	return (
		<div className="p-4">
			<PowerGrid power={power} onRefresh={fetchPower} showControls={isAuthed} />
		</div>
	);
}
