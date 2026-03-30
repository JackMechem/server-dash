import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const token = req.cookies.get("token")?.value;
	if (!token) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// hit an endpoint that actually requires auth
	const res = await fetch(
		"http://localhost:3001/services/server-dash-api/logs",
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);

	if (!res.ok) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return NextResponse.json({ success: true });
}
