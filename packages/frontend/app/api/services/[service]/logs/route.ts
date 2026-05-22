import { NextRequest, NextResponse } from "next/server";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ service: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { service } = await params;

	const res = await fetch(`http://localhost:3001/services/${service}/logs`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	return NextResponse.json(await res.json(), { status: res.status });
}
