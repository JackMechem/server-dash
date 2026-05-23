import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const start = req.nextUrl.searchParams.get("start");
	const end = req.nextUrl.searchParams.get("end");

	let url: string;
	if (start && end) {
		url = `http://localhost:3001/power/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
	} else {
		const hours = req.nextUrl.searchParams.get("hours") ?? "24";
		url = `http://localhost:3001/power/history?hours=${hours}`;
	}

	const res = await fetch(url);
	if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	return NextResponse.json(await res.json());
}
