import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ACTIONS = ["on", "off"];

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ device: string; action: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { device, action } = await params;

	if (!ALLOWED_ACTIONS.includes(action)) {
		return NextResponse.json({ error: "Invalid action" }, { status: 400 });
	}

	const res = await fetch(`http://localhost:3001/power/${device}/${action}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	});

	return new NextResponse(null, { status: res.status });
}
