"use client";

import { useState, useEffect, useRef } from "react";
import { getStats, type Stats, type NetworkInterface } from "../../lib/getStats";
import NetworkCard from "../NetworkCard";

export default function NetworkPanel() {
	const [iface, setIface] = useState<string | null>(null);
	const [speed, setSpeed] = useState<{ rx: number; tx: number } | null>(null);
	const prevRef = useRef<Record<string, NetworkInterface> | null>(null);
	const lastRef = useRef<number>(0);

	useEffect(() => {
		const go = async () => {
			try {
				const now = Date.now();
				const data = await getStats();
				const primary = Object.keys(data.network).find(
					(k) => !k.startsWith("docker") && !k.startsWith("br-") && data.network[k].rx > 0,
				);
				setIface(primary ?? null);
				if (primary && prevRef.current?.[primary] && lastRef.current > 0) {
					const elapsed = (now - lastRef.current) / 1000;
					const prev = prevRef.current[primary];
					setSpeed({
						rx: Math.max(0, (data.network[primary].rx - prev.rx) / elapsed),
						tx: Math.max(0, (data.network[primary].tx - prev.tx) / elapsed),
					});
				}
				prevRef.current = data.network;
				lastRef.current = now;
			} catch {}
		};
		go();
		const id = setInterval(go, 4000);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="p-4">
			<NetworkCard iface={iface} speed={speed} />
		</div>
	);
}
