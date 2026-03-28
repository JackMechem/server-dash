import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ACTIONS = ["start", "stop", "restart"];

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ service: string; action: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { service, action } = await params;

	if (!ALLOWED_ACTIONS.includes(action)) {
		return NextResponse.json({ error: "Invalid action" }, { status: 400 });
	}

	const res = await fetch(
		`http://localhost:3001/services/${service}/${action}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	);

	return NextResponse.json(await res.json(), { status: res.status });
}
