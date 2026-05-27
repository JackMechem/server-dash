import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const res = await fetch("http://localhost:3001/smart-buttons", {
		headers: { Authorization: `Bearer ${token}` },
	});
	const data = await res.json();
	return NextResponse.json(data, { status: res.status });
}
