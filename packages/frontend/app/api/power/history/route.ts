import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const hours = req.nextUrl.searchParams.get("hours") ?? "24";
	const res = await fetch(`http://localhost:3001/power/history?hours=${hours}`);
	if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	return NextResponse.json(await res.json());
}
