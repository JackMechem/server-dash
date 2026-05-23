import { NextRequest, NextResponse } from "next/server";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { username } = await params;
	const body = await req.json();

	const res = await fetch(`http://localhost:3001/users/${username}/totp/confirm`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		return NextResponse.json({ error: text }, { status: res.status });
	}
	return NextResponse.json(await res.json());
}
