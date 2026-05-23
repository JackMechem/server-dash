import { NextResponse } from "next/server";

// Coalesce concurrent requests: multiple callers within the TTL share one upstream fetch
let inFlight: Promise<unknown> | null = null;
let cache: { ts: number; data: unknown } | null = null;
const CACHE_TTL_MS = 100;

async function fetchPower(): Promise<unknown> {
	if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;
	if (inFlight) return inFlight;
	inFlight = fetch("http://localhost:3001/power")
		.then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
		.then(data => { cache = { ts: Date.now(), data }; inFlight = null; return data; })
		.catch(e => { inFlight = null; throw e; });
	return inFlight;
}

export async function GET() {
	try {
		return NextResponse.json(await fetchPower());
	} catch (e: unknown) {
		const status = e instanceof Error && /^\d+$/.test(e.message) ? Number(e.message) : 502;
		return NextResponse.json({ error: "Upstream error" }, { status });
	}
}
