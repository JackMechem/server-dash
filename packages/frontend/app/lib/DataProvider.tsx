"use client";

import {
	createContext,
	useContext,
	useState,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import type { Stats } from "./getStats";
import type { PowerData } from "./getPower";

interface NetSpeed { rx: number; tx: number; }

interface StatsCtx {
	stats: Stats | null;
	netSpeed: NetSpeed | null;
	iface: string | null;
}

interface PowerCtx {
	power: PowerData | null;
}

const StatsContext = createContext<StatsCtx>({ stats: null, netSpeed: null, iface: null });
const PowerContext = createContext<PowerCtx>({ power: null });

export function useStats() { return useContext(StatsContext); }
export function usePower() { return useContext(PowerContext); }

export function DataProvider({ children }: { children: ReactNode }) {
	const [stats, setStats] = useState<Stats | null>(null);
	const [netSpeed, setNetSpeed] = useState<NetSpeed | null>(null);
	const [iface, setIface] = useState<string | null>(null);
	const prevNetRef = useRef<Record<string, { rx: number; tx: number }> | null>(null);
	const lastFetchRef = useRef<number>(0);

	const [power, setPower] = useState<PowerData | null>(null);

	useEffect(() => {
		const fetchStats = async () => {
			try {
				const now = Date.now();
				const res = await fetch("/api/stats");
				if (!res.ok) return;
				const data: Stats = await res.json();

				const primary = Object.keys(data.network).find(
					(k) => !k.startsWith("docker") && !k.startsWith("br-") && data.network[k].rx > 0,
				);
				setIface(primary ?? null);

				if (primary && prevNetRef.current?.[primary] && lastFetchRef.current > 0) {
					const elapsed = (now - lastFetchRef.current) / 1000;
					const prev = prevNetRef.current[primary];
					setNetSpeed({
						rx: Math.max(0, (data.network[primary].rx - prev.rx) / elapsed),
						tx: Math.max(0, (data.network[primary].tx - prev.tx) / elapsed),
					});
				}

				prevNetRef.current = data.network;
				lastFetchRef.current = now;
				setStats(data);
			} catch {}
		};
		fetchStats();
		const id = setInterval(fetchStats, 4000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		// Seed with a REST snapshot so there's data immediately on mount,
		// then switch to the SSE stream for zero-request push updates.
		fetch("/api/power").then(r => r.ok ? r.json() : null).then(d => { if (d) setPower(d); }).catch(() => {});

		const es = new EventSource("/api/power/stream");
		es.onmessage = (e) => {
			try { setPower(JSON.parse(e.data)); } catch {}
		};
		// EventSource reconnects automatically on error — no extra handling needed.
		return () => es.close();
	}, []);

	return (
		<StatsContext.Provider value={{ stats, netSpeed, iface }}>
			<PowerContext.Provider value={{ power }}>
				{children}
			</PowerContext.Provider>
		</StatsContext.Provider>
	);
}
