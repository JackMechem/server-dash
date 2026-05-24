"use client";

import { usePower } from "../../lib/DataProvider";
import PowerGrid from "../PowerGrid";

export default function PowerPanel({ isAuthed }: { isAuthed: boolean }) {
	const { power } = usePower();
	return (
		<div className="p-4">
			<PowerGrid power={power} onRefresh={() => {}} showControls={isAuthed} />
		</div>
	);
}
