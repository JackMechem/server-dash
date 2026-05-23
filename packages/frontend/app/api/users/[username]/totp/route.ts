import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { username } = await params;

	const res = await fetch(`http://localhost:3001/users/${username}/totp`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!res.ok) return NextResponse.json({ error: "Failed to remove TOTP" }, { status: res.status });
	return NextResponse.json(await res.json());
}
