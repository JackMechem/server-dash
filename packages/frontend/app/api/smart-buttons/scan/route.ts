import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const res = await fetch("http://localhost:3001/smart-buttons/scan", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	}).catch(() => null);

	if (!res?.ok) return NextResponse.json({ error: "Scan failed" }, { status: 502 });
	return NextResponse.json(await res.json());
}
