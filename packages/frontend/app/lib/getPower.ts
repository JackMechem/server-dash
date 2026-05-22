export interface TapoDevice {
	name: string;
	ip: string;
	alias: string;
	model: string;
	on: boolean;
	current_power_w: number;
	today_energy_wh: number;
	month_energy_wh: number;
	today_runtime_min: number;
	month_runtime_min: number;
}

export interface PowerData {
	timestamp: string;
	devices: TapoDevice[];
}

export async function getPower(): Promise<PowerData> {
	const res = await fetch("/api/power");
	if (!res.ok) throw new Error(`Failed to fetch power: ${res.status}`);
	return res.json() as Promise<PowerData>;
}
