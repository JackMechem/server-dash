import { NextRequest, NextResponse } from "next/server";

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { username } = await params;
	const body = await req.json();

	const res = await fetch(
		`http://localhost:3001/users/${encodeURIComponent(username)}/password`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify(body),
		},
	);

	if (!res.ok) return NextResponse.json({ error: "Failed to reset password" }, { status: res.status });
	return NextResponse.json({ success: true });
}
