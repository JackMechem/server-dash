import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const body = await req.json();

	const res = await fetch("http://localhost:3001/auth/verify-totp", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		return NextResponse.json({ error: "Invalid TOTP code" }, { status: 401 });
	}

	const { token } = await res.json();
	const response = NextResponse.json({ success: true });
	response.cookies.set("token", token, {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		maxAge: 60 * 60 * 8,
		path: "/",
	});
	return response;
}
