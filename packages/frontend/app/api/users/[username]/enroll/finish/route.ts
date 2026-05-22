import { NextRequest, NextResponse } from "next/server";

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ username: string }> },
) {
	const token = req.cookies.get("token")?.value;
	if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	await params;
	const body = await req.json();

	const res = await fetch("http://localhost:3001/auth/register/finish", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!res.ok) return NextResponse.json({ error: "Registration failed" }, { status: 400 });
	return NextResponse.json(await res.json());
}
