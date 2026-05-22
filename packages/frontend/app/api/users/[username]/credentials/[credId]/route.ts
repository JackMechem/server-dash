import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string; credId: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { username, credId } = await params;

	const res = await fetch(
		`http://localhost:3001/users/${encodeURIComponent(username)}/credentials/${encodeURIComponent(credId)}`,
		{ method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
	);

	if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
	return NextResponse.json({ success: true });
}
