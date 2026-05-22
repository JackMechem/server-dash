import { NextRequest, NextResponse } from "next/server";

const ENROLLMENT_OPEN = process.env.ENROLLMENT_OPEN === "true";

export async function POST(req: NextRequest) {
	if (!ENROLLMENT_OPEN) {
		return new NextResponse(null, { status: 404 });
	}
	const body = await req.json();

	const res = await fetch("http://localhost:3001/auth/register/finish", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		return NextResponse.json({ error: "Registration failed" }, { status: 400 });
	}

	return NextResponse.json(await res.json());
}
