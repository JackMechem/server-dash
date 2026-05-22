import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const { username, password } = await req.json();

	const res = await fetch("http://localhost:3001/auth/login", {
		method: "POST",
		headers: {
			Authorization:
				"Basic " +
				Buffer.from(`${username}:${password}`).toString("base64"),
		},
	});

	if (!res.ok) {
		const text = await res.text();
		return NextResponse.json({ error: text }, { status: 401 });
	}

	// Returns { session_id, challenge } — browser completes the WebAuthn step
	return NextResponse.json(await res.json());
}
