"use client";

import { useState, useEffect, useCallback } from "react";

export interface ButtonState { button: number; enabled: boolean; uptime_s: number; name?: string; }
export interface SmartButton { device_id: string; ip: string; name: string; device_name?: string; buttons: ButtonState[]; registered_at: string; last_seen: string; }

export function useSmartButtons() {
	const [devices, setDevices] = useState<SmartButton[]>([]);

	const load = useCallback(async () => {
		try {
			const r = await fetch("/api/smart-buttons");
			if (r.ok) setDevices(await r.json());
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
		load();

		const es = new EventSource("/api/smart-buttons/stream");
		es.onmessage = (e) => {
			try { setDevices(JSON.parse(e.data)); } catch { /* ignore */ }
		};
		es.onerror = () => {
			// On error, fall back to polling until the stream recovers
			load();
		};

		return () => es.close();
	}, [load]);

	return { devices, reload: load };
}
