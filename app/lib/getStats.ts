export interface Memory {
	total: number;
	used: number;
	available: number;
	percent: number;
}

export interface Cpu {
	percent: number;
	model: string;
	cores: number;
}

export interface Disk {
	total: number;
	used: number;
	available: number;
	percent: number;
}

export interface Uptime {
	seconds: number;
	days: number;
	hours: number;
	minutes: number;
}

export interface NetworkInterface {
	rx: number;
	tx: number;
}

export interface LoadAvg {
	"1m": number;
	"5m": number;
	"15m": number;
}

export interface Stats {
	timestamp: string;
	memory: Memory;
	cpu: Cpu;
	disk: Disk;
	uptime: Uptime;
	network: Record<string, NetworkInterface>;
	services: Record<string, string>;
	loadAvg: LoadAvg;
	temperature: number | null;
}

export async function getStats(): Promise<Stats> {
	const res = await fetch("/api/stats");

	if (res.status === 401) {
		throw new Error("UNAUTHORIZED");
	}

	if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
	return res.json() as Promise<Stats>;
}
