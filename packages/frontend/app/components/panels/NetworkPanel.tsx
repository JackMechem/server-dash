"use client";

import { useStats } from "../../lib/DataProvider";
import NetworkCard from "../NetworkCard";

export default function NetworkPanel() {
	const { iface, netSpeed } = useStats();
	return (
		<div className="p-4">
			<NetworkCard iface={iface} speed={netSpeed} />
		</div>
	);
}
