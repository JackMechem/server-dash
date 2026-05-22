import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const res = await fetch("http://localhost:3001/users", {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	return NextResponse.json(await res.json());
}
