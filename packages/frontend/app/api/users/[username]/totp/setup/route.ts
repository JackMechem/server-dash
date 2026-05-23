import { NextRequest, NextResponse } from "next/server";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { username } = await params;
	const { password } = await req.json();

	const res = await fetch(`http://localhost:3001/users/${username}/totp/setup`, {
		method: "POST",
		headers: {
			Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
		},
	});

	if (!res.ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
	return NextResponse.json(await res.json());
}
